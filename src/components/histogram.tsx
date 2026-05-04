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
  // **bins 14** (2026-05-03 — 18 → 14):
  // 사용자 보고 — 18 bins 시 작은 입자 영역 (~200-300µm) 에 빈 bin 발생.
  // 원인: 작은 입자는 정수 픽셀 (3, 4, 5...) 라 직경이 quantized → 좁은 bin
  // 폭이 픽셀 점프보다 좁으면 빈 bin. Sturges 공식 (log₂(2823)+1 ≈ 13) 기준
  // 14 적정 — 분포 모양 정보 충분 보존하면서 quantization gap hide.
  bins = 14,
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
