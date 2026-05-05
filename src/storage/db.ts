/**
 * IndexedDB 스키마 + 초기화.
 *
 * v1: records store + timestamp/coinType 인덱스.
 * 향후 마이그레이션은 onupgradeneeded 의 oldVersion 분기로.
 */

export const DB_NAME = "coffilens";
export const DB_VERSION = 1;
export const STORE_RECORDS = "records";

export interface RecordEntity {
  id: string;
  /** Date.now() — 정렬/인덱싱 기준 */
  timestamp: number;
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
  /**
   * 2026-05-02 추가 — archive view 에서 히스토그램/추출 가이드 재현용.
   * 모두 optional 로 schema 호환성 유지 (구 record 는 부분 표시).
   *
   * - diameters: 입자 직경 배열 (sieve-equivalent μm). 히스토그램 입력.
   *   typical 600~3000개, 8 bytes/value → 5~25KB per record.
   * - mmPerPixel: brewing-guide measurement confidence 라벨용.
   * - clumpsCount/AreaRatio: 클럼프 caveat 표시용.
   * - durationMs: 분석 시간 표시용.
   */
  diameters?: number[];
  mmPerPixel?: number;
  clumpsCount?: number;
  clumpsAreaRatio?: number;
  clumpsTotalAreaMm2?: number;
  /**
   * 2026-05-05 추가 — boulder/clump 분리 (Phase 1).
   * boulders = ≥1500µm 이지만 shape factor 가 단일 입자 형상 (boulder).
   * 구 record 는 미저장 → 0 fallback (UI 에 boulder 0 표시).
   */
  bouldersCount?: number;
  bouldersAreaRatio?: number;
  bouldersTotalAreaMm2?: number;
  totalAreaMm2?: number;
  particleCount?: number;
  durationMs?: number;
  /**
   * 2026-05-03 추가 — multi-shot averaging 누적 shot 수.
   * 1 = 단일 측정 (대부분 record), 2~N = N장 평균. UI 에 "N회 측정 평균"
   * 배지 표시. schema-less 라 v1 그대로, 구 record 는 1로 간주.
   */
  shotCount?: number;
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
        store.createIndex("coinType", "coinType", { unique: false });
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
