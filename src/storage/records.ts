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
  const full: RecordEntity = {
    id: input.id ?? generateId(),
    timestamp: input.timestamp ?? Date.now(),
    thumbnail: input.thumbnail,
    d50: input.d50,
    d10: input.d10,
    d90: input.d90,
    uniformity: input.uniformity,
    finesPercent: input.finesPercent,
    confidence: input.confidence,
    coinType: input.coinType,
    grinderMemo: input.grinderMemo,
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
