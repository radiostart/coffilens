/**
 * IndexedDB 스키마 + 초기화.
 *
 * v1: records store + timestamp/tool 인덱스.
 * 향후 마이그레이션은 onupgradeneeded 의 oldVersion 분기로.
 */

export const DB_NAME = "coffilens";
export const DB_VERSION = 1;
export const STORE_RECORDS = "records";

export interface RecordEntity {
  id: string;
  /** Date.now() — 정렬/인덱싱 기준 */
  timestamp: number;
  tool: string;
  /** JPEG q=0.7, ~50KB. lazy load (listRecordsMeta 에서 제외). */
  thumbnail: Blob;
  d50: number;
  d10: number;
  d90: number;
  uniformity: number;
  finesPercent: number;
  confidence: number;
  coinType: "100" | "500";
  /**
   * Phase 1 필드 — 그라인더 다이얼/원두 등 메모.
   *
   * Sweep Issue 23 (의도된 YAGNI 예외): IndexedDB 는 schema-less 라 새 필드 추가
   * 자체로는 v2 마이그레이션 불요. 단, 인덱스 필요해지면 v2. v1 에 미리 자리만 잡음.
   */
  grinderMemo?: string;
}

export type RecordMeta = Omit<RecordEntity, "thumbnail">;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("openDB error"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        const store = db.createObjectStore(STORE_RECORDS, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("tool", "tool", { unique: false });
      }
    };
  });

  return dbPromise;
}

/** 테스트용 — 캐시 리셋 + DB close (다음 openDB 가 재오픈) */
export async function _resetDbForTests(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      /* ignore */
    }
  }
  dbPromise = null;
}
