# F06 — Statistics + Confidence + AbortSignal + Pipeline

**Status**: 🟡 미시작
**Estimated effort**: 1 day (D7)
**Dependencies**: F03~F05
**Blocks**: F07
**plain.md 참조**: Section 6 (파이프라인 5~7단계 + AbortSignal), Section 11 (low_particles, division by zero, AbortSignal 좀비), Section 13 (회귀 + 단위 테스트)

---

## 목표

입자 통계 (D10/D50/D90/Fines%/Uniformity, **division-by-zero 가드**) + 신뢰도 점수 (0~10) + **AbortSignal 통합 파이프라인** + **알고리즘 노트 작성**.

---

## 산출물

### 신규 파일
- `src/opencv/statistics.ts` — D10/D50/D90/Fines%/Uniformity (가드 포함)
- `src/opencv/confidence.ts` — 신뢰도 점수 산출
- `src/opencv/pipeline.ts` — F03~F06 통합 + AbortSignal
- `tests/opencv/statistics.test.ts` — 경계값 + 가드 단위 테스트
- `tests/opencv/confidence.test.ts` — 신호 조합 매트릭스 단위 테스트
- `tests/opencv/regression.test.ts` — anchor D50 회귀 (manifest 기반 동적 루프, F04 가 생성한 후 F06 이 확장) (Section 13 코드)
- `ALGORITHM_NOTES.md` — 파라미터 튜닝 이력 + 검증 결과 (D7 종료 시 필수)

### 수정 파일
- `src/opencv/errors.ts` — `low_particles` 추가
- `src/routes/analyzing.tsx` — 실제 파이프라인 트리거 + AbortController

---

## 구현 디테일

### opencv/statistics.ts
```ts
export interface ParticleStats {
  d10: number;
  d50: number;
  d90: number;
  finesPercent: number;     // < 300μm 면적 비율
  uniformity: number;       // d90 / d10
  particleCount: number;
  totalAreaMm2: number;
  diameters: number[];      // 정렬된 입자 직경 배열 (μm) — 히스토그램 입력용 (F07)
}

const MIN_PARTICLE_DIAMETER_UM = 100; // 노이즈 필터
const FINES_THRESHOLD_UM = 300;

export function computeStats(
  contours: any,           // cv.MatVector
  mmPerPixel: number
): ParticleStats {
  const diameters: number[] = [];
  const areas: number[] = [];
  let totalAreaMm2 = 0;
  let finesAreaMm2 = 0;

  for (let i = 0; i < contours.size(); i++) {
    const areaPx = cv.contourArea(contours.get(i));
    const areaMm2 = areaPx * mmPerPixel ** 2;
    // 등가 직경 (원으로 가정): D = 2 * sqrt(area / PI)
    const diameterMm = 2 * Math.sqrt(areaMm2 / Math.PI);
    const diameterUm = diameterMm * 1000;

    if (diameterUm < MIN_PARTICLE_DIAMETER_UM) continue; // 노이즈

    diameters.push(diameterUm);
    areas.push(areaMm2);
    totalAreaMm2 += areaMm2;
    if (diameterUm < FINES_THRESHOLD_UM) finesAreaMm2 += areaMm2;
  }

  if (diameters.length === 0) {
    throw new Error('통계 계산: 입자 0개 (필터 후)'); // 호출자가 no_particles 또는 low_particles 처리
  }

  diameters.sort((a, b) => a - b);
  const d10 = percentile(diameters, 0.1);
  const d50 = percentile(diameters, 0.5);
  const d90 = percentile(diameters, 0.9);

  // Division-by-zero 가드
  const uniformity = d10 > 0 ? d90 / d10 : Infinity;
  const finesPercent = totalAreaMm2 > 0 ? (finesAreaMm2 / totalAreaMm2) * 100 : 0;

  return { d10, d50, d90, finesPercent, uniformity, particleCount: diameters.length, totalAreaMm2, diameters };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) throw new Error('percentile: 빈 배열');
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
```

