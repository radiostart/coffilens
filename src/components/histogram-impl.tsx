import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface HistogramImplProps {
  diameters: number[];
  bins: number;
}

interface HistogramBin {
  range: number;
  count: number;
}

/**
 * DESIGN.md `--color-primary` 토큰 — Recharts Bar fill prop 은 CSS 변수
 * 직접 미지원이라 명시 상수. 토큰 변경 시 두 곳 동시 갱신 (DESIGN.md + 여기).
 */
const PRIMARY_COLOR = "#6B4423";

export default function HistogramImpl({
  diameters,
  bins,
}: HistogramImplProps) {
  const data = buildBins(diameters, bins);

  if (data.length === 0) {
    return (
      <p
        className="text-caption"
        style={{ color: "var(--color-text-secondary)", textAlign: "center" }}
      >
        표시할 데이터가 없어요.
      </p>
    );
  }

  return (
    <div
      role="img"
      aria-label={`입자 직경 분포 히스토그램 — ${diameters.length}개 입자`}
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <XAxis dataKey="range" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              fontSize: 12,
            }}
            formatter={(value) => [`${value}개`, "입자 수"]}
            labelFormatter={(label) => `${label}μm 부터`}
          />
          <Bar dataKey="count" fill={PRIMARY_COLOR} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * 직경 배열 → bin 데이터.
 *
 * sweep Issue 22 guard: min === max (단일 직경) → binWidth=0 → 모든 bin 비어버림.
 *  → 단일 bar 로 fallback (range = round(min), count = total).
 */
function buildBins(diameters: number[], bins: number): HistogramBin[] {
  if (diameters.length === 0) return [];
  const min = Math.min(...diameters);
  const max = Math.max(...diameters);
  const binWidth = (max - min) / bins;

  if (binWidth === 0) {
    return [{ range: Math.round(min), count: diameters.length }];
  }

  return Array.from({ length: bins }, (_, i) => {
    const lo = min + i * binWidth;
    const hi = min + (i + 1) * binWidth;
    const isLast = i === bins - 1;
    return {
      range: Math.round(lo),
      count: diameters.filter((d) => d >= lo && (isLast ? d <= hi : d < hi))
        .length,
    };
  });
}
