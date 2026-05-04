# F08 — Storage & Exit Modal

**Status**: 🟡 미시작
**Estimated effort**: 1 day (D9)
**Dependencies**: F07 (PipelineResult)
**Blocks**: F09 (텔레메트리에서 저장 이벤트 전송)
**plain.md 참조**: Section 4-3 (종료 모달), Section 11 (IndexedDB 쿼터), Section 12 (storage/, stores/)

---

## 목표

IndexedDB 스키마 + CRUD + **쿼터 자동 정리** + Zustand 히스토리 store (meta + thumbnails 분리, N+1 방지) + 종료 모달 (텍스트 정확 매치는 F09 D10).

---

## 산출물

### 신규 파일
- `src/storage/db.ts` — IndexedDB 초기화 + 마이그레이션
- `src/storage/records.ts` — CRUD
- `src/storage/quota.ts` — navigator.storage.estimate + 자동 정리
- `src/stores/history.store.ts` — Zustand (meta + thumbnails 슬라이스)
- `src/components/exit-modal.tsx` — 종료 모달 (텍스트 placeholder, F09 에서 정확 매치)
- `tests/storage/quota.test.ts` — 임계 시나리오 단위 테스트

### 수정 파일
- `src/stores/measurement.store.ts` — `saveResult()` 액션 (history.store 호출)
- `src/routes/result.tsx` — 저장 버튼 → `saveResult()` 호출
- `src/routes/home.tsx` — `useHistoryStore` 통합 (실제 records 로드)

---

## 구현 디테일

### storage/db.ts (스키마)
```ts
const DB_NAME = 'coffilens';
const DB_VERSION = 1;
const STORE_RECORDS = 'records';

export interface RecordEntity {
  id: string;             // crypto.randomUUID()
  timestamp: number;
  tool: string;
  thumbnail: Blob;        // JPEG q=70, ~50KB
  d50: number;
  d10: number;
  d90: number;
  uniformity: number;
  finesPercent: number;
  confidence: number;     // 0~10
  coinType: '100' | '500';
  grinderMemo?: string;   // Phase 1 필드 (지금 추가, 나중 활용)
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        const store = db.createObjectStore(STORE_RECORDS, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('tool', 'tool', { unique: false });
      }
    };
  });
  return dbPromise;
}
```

### storage/records.ts
```ts
import { openDB, RecordEntity, STORE_RECORDS } from './db';

export async function saveRecord(record: Omit<RecordEntity, 'id' | 'timestamp'> & Partial<Pick<RecordEntity, 'id' | 'timestamp'>>): Promise<RecordEntity> {
  const full: RecordEntity = {
    id: record.id ?? crypto.randomUUID(),
    timestamp: record.timestamp ?? Date.now(),
    ...record,
  } as RecordEntity;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, 'readwrite');
    tx.objectStore(STORE_RECORDS).put(full);
    tx.oncomplete = () => resolve(full);
    tx.onerror = () => reject(tx.error);
  });
}

/** 메타데이터만 (thumbnail 제외) — N+1 방지 */
export async function listRecordsMeta(): Promise<Omit<RecordEntity, 'thumbnail'>[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, 'readonly');
    const store = tx.objectStore(STORE_RECORDS);
    const index = store.index('timestamp');
    const results: any[] = [];
    const cursor = index.openCursor(null, 'prev'); // 최신순
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (c) {
        const { thumbnail, ...meta } = c.value;
        results.push(meta);
        c.continue();
      } else {
        resolve(results);
      }
    };
    cursor.onerror = () => reject(cursor.error);
  });
}

/** 단일 thumbnail 만 lazy load */
export async function getThumbnail(id: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, 'readonly');
    const req = tx.objectStore(STORE_RECORDS).get(id);
    req.onsuccess = () => resolve(req.result?.thumbnail ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRecord(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, 'readwrite');
    tx.objectStore(STORE_RECORDS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteOldest(n: number): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, 'readwrite');
    const store = tx.objectStore(STORE_RECORDS);
    const index = store.index('timestamp');
    const cursor = index.openCursor(null, 'next'); // 오래된순
    let deleted = 0;
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (c && deleted < n) {
        c.delete();
        deleted++;
        c.continue();
      } else {
        resolve(deleted);
      }
    };
    cursor.onerror = () => reject(cursor.error);
  });
}
```