### opencv/confidence.ts
```ts
export interface ConfidenceInputs {
  coinConfidence: number;        // 0~1, F04 출력
  particleCount: number;
  meanBrightness: number;        // 0~255
  laplacianVariance: number;     // 블러 점수
}

export interface ConfidenceResult {
  score: number;        // 0~10
  signals: {
    coin: number;
    particles: number;
    brightness: number;
    blur: number;
  };
  warning: boolean;     // < 5
}

const PARTICLE_TIERS = [
  { min: 500, score: 1.0 },
  { min: 200, score: 0.8 },
  { min: 50, score: 0.5 },
  { min: 0, score: 0.0 },
];

export function computeConfidence(inputs: ConfidenceInputs): ConfidenceResult {
  // 입자 신호: 단계별
  const particleSignal = PARTICLE_TIERS.find(t => inputs.particleCount >= t.min)!.score;

  // 밝기 신호: 80~200 정상, 양 끝 감점
  const brightnessSignal = inputs.meanBrightness < 80 ? 0
    : inputs.meanBrightness > 220 ? Math.max(0, 1 - (inputs.meanBrightness - 220) / 35)
    : 1.0;

  // 블러 신호: variance ≥ 200 정상, < 100 reject 됐을 것 (이미 통과한 케이스)
  const blurSignal = Math.min(1, inputs.laplacianVariance / 200);

  const signals = {
    coin: inputs.coinConfidence,
    particles: particleSignal,
    brightness: brightnessSignal,
    blur: blurSignal,
  };

  // 가중 평균 (입자 + 동전 가장 중요)
  const weighted =
    signals.coin * 0.3 +
    signals.particles * 0.4 +
    signals.brightness * 0.15 +
    signals.blur * 0.15;

  const score = Math.round(weighted * 10);
  return { score, signals, warning: score < 5 };
}
```

### opencv/pipeline.ts (통합)
```ts
import { downsampleImage } from '../lib/image-downsample';
import { checkInputQuality, detectCoin } from './coin-detect';
import { segmentParticles, disposeSegmentation } from './particle-segment';
import { computeStats } from './statistics';
import { computeConfidence } from './confidence';
import { AnalysisError } from './errors';

export interface PipelineResult {
  stats: ParticleStats;
  coin: CoinDetection;
  confidence: ConfidenceResult;
  durationMs: number;
}

export interface PipelineCallbacks {
  onProgress?: (step: PipelineStep, percent: number) => void;
}

export type PipelineStep = 'downsample' | 'preflight' | 'coin' | 'segment' | 'stats' | 'confidence';

export async function runPipeline(
  source: HTMLVideoElement | HTMLCanvasElement,
  signal: AbortSignal,
  callbacks: PipelineCallbacks = {}
): Promise<PipelineResult> {
  const start = performance.now();

  signal.throwIfAborted();
  callbacks.onProgress?.('downsample', 0);
  const canvas = downsampleImage(source);
  await tick();

  signal.throwIfAborted();
  callbacks.onProgress?.('preflight', 15);
  const inputQuality = await checkInputQuality(canvas);
  await tick();

  signal.throwIfAborted();
  callbacks.onProgress?.('coin', 30);
  const coin = await detectCoin(canvas);
  await tick();

  signal.throwIfAborted();
  callbacks.onProgress?.('segment', 50);
  const segmentation = await segmentParticles(canvas, coin);

  try {
    signal.throwIfAborted();
    callbacks.onProgress?.('stats', 80);
    let stats: ParticleStats;
    try {
      stats = computeStats(segmentation.contours, coin.mmPerPixel);
    } catch (_) {
      throw { kind: 'no_particles' } satisfies AnalysisError;
    }

    signal.throwIfAborted();
    callbacks.onProgress?.('confidence', 95);
    const confidence = computeConfidence({
      coinConfidence: coin.confidence,
      particleCount: stats.particleCount,
      meanBrightness: inputQuality.meanBrightness,
      laplacianVariance: inputQuality.laplacianVariance,
    });

    callbacks.onProgress?.('confidence', 100);
    return { stats, coin, confidence, durationMs: performance.now() - start };
  } finally {
    disposeSegmentation(segmentation);
  }
}

/** 단계 사이 microtask 양보 (취소 + UI 응답성) */
function tick(): Promise<void> {
  return new Promise(r => setTimeout(r, 0));
}
```

