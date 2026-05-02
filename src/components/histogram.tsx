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
  bins = 20,
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
