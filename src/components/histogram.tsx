import { lazy, Suspense } from "react";

/**
 * Histogram — Recharts 동적 import 로 결과 화면 진입 시점에만 로드.
 *
 * Recharts 번들 ~100KB → 인트로/홈 번들 분리.
 */
const HistogramImpl = lazy(() => import("./histogram-impl"));

interface HistogramProps {
  diameters: number[];
  bins?: number;
  /** D10/D50/D90 (μm) — CDF 곡선 위 reference 점으로 표시. 미지정 시 표시 X */
  d10?: number;
  d50?: number;
  d90?: number;
}

export function Histogram({
  diameters,
  // bins 18 (2026-05-02 final): 25 에서 여전히 빈 bin 발생. P5-P95 범위로
  // bin 적용 (buildBins) + 18 bins 로 합치기. log-normal 분포의 dense 영역
  // 시각화 + outlier 는 leftmost/rightmost grey bar 로 별도 표시.
  bins = 18,
  d10,
  d50,
  d90,
}: HistogramProps) {
  return (
    <Suspense
      fallback={
        <div
          className="histogram-loading text-caption"
          aria-live="polite"
          style={{
            height: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-secondary)",
          }}
        >
          차트 로드 중...
        </div>
      }
    >
      <HistogramImpl
        diameters={diameters}
        bins={bins}
        d10={d10}
        d50={d50}
        d90={d90}
      />
    </Suspense>
  );
}
