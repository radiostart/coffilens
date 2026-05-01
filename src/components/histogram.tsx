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
}

export function Histogram({ diameters, bins = 20 }: HistogramProps) {
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
      <HistogramImpl diameters={diameters} bins={bins} />
    </Suspense>
  );
}
