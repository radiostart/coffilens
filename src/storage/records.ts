/**
 * IndexedDB records CRUD.
 *
 * 패턴: open → 단일 트랜잭션 → resolve/reject.
 * iOS Safari WKWebView 의 트랜잭션 inactive 버그 회피 위해 await 사이 트랜잭션
 * 분할 안 함 (단순 패턴 유지).
 */

import {
  openDB,
  STORE_RECORDS,
  type RecordEntity,
  type RecordMeta,
} from "./db";

type SaveInput = Omit<RecordEntity, "id" | "timestamp"> &
  Partial<Pick<RecordEntity, "id" | "timestamp">>;

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // iOS 15.3 이하 fallback — 충돌 가능성 매우 낮은 timestamp + random
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveRecord(input: SaveInput): Promise<RecordEntity> {
  // 입력 input 의 모든 필드를 복사 — diameters, mmPerPixel, clumps* 등
  // optional 필드 누락 방지 (이전 버그: 명시 복사 시 신규 필드 silently 탈락).
  const full: RecordEntity = {
    ...input,
    id: input.id ?? generateId(),
    timestamp: input.timestamp ?? Date.now(),
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, "readwrite");
    tx.objectStore(STORE_RECORDS).put(full);
    tx.oncomplete = () => resolve(full);
    tx.onerror = () =>
      reject(tx.error ?? new Error("saveRecord transaction failed"));
  });
}

/**
 * thumbnail 제외한 메타만 — 100건+ 시 N+1 방지.
 *
 * 정렬: timestamp 인덱스 prev cursor (최신순).
 *
 * Sweep Issue 25 메모: 현재 모든 record 풀스캔. Phase 1 에서 limit/cursor 페이징 검토.
 */
export async function listRecordsMeta(): Promise<RecordMeta[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, "readonly");
    const store = tx.objectStore(STORE_RECORDS);
    const index = store.index("timestamp");
    const results: RecordMeta[] = [];
    const cursorReq = index.openCursor(null, "prev");
    cursorReq.onsuccess = () => {
      const c = cursorReq.result;
      if (c) {
        const value = c.value as RecordEntity;
        const meta: RecordMeta = {
          id: value.id,
          timestamp: value.timestamp,
          d50: value.d50,
          d10: value.d10,
          d90: value.d90,
          uniformity: value.uniformity,
          finesPercent: value.finesPercent,
          confidence: value.confidence,
          coinType: value.coinType,
          grinderMemo: value.grinderMemo,
        };
        results.push(meta);
        c.continue();
      } else {
        resolve(results);
      }
    };
    cursorReq.onerror = () =>
      reject(cursorReq.error ?? new Error("listRecordsMeta cursor failed"));
  });
}

/** 단일 thumbnail lazy load — 화면에 진입한 카드만 호출 */
export async function getThumbnail(id: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, "readonly");
    const req = tx.objectStore(STORE_RECORDS).get(id);
    req.onsuccess = () => {
      const value = req.result as RecordEntity | undefined;
      resolve(value?.thumbnail ?? null);
    };
    req.onerror = () =>
      reject(req.error ?? new Error("getThumbnail failed"));
  });
}

/**
 * 저장된 RecordEntity → PipelineResult-like 변환.
 *
 * archive view (홈에서 과거 기록 클릭) 시 result.tsx 가 그대로 사용 가능하도록
 * 모양을 맞춤. 구 record (diameters/mmPerPixel 미저장) 는 fallback 으로 빈 배열
 * + 0 채움 — UI 가 부분 표시.
 */
export function recordToPipelineResult(
  r: RecordEntity,
): import("../opencv/pipeline").PipelineResult {
  const coinDiameterMm = r.coinType === "500" ? 26.5 : 24;
  const mmPerPixel = r.mmPerPixel ?? 0; // 구 record fallback (0 → confidence 'low')
  const radiusPx = mmPerPixel > 0 ? coinDiameterMm / 2 / mmPerPixel : 0;
  return {
    stats: {
      d10: r.d10,
      d50: r.d50,
      d90: r.d90,
      uniformity: r.uniformity,
      finesPercent: r.finesPercent,
      particleCount: r.particleCount ?? 0,
      totalAreaMm2: r.totalAreaMm2 ?? 0,
      diameters: r.diameters ?? [], // 빈 배열 → 히스토그램 비어있게 렌더
      clumps: {
        count: r.clumpsCount ?? 0,
        totalAreaMm2: r.clumpsTotalAreaMm2 ?? 0,
        areaRatio: r.clumpsAreaRatio ?? 0,
      },
    },
    coin: {
      centerX: 0,
      centerY: 0,
      radiusPx,
      coinType: r.coinType,
      diameterMm: coinDiameterMm,
      mmPerPixel,
      confidence: r.confidence / 10, // score 0~10 → 0~1
    },
    confidence: {
      score: r.confidence,
      signals: { coin: 0, particles: 0, brightness: 0, blur: 0 }, // 구체 신호 미저장
      warning: false,
    },
    durationMs: r.durationMs ?? 0,
  };
}

/** 단일 record full load — archive view 진입 시 호출 (diameters[] 포함) */
export async function getRecord(id: string): Promise<RecordEntity | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, "readonly");
    const req = tx.objectStore(STORE_RECORDS).get(id);
    req.onsuccess = () => {
      const value = req.result as RecordEntity | undefined;
      resolve(value ?? null);
    };
    req.onerror = () =>
      reject(req.error ?? new Error("getRecord failed"));
  });
}

export async function deleteRecord(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, "readwrite");
    tx.objectStore(STORE_RECORDS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("deleteRecord transaction failed"));
  });
}

/** 가장 오래된 N개 삭제 — 쿼터 자동 정리 */
export async function deleteOldest(n: number): Promise<number> {
  if (n <= 0) return 0;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, "readwrite");
    const store = tx.objectStore(STORE_RECORDS);
    const index = store.index("timestamp");
    const cursorReq = index.openCursor(null, "next"); // 오래된순
    let deleted = 0;
    cursorReq.onsuccess = () => {
      const c = cursorReq.result;
      if (c && deleted < n) {
        c.delete();
        deleted++;
        c.continue();
      } else {
        resolve(deleted);
      }
    };
    cursorReq.onerror = () =>
      reject(cursorReq.error ?? new Error("deleteOldest cursor failed"));
  });
}

/** 테스트용 — 모든 records 삭제 */
export async function _clearAllForTests(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, "readwrite");
    tx.objectStore(STORE_RECORDS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("clear failed"));
  });
}
