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

interface HistogramImplProps {
  diameters: number[];
  bins: number;
  d10?: number;
  d50?: number;
  d90?: number;
}

interface HistogramBin {
  /** Bin 의 왼쪽 가장자리 (X축 위치, μm) */
  range: number;
  /** 이 bin 에 속한 입자 수 (Bar dataKey) */
  count: number;
  /**
   * 이동 평균 (좌우 ±2 window, total 5점) — 추세선 dataKey.
   * Bar 와 분리된 시리즈로 분포의 "전반적인 추세" 시각화 (bin 노이즈 smooth).
   */
  trend: number;
}

/**
 * Histogram 색상 — DESIGN.md 토큰과 동기화.
 *
 *   PRIMARY_STRONG     `--color-primary` (#6B4423)              — Bar 핵심 영역 (D10~D90)
 *   PRIMARY_SUBTLE     #6B4423 의 alpha 0.32                    — Bar outlier 영역 (옅게)
 *   TREND_COLOR        `--color-success` (#4A8B5C)              — 분포 추세선
 *   TREND_OUTLINE      흰색 (#FFFFFF)                           — 추세선 가독성 outline
 *   BAND_COLOR         `--color-success` 의 alpha 0.07          — D10~D90 highlight band
 *   MARKER_COLOR       `--color-warning` (#C97B3F)              — D10/D90 marker
 *   MARKER_STRONG      `--color-warning` 진한 톤 (#A85F2E)      — D50 marker (강조)
 *   LABEL_COLOR        `--color-text-primary` (#1A1410)         — 라벨 한국어
 *   VALUE_COLOR        `--color-text-secondary` (#6B6157)       — 값 (μm)
 *
 * **2026-05-02 시각 위계 강화 (5-layer plan)**:
 *  1. Highlight band (D10~D90 옅은 success-bg) — 핵심 영역 시각 인지
 *  2. Outlier bar 옅게 (alpha 0.32) — D10 미만 / D90 초과 시각 weight ↓
 *  3. Trend line outline (white stroke 5px + green stroke 3px paint-order)
 *     → 어떤 배경 위에서도 명확
 *  4. D50 marker 차별화 (다른 marker 보다 굵은 line + bold label)
 *  5. Bar gap + radius 미세 조정 (개별성 강조)
 *
 * 정보 layer 분리:
 *  - Bar (count, 갈색)            — 분포 절대값
 *  - Line (trend, 녹색 + outline) — 분포 전반적인 추세 (moving average)
 *  - ReferenceArea (band)         — D10~D90 의미 영역
 *  - ReferenceLine (D10/D50/D90)  — 위치 marker (D50 강조)
 *  - X축 아래 marker label        — ▼ + 한국어 + μm 값
 */
const PRIMARY_STRONG = "#6B4423";
const PRIMARY_SUBTLE = "rgba(107, 68, 35, 0.32)";
const TREND_COLOR = "#4A8B5C";
const BAND_COLOR = "rgba(74, 139, 92, 0.07)";
const MARKER_COLOR = "#C97B3F";
const MARKER_STRONG = "#A85F2E";
const LABEL_COLOR = "#1A1410";
const VALUE_COLOR = "#6B6157";

/**
 * X축 아래 marker — ▼ 화살표 + 한국어 라벨 + μm 값 (3행 텍스트).
 *
 * variant="strong" (D50 전용) — 굵은 ▼ + label fontWeight 700 + 진한 색.
 * variant="default" (D10/D90) — 일반 강조.
 *
 * Recharts ReferenceLine 의 `label` 슬롯에 React element 전달 시 viewBox 는
 * 라인의 절대 좌표 (x = 라인 위치, y = chart top, height = chart height).
 * 라벨은 차트 영역 **아래** (y + height + offset) 에 그려져 Bar 와 충돌 X.
 */