### routes/analyzing.tsx (실제 파이프라인 트리거)
```tsx
export function AnalyzingRoute() {
  const frame = useMeasurementStore(s => s.frame);
  const setResult = useMeasurementStore(s => s.setResult);
  const setError = useMeasurementStore(s => s.setError);
  const [, setLocation] = useLocation();
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<PipelineStep>('downsample');
  const abortRef = useRef(new AbortController());

  useEffect(() => {
    const ctrl = abortRef.current;
    (async () => {
      try {
        await loadOpenCV({ onProgress: (l, t) => setProgress(l / t * 0.2) }); // 다운로드 0~20%
        const result = await runPipeline(frame!, ctrl.signal, {
          onProgress: (s, p) => { setStep(s); setProgress(0.2 + p / 100 * 0.8); }, // 분석 20~100%
        });
        setResult(result);
        setLocation('/result');
      } catch (e: any) {
        if (e?.kind === 'aborted' || e?.name === 'AbortError') {
          setLocation('/home');
          return;
        }
        setError(e); // AnalysisError
        setLocation('/result?error=1'); // 또는 별도 에러 화면
      }
    })();

    return () => ctrl.abort();
  }, [frame]);

  return (
    <div>
      <ProgressBar value={progress * 100} />
      <p>{stepLabel(step)}</p>
      <button onClick={() => abortRef.current.abort()}>취소</button>
    </div>
  );
}
```

### errors.ts 확장
```ts
| { kind: 'low_particles'; count: number };

case 'low_particles': return ''; // 메시지 없음 — 결과는 표시하되 신뢰도 카드로 경고
```

### ALGORITHM_NOTES.md (D7 종료 시 작성)
```markdown
# Coffilens Algorithm Notes

## 파라미터 결정 이력
- HoughCircles minRadius/maxRadius: imgRows * 0.05 ~ 0.4
  - 이유: 일반 촬영 거리에서 동전이 차지하는 비율
- Adaptive threshold blockSize=51, C=10
  - anchor fixture (`grind-anchor-{NNN}.jpg`) 에서 입자 분리 잘됨
  - blockSize 31, 71 도 시도 → 51 이 노이즈/검출 균형 best
- ...

## 그라운드 트루스 검증 결과
| Fixture | 기댓값 D50 (sieve fraction midpoint) | 측정값 D50 | 오차 | 통과 |
|---|---|---|---|---|
| grind-anchor-{NNN} | {NNN}μm (예: 725) | ... | ... | ✓ |
| ...

## 알려진 한계
- 컵받침이 큰 동전으로 오인식되는 경우 → 신뢰도 점수에 반영
- ...
```

---

## 수용 기준

- [ ] `computeStats()` 가 빈 배열 throw, division-by-zero 가드 동작
- [ ] `computeConfidence()` 가 4가지 신호 조합으로 0~10 점수 반환
- [ ] `runPipeline()` 가 AbortSignal.abort() 시 즉시 중단 (단계 사이)
- [ ] `runPipeline()` 의 confidence 입력 `meanBrightness` / `laplacianVariance` 가 `checkInputQuality()` 실제 출력값 사용 (placeholder X)
- [ ] Anchor fixture 회귀 테스트 통과 (D50 ground_truth_d50_um ± tolerance_um, manifest 정의값)
- [ ] /analyzing 화면에서 진행률 + 단계 텍스트 + 취소 버튼 동작
- [ ] 사용자 취소 시 /home 복귀, 에러 시 /result?error=1
- [ ] **ALGORITHM_NOTES.md 작성 완료** (필수, D7 종료 조건)

---

## 테스트

### tests/opencv/statistics.test.ts
- 빈 배열 → throw
- 단일 값 → percentile 가능
- D10=0 → uniformity = Infinity
- 100μm 미만 필터링
- 정상 케이스 D10 < D50 < D90

### tests/opencv/confidence.test.ts
- 모든 신호 1.0 → 10
- 입자 < 50 → 점수 ↓
- 동전 신뢰도 0.3 → 점수 큰 영향 (가중치 0.3)
- 모든 신호 0 → 0

### tests/opencv/regression.test.ts (Section 13 코드 — manifest 기반 동적 루프)
```ts
import manifest from '../../fixtures/manifest.json';

describe('Anchor regression', () => {
  for (const fx of manifest.fixtures.filter(f => f.kind === 'anchor')) {
    it(`${fx.file} → D50 ${fx.ground_truth_d50_um}±${fx.tolerance_um}μm`, async () => {
      const result = await runPipeline(loadFixture(fx.file), new AbortController().signal);
      expect(Math.abs(result.stats.d50 - fx.ground_truth_d50_um)).toBeLessThan(fx.tolerance_um);
    });
  }
});
```

