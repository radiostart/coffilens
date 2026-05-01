/**
 * IndexedDB 쿼터 관리.
 *
 * navigator.storage.estimate 90% 도달 시 가장 오래된 10개 삭제.
 * Safari 미지원 버전은 needsCleanup=false 로 폴백.
 */

import { deleteOldest, listRecordsMeta } from "./records";

const QUOTA_THRESHOLD_RATIO = 0.9;
const CLEANUP_BATCH = 10;
/** records 가 이보다 적으면 cleanup 효과 없음 (다른 원인 — 이미지가 너무 큼 등) */
const MIN_RECORDS_FOR_CLEANUP = 11;

export interface QuotaStatus {
  usage: number;
  quota: number;
  /** usage / quota — Safari 미지원 시 0 */
  ratio: number;
  needsCleanup: boolean;
}

export async function checkQuota(): Promise<QuotaStatus> {
  if (
    typeof navigator === "undefined" ||
    !navigator.storage ||
    typeof navigator.storage.estimate !== "function"
  ) {
    return { usage: 0, quota: Infinity, ratio: 0, needsCleanup: false };
  }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const ratio = quota > 0 ? usage / quota : 0;
  return {
    usage,
    quota,
    ratio,
    needsCleanup: ratio >= QUOTA_THRESHOLD_RATIO,
  };
}

/**
 * 자동 정리 — 저장 직전 호출.
 *
 * @returns 삭제된 record 개수 (0 이면 정리 불필요 또는 record 부족)
 */
export async function ensureQuota(): Promise<number> {
  const status = await checkQuota();
  if (!status.needsCleanup) return 0;

  const meta = await listRecordsMeta();
  if (meta.length < MIN_RECORDS_FOR_CLEANUP) {
    // record 가 거의 없는데 쿼터 초과 — 이미지가 너무 크거나 다른 데이터 원인
    return 0;
  }

  return deleteOldest(CLEANUP_BATCH);
}

export const _internal = { QUOTA_THRESHOLD_RATIO, CLEANUP_BATCH };