function MarkerLabel(props: {
  viewBox?: { x: number; y: number; height: number };
  title: string;
  value: string;
  variant?: "default" | "strong";
}) {
  const { viewBox, title, value, variant = "default" } = props;
  if (!viewBox) return null;
  const baseY = viewBox.y + viewBox.height; // X축 라인 위치
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

  // X축 아래 marker — D10/D50/D90. variant 분기로 D50 강조.
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
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart
          data={data}
          /*
           * margin:
           *   top    8  — 최대 Bar 위쪽 여유
           *   right  16 — X축 마지막 marker 라벨 우측 잘림 방지
           *   left   16 — X축 첫 marker 라벨 좌측 잘림 방지
           *   bottom 60 — ▼ + 한국어 + μm 3줄 라벨 영역
           */
          margin={{ top: 8, right: 16, left: 16, bottom: 60 }}
          /*
           * Bar gap 조정 — barCategoryGap 을 늘려 개별 bar 간격 넓힘 (개별성 강조).
           * 기본값(10%) → 14%. log scale 에서도 자동 적용.
           */
          barCategoryGap="14%"
        >
          <XAxis
            dataKey="range"
            type="number"
            /*
             * scale="log" — 커피 분쇄 입자 분포는 log-normal 표준 (Rosin-Rammler).
             * D50 가운데 가까이 + bell 모양 시각화. buildBins 의 log binning 과 짝.
             */
            scale="log"
            domain={["dataMin", "dataMax"]}
            tick={false}
            axisLine={{ stroke: "var(--color-border)" }}
          />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              fontSize: 12,
            }}
            formatter={(value, name) => {
              const numValue = typeof value === "number" ? value : Number(value);
              // "trend" = 이웃 bin 이동평균 (5% window) — bin 자체와 분리.
              if (name === "trend")
                return [`${numValue.toFixed(1)}개`, "주변 평균"];
              return [`${numValue}개`, "이 구간 입자"];
            }}
            labelFormatter={(label) => `${label}μm 부터`}
          />
          {/*
           * Layer 1: Highlight band (D10~D90 핵심 영역).
           * 옅은 success 배경 — "여기가 분쇄의 의미 있는 영역" 시각 인지.
           * Bar/Line 보다 먼저 (뒤에) 그려짐 → bar 위에 묻히지 않음.
           */}
          {d10 !== undefined && d90 !== undefined && (
            <ReferenceArea
              x1={Math.round(d10)}
              x2={Math.round(d90)}
              fill={BAND_COLOR}
              stroke="none"
              ifOverflow="extendDomain"
            />
          )}
          {/*
           * Layer 2: Bar — D10~D90 영역은 강한 색, outlier 영역은 옅게.
           * Cell 별 conditional fill 로 같은 dataKey 안에서 색 분기.
           * radius 4 → 6 (더 부드러운 인상).
           */}
          <Bar
            dataKey="count"
            radius={[6, 6, 0, 0]}
            isAnimationActive={false}
          >
            {data.map((entry, i) => {
              const inCore =
                d10 !== undefined &&
                d90 !== undefined &&
                entry.range >= d10 &&
                entry.range <= d90;
              return (
                <Cell
                  key={`bar-${i}`}
                  fill={inCore ? PRIMARY_STRONG : PRIMARY_SUBTLE}
                />
              );
            })}
          </Bar>
          {/*
           * Layer 3: Trend line — 흰 outline (5px) + 녹색 stroke (3px) 합성.
           * 두 Line 컴포넌트로 outline + foreground 효과. Bar 위에 그려져 어떤
           * fill (강한 갈색 / 옅은 갈색 / band 녹색) 위에서도 명확히 보임.
           * dot=false 로 깔끔, monotone 보간으로 부드러운 곡선.
           */}
          <Line
            type="monotone"
            dataKey="trend"
            stroke="#FFFFFF"
            strokeWidth={5}
            dot={false}
            isAnimationActive={false}
            legendType="none"
            tooltipType="none"
          />
          <Line
            type="monotone"
            dataKey="trend"
            stroke={TREND_COLOR}
            strokeWidth={3}
            dot={false}
            isAnimationActive={false}
          />
          {/*
           * Layer 4: D10/D50/D90 vertical marker.
           * D50 (variant="strong") — 굵은 line + 진한 색 + bold label.
           * D10/D90 (variant="default") — 일반 강조.
           */}
          {markers.map((m) => {
            const isStrong = m.variant === "strong";
            return (
              <ReferenceLine
                key={m.title}
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
    </div>
  );
}

/**
 * 직경 배열 → bin 데이터 (count + trend). **log binning**.
 *
 * 커피 분쇄 입자 분포는 log-normal 표준 — log space 에서 균등 binning 이
 * 자연스러운 bell 모양 시각화를 만든다.
 *
 * Range upper bound 는 P95. P95 초과는 어떤 bin 에도 속하지 않음.
 *
 * **trend** = count 의 moving average (window 5, 좌우 ±2). bin 노이즈 smooth
 * 후 분포 전반적인 형태만 강조 — 추세선 시각화 전용.
 *
 * sweep Issue 22 guard: min === max → 단일 bar fallback.
 */
function buildBins(diameters: number[], bins: number): HistogramBin[] {
  if (diameters.length === 0) return [];
  const sorted = [...diameters].sort((a, b) => a - b);
  const total = sorted.length;
  const min = sorted[0];
  const p95Index = Math.floor(total * 0.95);
  const upperBound = sorted[Math.min(p95Index, total - 1)];

  const logMin = Math.log10(min);
  const logMax = Math.log10(upperBound);
  const logBinWidth = (logMax - logMin) / bins;

  if (logBinWidth <= 0) {
    return [{ range: Math.round(min), count: total, trend: total }];
  }

  const counts: number[] = [];
  const ranges: number[] = [];
  for (let i = 0; i < bins; i++) {
    const lo = Math.pow(10, logMin + i * logBinWidth);
    const hi = Math.pow(10, logMin + (i + 1) * logBinWidth);
    const isLast = i === bins - 1;
    const count = diameters.filter((d) =>
      isLast ? d >= lo && d <= hi : d >= lo && d < hi,
    ).length;
    counts.push(count);
    ranges.push(Math.round(lo));
  }

  // Moving average — bin 수의 ~5% 양쪽 (40 bin → ±2). bin 수 늘려도 trend
  // 선이 너무 거칠어지지 않도록 비례 적용. 최소 1, 최대 4 (지나친 oversmooth 방지).
  const halfWindow = Math.max(1, Math.min(4, Math.round(counts.length * 0.05)));
  const trend = counts.map((_, i) => {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(counts.length, i + halfWindow + 1);
    const slice = counts.slice(start, end);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  return counts.map((count, i) => ({
    range: ranges[i],
    count,
    trend: trend[i],
  }));
}
