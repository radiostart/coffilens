import { useMemo, useState } from "react";
import {
  Bar,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { volumeWeightedPercentile } from "../opencv/statistics";
import "./histogram-impl.css";

/**
 * **분포 line 5-zone average (2026-05-05)** — 5 구역의 bar 평균 높이를 잇는 선.
 *
 * 분포 형상 (PDF, peak/valley) 표현. 구역 = 부피 누적 % 경계. 구역 안의 dense bin
 * weight 들을 평균해 line Y 로 사용 → 부드러운 분포 형상.
 *
 * 산업 표준 D10/D90 경계 + 중앙 3분할 (대칭):
 *  zone[0]: 0~10%  미분 (D10 까지)
 *  zone[1]: 10~35% 중앙 시작
 *  zone[2]: 35~65% 중앙 (D50 중심)
 *  zone[3]: 65~90% 중앙 끝 (D90 까지)
 *  zone[4]: 90~100% 큰입자
 */
const ZONE_BOUNDARIES_PCT = [0, 10, 35, 65, 90, 100] as const;
const ZONE_LABELS = [
  "미분",
  "중앙 시작",
  "중앙",
  "중앙 끝",
  "큰입자",
] as const;

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
  /** 이 bin 에 속한 raw 입자 개수. tooltip + 테이블 표시용. */
  count: number;
  /**
   * 이 bin 의 부피 가중치 — sum(d³) of particles in bin (μm³ 단위).
   * Bar dataKey, Y축. volume-weighted distribution (산업 표준 일치).
   * 2026-05-05 count → volume 전환 (statistics.ts 와 일관성).
   */
  weight: number;
  /** weight / totalWeight × 100. volume-weighted percentage. */
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
  /** 8-anchor 분포 line Y 값 — 이 X 가 anchor 인 entry 만 set. */
  lineY?: number;
  /** anchor 라벨 (tooltip 표시용). */
  anchorLabel?: string;
}

interface AnnotatedBin extends HistogramBin {
  /** Bar Y 값 — anchor entry 는 undefined → Bar 자동 skip. */
  displayWeight?: number;
  inCore: boolean;
}


// 200µm 미만은 sub-pixel noise — main bin 에서 빼고 fines outlier 로 collapse.
// computeStats 의 FINES_THRESHOLD 와 별개 (binning 표시용).
const MIN_DISPLAY_DIAMETER_UM = 200;

