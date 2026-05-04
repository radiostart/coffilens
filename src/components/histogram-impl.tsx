import { useMemo, useState } from "react";
import {
  Bar,
  Cell,
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./histogram-impl.css";

interface HistogramImplProps {
  diameters: number[];
  bins: number;
  d10?: number;
  d50?: number;
  d90?: number;
}

interface HistogramBin {
  /** Bin 의 왼쪽 가장자리 (X축 위치, μm). outlier bin 은 log-space 가상 위치. */
  range: number;
  /** Bin 의 오른쪽 가장자리 (μm). 테이블 구간 표시용. */
  rangeMax: number;
  /** 이 bin 에 속한 raw 입자 개수. Bar dataKey, Y축. */
  count: number;
  /** count / total × 100. tooltip + 테이블 표시용. */
  percentage: number;
  /**
   * "fines"  = lowerBound 미만 (작은 outlier),
   * "coarse" = upperBound 초과 (큰 outlier),
   * undefined = 정규 dense bin.
   */
  outlier?: "fines" | "coarse";
  /** outlier bin 의 실제 최소값 (table 표시용). dense bin 은 undefined. */
  actualMin?: number;
  /** outlier bin 의 실제 최대값. */
  actualMax?: number;
}

interface AnnotatedBin extends HistogramBin {
  displayCount: number;
  inCore: boolean;
}

// 200µm 미만은 sub-pixel noise — main bin 에서 빼고 fines outlier 로 collapse.
// computeStats 의 FINES_THRESHOLD 와 별개 (binning 표시용).
const MIN_DISPLAY_DIAMETER_UM = 200;
// outlier bin 이 Y 차지해 mid bars 압축되는 문제 방지 — P75 × 1.5 까지만 표시.
const Y_AXIS_PERCENTILE = 0.75;
const Y_AXIS_DOMAIN_MULTIPLIER = 1.5;

const PRIMARY_STRONG = "#6B4423";
const PRIMARY_SUBTLE = "rgba(107, 68, 35, 0.20)";
const BAND_COLOR = "rgba(74, 139, 92, 0.07)";
const MARKER_COLOR = "#C97B3F";
const MARKER_STRONG = "#A85F2E";
const LABEL_COLOR = "#1A1410";
const VALUE_COLOR = "#6B6157";

/**
 * X축 아래 marker — ▼ + 한국어 라벨 + μm 값 (3행 텍스트). D50 은 "strong" variant.
 *
 * Recharts ReferenceLine `label` 슬롯은 viewBox 로 라인 절대 좌표 (x = 라인 위치,
 * y = chart top, height = chart height) 전달. Bar 와 충돌 X.
 */
function MarkerLabel(props: {
  viewBox?: { x: number; y: number; height: number };
  title: string;
  value: string;
  variant?: "default" | "strong";
}) {
  const { viewBox, title, value, variant = "default" } = props;
  if (!viewBox) return null;
  const baseY = viewBox.y + viewBox.height;
  const isStrong = variant === "strong";
  return (
    <g aria-hidden="true">
      <text
        x={viewBox.x}
        y={baseY + 12}
        textAnchor="middle"
        fontSize={isStrong ? 12 : 10}
        fill={isStrong ? MARKER_STRONG : MARKER_COLOR}
      >
        ▼
      </text>
      <text
        x={viewBox.x}
        y={baseY + 28}
        textAnchor="middle"
        fontSize={isStrong ? 12 : 11}
        fontWeight={isStrong ? 700 : 600}
        fill={LABEL_COLOR}
      >
        {title}
      </text>
      <text
        x={viewBox.x}
        y={baseY + 44}
        textAnchor="middle"
        fontSize={isStrong ? 11 : 10}
        fontWeight={isStrong ? 600 : 400}
        fill={isStrong ? LABEL_COLOR : VALUE_COLOR}
      >
        {value}
      </text>
    </g>
  );
}

export default function HistogramImpl({
  diameters,
  bins,
  d10,
  d50,
  d90,
}: HistogramImplProps) {
  const [expanded, setExpanded] = useState(false);

  const { data, countDomainMax, totalCount } = useMemo(() => {
    const rawData = buildBins(diameters, bins);
    const sortedCounts = rawData
      .map((d) => d.count)
      .filter((c) => c > 0)
      .sort((a, b) => a - b);
    const p75Idx = Math.floor(sortedCounts.length * Y_AXIS_PERCENTILE);
    const p75Count = sortedCounts[p75Idx] ?? 1;
    const cap = Math.max(1, Math.round(p75Count * Y_AXIS_DOMAIN_MULTIPLIER));

    // recharts 의 domain max + clipPath 가 라운드 corner 를 같이 잘라내므로
    // displayCount 로 데이터 자체를 cap. tooltip/table 은 raw `count` 사용.
    const annotated: AnnotatedBin[] = rawData.map((b) => ({
      ...b,
      displayCount: Math.min(b.count, cap),
      inCore:
        !b.outlier &&
        d10 !== undefined &&
        d90 !== undefined &&
        b.range >= d10 &&
        b.range <= d90,
    }));
    const total = rawData.reduce((sum, d) => sum + d.count, 0);
    return { data: annotated, countDomainMax: cap, totalCount: total };
  }, [diameters, bins, d10, d90]);

  if (data.length === 0) {
    return <p className="text-caption histogram-empty">표시할 데이터가 없어요.</p>;
  }

  const markers: Array<{
    x: number;
    title: string;
    variant: "default" | "strong";
  }> = [];
  if (d10 !== undefined)
    markers.push({ x: d10, title: "작은쪽", variant: "default" });
  if (d50 !== undefined)
    markers.push({ x: d50, title: "중앙", variant: "strong" });
  if (d90 !== undefined)
    markers.push({ x: d90, title: "큰쪽", variant: "default" });

  return (
    <div
      role="img"
      aria-label={`입자 직경 분포 — ${diameters.length}개 입자, 작은쪽 ${
        d10 !== undefined ? Math.round(d10) : "?"
      }μm, 중앙 ${d50 !== undefined ? Math.round(d50) : "?"}μm, 큰쪽 ${
        d90 !== undefined ? Math.round(d90) : "?"
      }μm`}
    >
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={data}
          margin={{ top: 32, right: 16, left: 16, bottom: 60 }}
          barCategoryGap="20%"
        >
          {/* 커피 분쇄는 log-normal (Rosin-Rammler) — log scale 이 자연스러운 bell. */}
          <XAxis
            dataKey="range"
            type="number"
            scale="log"
            domain={["dataMin", "dataMax"]}
            tick={false}
            axisLine={{ stroke: "var(--color-border)" }}
          />
          {/* 동적 Y range — outlier 가 Y 차지하지 않도록 cap, 초과 bar 는 clip. */}
          <YAxis
            yAxisId="count"
            orientation="left"
            domain={[0, countDomainMax]}
            allowDataOverflow
            hide
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              fontSize: 12,
            }}
            formatter={(value, name, item) => {
              if (value === null || value === undefined) return ["—", name];
              const numValue = typeof value === "number" ? value : Number(value);
              if (Number.isNaN(numValue)) return ["—", name];
              if (name === "입자 개수") {
                const payload = item?.payload as
                  | { count?: number; percentage?: number }
                  | undefined;
                const actualCount = payload?.count ?? Math.round(numValue);
                const pct = payload?.percentage;
                const pctStr =
                  typeof pct === "number" ? ` (${pct.toFixed(1)}%)` : "";
                return [`${actualCount}개${pctStr}`, name];
              }
              return [`${numValue}`, name];
            }}
            labelFormatter={(label) => `${label}μm 부터`}
          />
          {d10 !== undefined && d90 !== undefined && (
            <ReferenceArea
              yAxisId="count"
              x1={Math.round(d10)}
              x2={Math.round(d90)}
              fill={BAND_COLOR}
              stroke="none"
              ifOverflow="extendDomain"
            />
          )}
          <Bar
            dataKey="displayCount"
            name="입자 개수"
            yAxisId="count"
            fill={PRIMARY_STRONG}
            radius={[6, 6, 0, 0]}
            isAnimationActive={false}
          >
            {data.map((entry, i) => (
              <Cell
                key={`bar-${i}`}
                fill={entry.inCore ? PRIMARY_STRONG : PRIMARY_SUBTLE}
              />
            ))}
          </Bar>
          {markers.map((m) => {
            const isStrong = m.variant === "strong";
            return (
              <ReferenceLine
                key={m.title}
                yAxisId="count"
                x={Math.round(m.x)}
                stroke={isStrong ? MARKER_STRONG : MARKER_COLOR}
                strokeWidth={isStrong ? 2 : 1.5}
                strokeDasharray={isStrong ? "5 3" : "3 3"}
                ifOverflow="extendDomain"
                label={
                  <MarkerLabel
                    title={m.title}
                    value={`${Math.round(m.x)}μm`}
                    variant={m.variant}
                  />
                }
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="histogram-toggle-wrapper">
        <button
          type="button"
          className="histogram-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="histogram-data-table"
        >
          <span>구간별 데이터 {expanded ? "닫기" : "펼치기"}</span>
          <span aria-hidden="true">{expanded ? "▲" : "▼"}</span>
        </button>
        {expanded && (
          <div
            id="histogram-data-table"
            role="region"
            aria-label="구간별 입자 분포 데이터"
            className="histogram-table-wrap"
          >
            <table className="histogram-table">
              <thead>
                <tr>
                  <th scope="col" className="col-range">
                    구간 (μm)
                  </th>
                  <th scope="col" className="col-count">
                    개수
                  </th>
                  <th scope="col" className="col-percent">
                    비율
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((bin, i) => {
                  const isOutlier = bin.outlier !== undefined;
                  // outlier 행은 actualMin~actualMax 으로 실제 측정 입자 범위 노출
                  // → 사용자가 검출 한계 ("최소 170µm 까지만 측정") 시각 인지 가능.
                  const rangeText = isOutlier
                    ? bin.outlier === "fines"
                      ? `${bin.actualMin} ~ ${bin.actualMax} (작은쪽)`
                      : `${bin.actualMin} ~ ${bin.actualMax} (큰쪽)`
                    : `${bin.range} ~ ${bin.rangeMax}`;
                  const rowClass = isOutlier
                    ? "histogram-table-outlier"
                    : bin.inCore
                      ? "histogram-table-core"
                      : "histogram-table-side";
                  return (
                    <tr key={`row-${i}`} className={rowClass}>
                      <td className="col-range">{rangeText}</td>
                      <td className="col-count">{bin.count}</td>
                      <td className="col-percent">
                        {bin.percentage.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
                <tr className="histogram-table-totals">
                  <td className="col-range">합계</td>
                  <td className="col-count">{totalCount}</td>
                  <td className="col-percent">100.0%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 직경 배열 → bin 데이터 (dense P5~P95 + outlier 양쪽 끝). **log binning**.
 *
 * 결과 array 구조:
 *   [0]            fines outlier (lowerBound 미만, count > 0 일 때만)
 *   [1..bins]      dense bins (lowerBound~upperBound, log-uniform)
 *   [last]         coarse outlier (upperBound 초과, count > 0 일 때만)
 *
 * outlier bar 의 X 위치는 인접 dense bin 보다 한 step 바깥 (log-space).
 * 실제 입자 range 는 actualMin/actualMax 에 별도 보존 → table 에 정확 범위 표시.
 *
 * Issue 22: min === max → 단일 bar fallback.
 */
function buildBins(diameters: number[], bins: number): HistogramBin[] {
  if (diameters.length === 0) return [];
  const sorted = [...diameters].sort((a, b) => a - b);
  const total = sorted.length;
  // P5 가 200µm 미만이면 200 부터 main bin 시작 — sub-200 노이즈는 fines outlier.
  const p5Index = Math.floor(total * 0.05);
  const p95Index = Math.floor(total * 0.95);
  const lowerBound = Math.max(
    sorted[Math.min(p5Index, total - 1)],
    MIN_DISPLAY_DIAMETER_UM,
  );
  const upperBound = sorted[Math.min(p95Index, total - 1)];

  const logMin = Math.log10(lowerBound);
  const logMax = Math.log10(upperBound);
  const logBinWidth = (logMax - logMin) / bins;

  if (logBinWidth <= 0) {
    return [
      {
        range: Math.round(lowerBound),
        rangeMax: Math.round(lowerBound),
        count: total,
        percentage: 100,
      },
    ];
  }

  const result: HistogramBin[] = [];

  const finesCount = sorted.filter((d) => d < lowerBound).length;
  if (finesCount > 0) {
    const finesPos = Math.pow(10, logMin - logBinWidth);
    result.push({
      range: Math.round(finesPos),
      rangeMax: Math.round(lowerBound),
      count: finesCount,
      percentage: (finesCount / total) * 100,
      outlier: "fines",
      actualMin: Math.round(sorted[0]),
      actualMax: Math.round(lowerBound),
    });
  }

  for (let i = 0; i < bins; i++) {
    const lo = Math.pow(10, logMin + i * logBinWidth);
    const hi = Math.pow(10, logMin + (i + 1) * logBinWidth);
    const isLast = i === bins - 1;
    const count = diameters.filter((d) =>
      isLast ? d >= lo && d <= hi : d >= lo && d < hi,
    ).length;
    result.push({
      range: Math.round(lo),
      rangeMax: Math.round(hi),
      count,
      percentage: (count / total) * 100,
    });
  }

  const coarseCount = sorted.filter((d) => d > upperBound).length;
  if (coarseCount > 0) {
    const coarsePosMax = Math.pow(10, logMax + logBinWidth);
    result.push({
      range: Math.round(upperBound),
      rangeMax: Math.round(coarsePosMax),
      count: coarseCount,
      percentage: (coarseCount / total) * 100,
      outlier: "coarse",
      actualMin: Math.round(upperBound),
      actualMax: Math.round(sorted[sorted.length - 1]),
    });
  }

  return result;
}