### storage/quota.ts
```ts
import { deleteOldest, listRecordsMeta } from './records';

const QUOTA_THRESHOLD_RATIO = 0.9; // 90% 도달 시 정리
const CLEANUP_BATCH = 10;          // 한번에 10개 삭제

export interface QuotaStatus {
  usage: number;
  quota: number;
  ratio: number;
  needsCleanup: boolean;
}

export async function checkQuota(): Promise<QuotaStatus> {
  if (!navigator.storage?.estimate) {
    return { usage: 0, quota: Infinity, ratio: 0, needsCleanup: false };
  }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const ratio = quota > 0 ? usage / quota : 0;
  return { usage, quota, ratio, needsCleanup: ratio >= QUOTA_THRESHOLD_RATIO };
}

/** 자동 정리 — 저장 전 호출. 정리된 개수 반환. */
export async function ensureQuota(): Promise<number> {
  const status = await checkQuota();
  if (!status.needsCleanup) return 0;

  const records = await listRecordsMeta();
  if (records.length <= CLEANUP_BATCH) return 0; // 거의 없는데 쿼터 초과? 다른 원인 (이미지 너무 큼) — 일단 통과

  return deleteOldest(CLEANUP_BATCH);
}
```

### stores/history.store.ts
```ts
import { create } from 'zustand';
import { listRecordsMeta, saveRecord, getThumbnail, deleteRecord } from '../storage/records';
import { ensureQuota } from '../storage/quota';

type RecordMeta = Omit<RecordEntity, 'thumbnail'>;

interface HistoryState {
  meta: RecordMeta[];
  thumbnails: Map<string, string>; // id → blob URL
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  save: (record: Omit<RecordEntity, 'id' | 'timestamp'>) => Promise<RecordEntity>;
  loadThumbnail: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  meta: [],
  thumbnails: new Map(),
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const meta = await listRecordsMeta();
      set({ meta, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  save: async (record) => {
    const cleanedCount = await ensureQuota();
    if (cleanedCount > 0) {
      // 사용자에게 안내 토스트
      console.info(`오래된 기록 ${cleanedCount}개를 정리했어요`);
    }
    const full = await saveRecord(record);
    set(state => ({ meta: [{ ...full, thumbnail: undefined as any }, ...state.meta] }));
    return full;
  },

  loadThumbnail: async (id) => {
    if (get().thumbnails.has(id)) return;
    const blob = await getThumbnail(id);
    if (blob) {
      const url = URL.createObjectURL(blob);
      set(state => ({ thumbnails: new Map(state.thumbnails).set(id, url) }));
    }
  },

  remove: async (id) => {
    await deleteRecord(id);
    // 메모리 누수 방지: 표시 중이던 thumbnail 의 ObjectURL 회수
    const existingUrl = get().thumbnails.get(id);
    if (existingUrl) URL.revokeObjectURL(existingUrl);
    set(state => ({
      meta: state.meta.filter(m => m.id !== id),
      thumbnails: (() => { const m = new Map(state.thumbnails); m.delete(id); return m; })(),
    }));
  },
}));
```

### components/exit-modal.tsx (placeholder, F09에서 정확 매치)
```tsx
export function ExitModal({ open, onCancel, onExit }: { open: boolean; onCancel: () => void; onExit: () => void }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <p>커피렌즈를 종료할까요?</p>
        <div className="actions">
          <button onClick={onCancel}>취소</button>
          <button onClick={onExit}>종료하기</button>
        </div>
      </div>
    </div>
  );
}
```

### Thumbnail 생성 (PipelineResult 저장 시)
```ts
// src/lib/thumbnail.ts
export async function makeThumbnail(canvas: HTMLCanvasElement, maxSize = 320): Promise<Blob> {
  const scale = maxSize / Math.max(canvas.width, canvas.height);
  const dst = document.createElement('canvas');
  dst.width = Math.round(canvas.width * scale);
  dst.height = Math.round(canvas.height * scale);
  dst.getContext('2d')!.drawImage(canvas, 0, 0, dst.width, dst.height);
  return new Promise(r => dst.toBlob(b => r(b!), 'image/jpeg', 0.7));
}
```

---

## 수용 기준