### AbortSignal 테스트
- abort() 후 다음 단계 진입 안 함
- 이미 abort 된 signal 로 호출 시 즉시 throw

---

## 검수 영향

- 직접 검수 항목 없음
- 단, 결과 정확도가 사용자 신뢰 직결 → 그라운드 트루스 회귀 통과 필수

---

## 위험 / 함정

- ⚠️ **D7 일정 압박**: 통계 + 신뢰도 + AbortSignal + 알고리즘 노트 → 하루로 빠듯. ALGORITHM_NOTES 가 가장 미루기 쉬우나 **반드시 D7 종료 시 작성** (Phase 1 본인이 6개월 후 자기 자신을 위해)
- ⚠️ **입자 등가 직경 가정**: 원으로 가정 (`D = 2*sqrt(A/PI)`). 실제 입자는 각진 경우 많아 실제 직경보다 작게 나옴 → 5~15% 과소평가. 디스클레이머 정당화 (상대 비교용)
- ⚠️ **Watershed oversegment 영향**: 큰 입자가 여러 조각으로 → D50 과소평가. 100μm 미만 필터로 일부 완화. F11 베타에서 검증
- ⚠️ **AbortSignal microtask 양보**: `await Promise.resolve()` 또는 `setTimeout(0)`. WebView 에서 둘 다 동작하나 `setTimeout(0)` 가 더 안전 (Promise resolve 가 microtask 큐만 비우는 경우)
- ⚠️ **신뢰도 점수 가중치 (0.3/0.4/0.15/0.15)**: 임의 결정. 베타 피드백으로 조정 가능. ALGORITHM_NOTES 에 결정 근거 기록

---

## 참조

