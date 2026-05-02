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
  // bins 20 → 40 (2026-05-02 C4 개선): 분포 모양 정직 표현. 적은 bin 은
  // bimodal (fines peak + main peak) 을 단봉으로 평탄화시킴. 다른 AI 비평
  // "분포 너무 매끈" 대응. log binning 과 결합 시 작은 fines peak 도 가시화.
  bins = 40,
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