- [ ] IndexedDB 스키마 v1 정상 생성, records store + timestamp/tool 인덱스
- [ ] `saveRecord()` → `listRecordsMeta()` round-trip 정상
- [ ] `listRecordsMeta()` 가 thumbnail 제외 (N+1 방지 확인)
- [ ] `getThumbnail(id)` 가 lazy load 동작
- [ ] **쿼터 90% 도달 시 자동으로 가장 오래된 10개 삭제 + 사용자 안내**
- [ ] 100건 저장 → 메모리 누수 없음 (Mat lifecycle 검증, F03 와 통합 베타에서)
- [ ] 결과 화면 "측정 저장" → IndexedDB 저장 + 홈으로 복귀
- [ ] 홈 화면이 listRecordsMeta() 결과를 가상 스크롤로 표시 (단순 리스트 OK, 100건 이상 시 가상 스크롤)
- [ ] 종료 모달 placeholder 동작 (텍스트 정확 매치는 F09)

---

## 테스트

### tests/storage/quota.test.ts
```ts
// navigator.storage.estimate mock
- usage/quota = 0.5 → needsCleanup false
- 0.9 → needsCleanup true
- 0.95 → needsCleanup true
- ensureQuota: cleanup 안 필요 → 0 반환
- ensureQuota: cleanup 필요 + records 100개 → 10 반환
- ensureQuota: cleanup 필요 + records 5개 → 0 반환 (다른 원인)
```

### tests/storage/records.test.ts (fake-indexeddb 사용)
- saveRecord → listRecordsMeta thumbnail 제외 확인
- getThumbnail lazy load
- deleteOldest n개 정확
- timestamp 인덱스 prev cursor → 최신순

### tests/stores/history.store.test.ts
- save → meta 즉시 반영
- load → 비동기 후 meta 채워짐
- remove → meta + thumbnails 동시 제거

---

## 검수 영향

- **plain.md Section 4-3** (종료 모달) — 이 feature 는 placeholder, F09 D10 에서 정확 매치 검증
- 데이터 저장 자체는 검수 항목 아님 (로컬 only)

---

## 위험 / 함정

- ⚠️ **IndexedDB Safari 버그**: iOS Safari WKWebView 일정 버전에서 IndexedDB 트랜잭션이 inactive 상태 진입 빠름. `await` 사이에 다른 트랜잭션 시작 시 issue. 단순 패턴 (open → put → close) 유지.
- ⚠️ **navigator.storage.estimate Safari 미지원 버전**: `if (navigator.storage?.estimate)` 가드. 미지원 시 needsCleanup=false (정리 안 함, 단 100건 도달 시 강제 정리 별도 로직 권장)
- ⚠️ **Thumbnail Blob 메모리**: `URL.createObjectURL` 호출 후 `revokeObjectURL` 안 하면 누수. `remove()` 액션에서 회수 ★구현 됨. 컴포넌트 unmount 시 표시 중이던 URL 도 별도 cleanup hook 필요 — 컨슈머 (history list) 에서 useEffect cleanup 으로.
- ⚠️ **crypto.randomUUID iOS 15.4+**: 그 이전은 fallback. `crypto.randomUUID?.() ?? generateUUIDFallback()`
- ⚠️ **ensureQuota 동시성**: 두 측정이 동시에 저장 시도 → cleanup 중복. mutex 또는 단순 큐 (보통 사용자가 동시 측정 안 함)

---

## 참조

- [plain.md Section 11 (IndexedDB 쿼터)](../plain.md)
- [plain.md Section 12 (storage/, stores/)](../plain.md)
- [MDN: IndexedDB](https://developer.mozilla.org/docs/Web/API/IndexedDB_API)
- [MDN: navigator.storage.estimate](https://developer.mozilla.org/docs/Web/API/StorageManager/estimate)

---

## Handoff Notes

데이터 레이어 + 종료 모달 placeholder. 종료 모달 텍스트 정확 매치는 F09 D10 에 검증 (토스 비게임 가이드 문서 대조).

**meta + thumbnails 분리는 N+1 방지 핵심**. 100건+ 측정 후 홈 화면 진입 시 thumbnail 100개 한꺼번에 로드하면 UI 끊김. 가상 스크롤 + 화면 진입 시점 lazy load 패턴 유지.

`grinderMemo` 필드는 Phase 1 그라인더 다이얼 메모 위해 미리 추가. 지금은 항상 `undefined` 저장. 스키마 v2 마이그레이션 비용 줄이기 위함.

다음 feature (F09) 가 텔레메트리. 이 feature 의 `save` 액션 안에서 텔레메트리 이벤트 (`measurement_success`) 전송 호출 추가.