- [plain.md Section 6 (파이프라인 5~7단계)](../plain.md)
- [plain.md Section 13 (테스트 전략)](../plain.md)
- [Equivalent Diameter](https://en.wikipedia.org/wiki/Equivalent_spherical_diameter)

---

## Handoff Notes

이 feature 가 **분석 파이프라인의 마무리**. 완료 시점에:
1. Anchor 회귀 테스트 통과 (정확도 보장)
2. AbortSignal 통합 (사용자 취소 가능)
3. ALGORITHM_NOTES 작성 (Phase 1 진화 가능)

분석 정확도가 사용자 가치의 거의 전부. **회귀 테스트 통과 못하면 D8 결과 화면 진입 의미 없음**. 통과 못하면 D5 (HoughCircles) / D6 (watershed) 파라미터 다시 튜닝.

신뢰도 점수 가중치는 ALGORITHM_NOTES 에 결정 근거 기록 — 베타 피드백으로 조정 시 추적 가능. F09 D10 자가 검수 + F11 베타에서 점검.

---

## 추가 (2026-05-02, Phase 1) — Image→Sieve Calibration Layer

### 배경

D9~D12 fixture QC 세션에서 **systematic D50 underestimation** 발견:
- Varia VS3 + Hyperhoba @ 11.5 (V60 grind, sieve 600~800μm) → image 측정 D50 ≈ 249μm
- Ratio: image 직경 ≈ sieve 직경 × **0.4** (~50%+ underestimation)

원인:
1. 입자가 평탄하게 누워 촬영 → 가장 큰 단면만 보임
2. Adaptive threshold over-segmentation: 큰 입자가 여러 fragment 로 쪼개짐
3. 등가 원형 가정 자체의 underestimation (각진 입자 → 면적 환산 직경 < 실제 길이)

이 bias 는 알고리즘 단순 튜닝 (HoughCircles/watershed) 으로는 완전 제거 불가. 일반 barista 가이드 (Hoffmann/SCA/PDG 등) 가 모두 sieve 기준 D50 임계값 (espresso 200~350μm, V60 600~800μm) 을 쓰므로, 측정 결과를 sieve scale 로 변환해야 외부 가이드와 비교 가능.

### Layer 분리 원칙

```
[Measurement layer]   pure image-space 측정 (raw 등가 원형 직경)
    ↓                   statistics.ts — image-biased 그대로
[Calibration layer]   image → sieve 변환  ← 신규 (이 spec)
    ↓                   calibration.ts — × IMAGE_TO_SIEVE_RATIO
[Guide layer]         표준 sieve 임계값 (Hoffmann 등 외부 reference)
                       brewing-guide.ts — 우리가 결정/조정 X
```

- **measurement layer 책임**: pure 측정 (테스트 안정성). image-space 임계값 (`MIN_PARTICLE`, `FINES_THRESHOLD` 등) 그대로 유지.
- **calibration layer 책임**: image → sieve 변환. 사용자/그라인더별 튜닝은 이 layer 에서만 일어남.
- **guide layer 책임**: 외부 표준 임계값. 우리가 조정하지 않음 (F07 추가 섹션 참조).

### 신규 파일 — `src/opencv/calibration.ts`

```ts
import type { ParticleStats } from "./statistics";

/** Anchor: VS3 + Hyperhoba @ 11.5 (V60 grind, sieve target ~700μm) → image D50=249. */
export const IMAGE_TO_SIEVE_RATIO = 2.8;

/**
 * computeStats 출력에 image → sieve 변환 적용.
 * 변환 대상: D-value (직경 차원). uniformity 는 ratio 라 invariant.
 * 변환 안 함: particleCount, finesPercent, totalAreaMm2, clumps.*
 */
export function applyImageToSieveCalibration(
  stats: ParticleStats,
): ParticleStats {
  const r = IMAGE_TO_SIEVE_RATIO;
  return {
    ...stats,
    d10: stats.d10 * r,
    d50: stats.d50 * r,
    d90: stats.d90 * r,
    diameters: stats.diameters.map((d) => d * r),
  };
}
```

### Pipeline 통합 (`pipeline.ts`)

```ts
import { applyImageToSieveCalibration } from "./calibration";

// stats step:
const rawStats = computeStats(segmentation.contours, coin.mmPerPixel); // image-space
stats = applyImageToSieveCalibration(rawStats);                         // sieve-space
```

### 수용 기준 추가

- [ ] `IMAGE_TO_SIEVE_RATIO` 상수가 `calibration.ts` 에 정의되고 doc-comment 로 anchor 명시
- [ ] `applyImageToSieveCalibration()` 가 d10/d50/d90/diameters[] 만 변환, 나머지 (uniformity/finesPercent/clumps) 는 invariant
- [ ] `pipeline.ts` 에서 stats step 후 calibration 적용 (raw image-space stats 가 사용자에게 노출되지 않음)
- [ ] `statistics.test.ts` 는 image-space 그대로 검증 (calibration 적용 X — measurement layer 의 pure 한 책임 유지)
- [ ] `pipeline.test.ts` 는 calibration 적용 후 값 검증 (mock d50=720 → 720 × 2.8 = 2016)

### 통계 모듈 변경 (statistics.ts)

원 spec 의 `computeStats` 외에 다음 추가:

1. **클럼프 분리** — `CLUMP_MIN_DIAMETER_UM = 2000` (절대) 또는 `tempD50 × 4` (상대) 의 max 초과 입자는 정상 입자에서 제외. 결과에 별도 `clumps: { count, totalAreaMm2, areaRatio }` 보고. 추출 후 퍽이나 정전기 cluster 같은 outlier 가 D50 통계 오염시키는 것 방지.
2. **MAX_PARTICLE_DIAMETER_UM = 15000** — 안전망 (whole bean ~8mm 도 포괄). segment 단계 `MAX_PARTICLE_AREA_MM2 = 80mm²` 가 먼저 컷.
3. **`DEBUG_STATS=1` envvar** — raw 분포 percentile + 필터 breakdown 출력 (production 영향 X, fixture 분석용).

### Calibration 한계 + 후속 작업

- 현재 anchor 1점 (vs3-100) 으로 ratio 결정 → 다른 grind range (espresso ~ coldbrew) 의 정확도는 검증 필요
- **TODO**: 사용자 sieve 분급된 ground-truth fixture 4종 (espresso/모카포트/핸드드립/프렌치프레스) 도착 후 anchor 4점 평균으로 fine-tune
- uniformity (D90/D10) 는 ratio 변환으로 해결 안 됨 (분자/분모 상쇄) — image-space 임계값 별도 유지 (F07 섹션 참조)

### 관련 fixtures/manifest.json 항목

`calibration_2026_05_02_brewing_guide` 섹션에 architecture / anchor / 임계값 결정 기록.