// **Fines sub-bin 분할** (2026-05-06 추가):
// 기존: lowerBound 미만 입자 전부를 단일 outlier bin 으로 collapse → 95~329µm
//       처럼 wide bin 으로 나타나 (a) fines% 시각 검증 불가, (b) bimodal 분포
//       (미분 peak + main peak) 진단 불가, (c) sub-pixel artifact 와 진짜 미분
//       구분 불가.
// 개선: dense bin 과 동일 log-width 로 fines 영역도 sub-bin 분할.
// 적응형 갯수 (data 의 actualMin 에 따라 1~3개), bin 폭 dense 와 일치 → 시각 일관성.
const FINES_SUB_BIN_MAX = 3;
// Fines sub-bin 표시 하한 (µm). 그 미만 입자는 sub-pixel artifact 영역이라
// 별도 bar 안 그리고 leftmost sub-bin 에 묶음. X 축 stretch 방지.
const FINES_DISPLAY_FLOOR_UM = 200;
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
// 분포 line — bar(brown) / marker(orange) 와 구분되는 green-teal.
const LINE_COLOR = "#4A8B5C";

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

  const { data, countDomainMax, lineDomainMax, totalCount } = useMemo(() => {
    const rawData = buildBins(diameters, bins);
    // **Volume-weighted Y axis (2026-05-05)** — bar 높이는 weight (sum of d³).
    // count → weight 전환으로 D-line 과 시각적 일치 (volume-weighted 산업 표준).
    const sortedWeights = rawData
      .map((d) => d.weight)
      .filter((w) => w > 0)
      .sort((a, b) => a - b);
    const p75Idx = Math.floor(sortedWeights.length * Y_AXIS_PERCENTILE);
    const p75Weight = sortedWeights[p75Idx] ?? 1;
    const cap = Math.max(1, p75Weight * Y_AXIS_DOMAIN_MULTIPLIER);

    const annotated: AnnotatedBin[] = rawData.map((b) => ({
      ...b,
      displayWeight: Math.min(b.weight, cap),
      inCore:
        !b.outlier &&
        d10 !== undefined &&
        d90 !== undefined &&
        b.range >= d10 &&
        b.range <= d90,
    }));

    // **5-zone 분포 line — percentage 기반 (2026-05-05)** — 구역별 부피 비율.
    // 각 zone = 누적 부피 % 구간 → diameter range 변환 → 그 range 안의 dense bin
    // weight 합. 합을 totalWeight 로 나눠 percentage (0~100) 로 변환.
    // **dual Y axis**: bar 는 weight (좌, 기존 cap), line 은 percentage (우 hidden).
    // → bar 크기 유지 + line 자기 axis fully 사용. 시각 trend 만 표시.
    //
    // **D-marker 정렬**: bin 의 range 를 left-edge → bin center 로 변환해
    // bar/line dot 모두 bin 중앙 X 에 위치 → D50 marker 와 시각 정렬.
    let linePctCap = 0;
    if (diameters.length > 0 && rawData.length > 0) {
      const sortedAsc = [...diameters].sort((a, b) => a - b);
      const denseBins = annotated.filter((b) => !b.outlier);
      // 전체 weight (dense + outlier 포함) — percentage 분모
      const totalWeight = annotated.reduce((s, b) => s + b.weight, 0) || 1;
      // Zone 별 부분 합 + line attach (percentage 변환)
      const zoneSums: { idx: number; sumWeight: number; label: string }[] = [];
      for (let zi = 0; zi < ZONE_LABELS.length; zi++) {
        const pLo = ZONE_BOUNDARIES_PCT[zi] / 100;
        const pHi = ZONE_BOUNDARIES_PCT[zi + 1] / 100;
        const dLo = volumeWeightedPercentile(sortedAsc, pLo);
        const dHi = volumeWeightedPercentile(sortedAsc, pHi);
        const pMid = (pLo + pHi) / 2;
        const dCenter = volumeWeightedPercentile(sortedAsc, pMid);
        const logCenter = Math.log10(dCenter);
        const binsInZone = denseBins.filter((b) => {
          const c = (b.range + b.rangeMax) / 2;
          return c >= dLo && c <= dHi;
        });
        let sumWeight = 0;
        if (binsInZone.length > 0) {
          sumWeight = binsInZone.reduce((s, b) => s + b.weight, 0);
        } else {
          let nearest: AnnotatedBin | null = null;
          let nearestDist = Infinity;
          for (const b of denseBins) {
            const c = (b.range + b.rangeMax) / 2;
            const dist = Math.abs(Math.log10(c) - logCenter);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearest = b;
            }
          }
          sumWeight = nearest?.weight ?? 0;
        }
        // line attach: zone center 와 가장 가까운 dense bin
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let bi = 0; bi < annotated.length; bi++) {
          const b = annotated[bi];
          if (b.outlier) continue;
          const c = (b.range + b.rangeMax) / 2;
          const dist = Math.abs(Math.log10(c) - logCenter);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = bi;
          }
        }
        if (bestIdx >= 0) {
          zoneSums.push({ idx: bestIdx, sumWeight, label: ZONE_LABELS[zi] });
        }
      }
      // 합 → percentage 변환, line attach
      for (const z of zoneSums) {
        const pct = (z.sumWeight / totalWeight) * 100;
        const target = annotated[z.idx];
        if (target.lineY === undefined || pct > target.lineY) {
          target.lineY = pct;
          target.anchorLabel = z.label;
        }
        if (pct > linePctCap) linePctCap = pct;
      }

      // 시작 anchor — fines sub-bin 이 multiple 이면 각각 lineY 할당 (line 연속성),
      // 가장 왼쪽 (smallest) sub-bin 만 "시작" label.
      let firstFinesAssigned = false;
      for (let i = 0; i < annotated.length; i++) {
        if (annotated[i].outlier === "fines") {
          annotated[i].lineY = (annotated[i].weight / totalWeight) * 100;
          if (!firstFinesAssigned) {
            annotated[i].anchorLabel = "시작";
            firstFinesAssigned = true;
          }
          if (annotated[i].lineY > linePctCap) linePctCap = annotated[i].lineY;
        }
      }
      if (!firstFinesAssigned) {
        const firstIdx = annotated.findIndex((b) => !b.outlier);
        if (firstIdx >= 0 && annotated[firstIdx].lineY === undefined) {
          annotated[firstIdx].lineY =
            (annotated[firstIdx].weight / totalWeight) * 100;
          annotated[firstIdx].anchorLabel = "시작";
        }
      }
      const coarseIdx = annotated.findIndex((b) => b.outlier === "coarse");
      if (coarseIdx >= 0) {
        annotated[coarseIdx].lineY =
          (annotated[coarseIdx].weight / totalWeight) * 100;
        annotated[coarseIdx].anchorLabel = "끝";
      } else {
        let lastIdx = -1;
        for (let i = annotated.length - 1; i >= 0; i--) {
          if (!annotated[i].outlier) {
            lastIdx = i;
            break;
          }
        }
        if (lastIdx >= 0 && annotated[lastIdx].lineY === undefined) {
          annotated[lastIdx].lineY =
            (annotated[lastIdx].weight / totalWeight) * 100;
          annotated[lastIdx].anchorLabel = "끝";
        }
      }

      // **range → bin center 변환** (D-marker 정렬용).
      // bar/line dot 모두 X = bin geometric center (log mid) → orange marker (D50)
      // 와 가장 가까운 bin 의 dot 가 정확히 정렬됨.
      for (const b of annotated) {
        if (b.outlier) continue;
        b.range = Math.round(
          Math.pow(10, (Math.log10(b.range) + Math.log10(b.rangeMax)) / 2),
        );
      }
    }
    // Bar Y axis cap — 기존 그대로 (line 이 별도 axis 사용).
    const finalCap = cap;
    // Line Y axis cap — max zone percentage × 1.1 (headroom).
    const linePctDomain = Math.max(linePctCap * 1.1, 1);

    const total = rawData.reduce((sum, d) => sum + d.count, 0);
    return {
      data: annotated,
      countDomainMax: finalCap,
      lineDomainMax: linePctDomain,
      totalCount: total,
    };
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
          barCategoryGap="10%"
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
          {/* Bar Y axis (좌, hidden) — bar 기존 cap 유지. */}
          <YAxis
            yAxisId="count"
            orientation="left"
            domain={[0, countDomainMax * 1.1]}
            allowDataOverflow
            hide
          />
          {/* Line Y axis (우, hidden) — zone percentage. bar 와 독립. */}
          <YAxis
            yAxisId="line"
            orientation="right"
            domain={[0, lineDomainMax]}
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
              if (name === "부피 비율") {
                const payload = item?.payload as
                  | { count?: number; percentage?: number }
                  | undefined;
                const pct = payload?.percentage;
                const pctStr =
                  typeof pct === "number" ? `${pct.toFixed(1)}%` : "—";
                const countStr = payload?.count
                  ? ` (입자 ${payload.count}개)`
                  : "";
                return [`${pctStr}${countStr}`, name];
              }
              if (name === "분포") {
                const payload = item?.payload as
                  | { anchorLabel?: string }
                  | undefined;
                return [payload?.anchorLabel ?? "—", name];
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
            dataKey="displayWeight"
            name="부피 비율"
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
          {/* 8-anchor 분포 line — line 전용 Y axis (percentage), bar 와 독립. */}
          <Line
            dataKey="lineY"
            yAxisId="line"
            name="분포"
            type="monotone"
            stroke={LINE_COLOR}
            strokeWidth={2}
            dot={{ r: 3, fill: LINE_COLOR, stroke: "none" }}
            activeDot={{ r: 5, fill: LINE_COLOR, stroke: "white", strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
          {markers.map((m) => {
            const isStrong = m.variant === "strong";
            return (
              <ReferenceLine
                key={m.title}
                yAxisId="count"
                x={Math.round(m.x)}
                stroke={isStrong ? MARKER_STRONG : MARKER_COLOR}
                strokeWidth={isStrong ? 2.5 : 2}
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
                    부피 비율
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
  // 전체 부피 — volume-weighted percentage 계산용.
  const totalVolume = sorted.reduce((s, d) => s + d * d * d, 0) || 1;
  // **Volume-weighted P5/P95 (2026-05-05)** — bin 범위도 volume-percentile 기준.
  // count-percentile 로 잡으면 (이전 버그): 미분 입자 수가 많아 P95 이 작은 값에
  // 머무름 → D50/D90 (volume-weighted) 가 bin 범위 밖으로 떨어져 그래프에 미반영.
  // bin 과 D-line 모두 volume-weighted 로 일관성 있게 정렬.
  const volP5 = volumeWeightedPercentile(sorted, 0.05);
  const volP95 = volumeWeightedPercentile(sorted, 0.95);
  // P5 가 200µm 미만이면 200 부터 main bin 시작 — sub-200 노이즈는 fines outlier.
  const lowerBound = Math.max(volP5, MIN_DISPLAY_DIAMETER_UM);
  const upperBound = volP95;

  const logMin = Math.log10(lowerBound);
  const logMax = Math.log10(upperBound);
  const logBinWidth = (logMax - logMin) / bins;

  if (logBinWidth <= 0) {
    return [
      {
        range: Math.round(lowerBound),
        rangeMax: Math.round(lowerBound),
        count: total,
        weight: totalVolume,
        percentage: 100,
      },
    ];
  }

  const result: HistogramBin[] = [];

  const finesParticles = sorted.filter((d) => d < lowerBound);
  if (finesParticles.length > 0) {
    // Fines 영역을 균등 log-width 로 sub-bin 분할.
    //
    // 표시 floor (FINES_DISPLAY_FLOOR_UM = 200): 그 미만 입자는 sub-pixel artifact
    // 영역 (1-2px particle 의 quantization 한계) 이라 별도 bar 안 그림. 통계
    // (fines%, totalArea) 에는 여전히 포함. actualMin 이 floor 미만이면 leftmost
    // sub-bin 이 floor 부터 시작해 X 축 stretch 방지.
    //
    // sub-bin 갯수: actualMin (또는 floor) ~ lowerBound 사이를 dense logBinWidth
    // 단위로 몇 개 들어가나 (max 3 cap). 균등 log-width 분할.
    const finesActualMin = sorted[0];
    const finesDisplayMin = Math.max(finesActualMin, FINES_DISPLAY_FLOOR_UM);
    // floor 이상에 입자가 없으면 sub-bin 스킵 (모두 sub-pixel zone)
    if (finesDisplayMin < lowerBound) {
      const logFinesMin = Math.log10(finesDisplayMin);
      const subBinCount = Math.max(
        1,
        Math.min(
          FINES_SUB_BIN_MAX,
          Math.ceil((logMin - logFinesMin) / logBinWidth),
        ),
      );
      const finesLogWidth = (logMin - logFinesMin) / subBinCount;
      // sub-bin left-to-right 순서. level=subBinCount 가 가장 왼쪽 (smallest).
      // 가장 왼쪽 sub-bin 은 floor 미만 입자도 포함 (시각적으로 floor 부터 시작하지만
      // 통계상 actualMin 까지 cover) — sub-pixel artifact 가 묻혀 표시되지 않게.
      for (let level = subBinCount; level >= 1; level--) {
        const isLeftmost = level === subBinCount;
        const lo = Math.pow(10, logFinesMin + (subBinCount - level) * finesLogWidth);
        const hi = Math.pow(10, logFinesMin + (subBinCount - level + 1) * finesLogWidth);
        // leftmost sub-bin 만 floor 미만 입자도 포함
        const inBin = finesParticles.filter((d) =>
          isLeftmost ? d < hi : d >= lo && d < hi,
        );
        if (inBin.length === 0) continue;
        const weight = inBin.reduce((s, d) => s + d * d * d, 0);
        result.push({
          range: Math.round(lo),
          rangeMax: Math.round(hi),
          count: inBin.length,
          weight,
          percentage: (weight / totalVolume) * 100,
          outlier: "fines",
          actualMin: Math.round(Math.min(...inBin)),
          actualMax: Math.round(Math.max(...inBin)),
        });
      }
    } else {
      // 모든 fines 입자가 floor 미만 — 단일 압축 bin 으로 표시
      const weight = finesParticles.reduce((s, d) => s + d * d * d, 0);
      result.push({
        range: Math.round(finesActualMin),
        rangeMax: Math.round(lowerBound),
        count: finesParticles.length,
        weight,
        percentage: (weight / totalVolume) * 100,
        outlier: "fines",
        actualMin: Math.round(finesActualMin),
        actualMax: Math.round(lowerBound),
      });
    }
  }

  for (let i = 0; i < bins; i++) {
    const lo = Math.pow(10, logMin + i * logBinWidth);
    const hi = Math.pow(10, logMin + (i + 1) * logBinWidth);
    const isLast = i === bins - 1;
    const inBin = diameters.filter((d) =>
      isLast ? d >= lo && d <= hi : d >= lo && d < hi,
    );
    const count = inBin.length;
    const weight = inBin.reduce((s, d) => s + d * d * d, 0);
    result.push({
      range: Math.round(lo),
      rangeMax: Math.round(hi),
      count,
      weight,
      percentage: (weight / totalVolume) * 100,
    });
  }

  const coarseParticles = sorted.filter((d) => d > upperBound);
  const coarseCount = coarseParticles.length;
  if (coarseCount > 0) {
    const coarseWeight = coarseParticles.reduce((s, d) => s + d * d * d, 0);
    const coarsePosMax = Math.pow(10, logMax + logBinWidth);
    result.push({
      range: Math.round(upperBound),
      rangeMax: Math.round(coarsePosMax),
      count: coarseCount,
      weight: coarseWeight,
      percentage: (coarseWeight / totalVolume) * 100,
      outlier: "coarse",
      actualMin: Math.round(upperBound),
      actualMax: Math.round(sorted[sorted.length - 1]),
    });
  }

  return result;
}
