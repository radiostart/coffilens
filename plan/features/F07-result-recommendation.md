# F07 — Result Screen (Pure Measurement)

**Status**: 🟡 미시작
**Estimated effort**: 1 day (D8)
**Dependencies**: F02 (라우터), F06 (PipelineResult)
**Blocks**: F08 (저장 통합)
**plain.md 참조**: Section 5 (결과 화면), Section 12 (components/), **Section 19-2 결과 wireframe ★**, **Section 19-7 신뢰도 바 + inline data list 결정**
**DESIGN.md 참조**: Section 2 (semantic colors for confidence), Section 3 (Typography — `--text-display` for D50 헤드라인, tabular-nums for D50/D90), Section 8 (Card pattern), Section 11 (a11y reading order — 분쇄도 720 마이크로미터, 신뢰도 7점)

---

## 목표

결과 화면 (히스토그램 + 검출 동전 + 신뢰도 바 + 디스클레이머) — **순수 측정 결과 표시**.

> **컨셉 변경 (2026-05-01, Option A)**: 추출 도구별 추천 매트릭스 제거. 사용자에게 절대 측정값 (D50, D10, D90, Uniformity, Fines%, 신뢰도) 만 표시. "V60 적정" 같은 도구 적정성 메시지, "다른 도구로 보기" chip 그룹, `recommendation/matrix.ts` 모두 삭제.
>
> **이유**: 도구별 추천이 "정확한 권장값"이라는 인상을 주면 검수에서 책임 소재 우려 + 사용자 클레임 위험. 측정 도구로 단순화 → 디스클레이머만 유지.

---

## 산출물

### 신규 파일
- `src/routes/result.tsx` — 결과 화면 통합
- `src/components/histogram.tsx` — Recharts wrapper (lazy)
- `src/components/confidence-bar.tsx` — 신뢰도 점수 가로 바 (Section 19-7)
- `src/components/disclaimer-banner.tsx` — "측정값은 상대 비교용" 영구 노출

### 수정 파일
- `src/stores/measurement.store.ts` — `result`, `error` 필드 추가

### 삭제 (없음 — 기존에 존재 안 했으면 skip)
- ~~`src/recommendation/matrix.ts`~~ — 제거됨
- ~~`src/recommendation/messages.ts`~~ — 제거됨
- ~~`tests/recommendation/matrix.test.ts`~~ — 제거됨

---

## 구현 디테일

### components/histogram.tsx
```tsx
import { lazy, Suspense } from 'react';

const Recharts = lazy(() => import('./histogram-impl')); // recharts 동적 로드

export function Histogram({ diameters, bins = 20 }: { diameters: number[]; bins?: number }) {
  return (
    <Suspense fallback={<div>차트 로드 중...</div>}>
      <Recharts diameters={diameters} bins={bins} />
    </Suspense>
  );
}
```

```tsx
// histogram-impl.tsx (lazy 대상)
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts';

export default function HistogramImpl({ diameters, bins }: { diameters: number[]; bins: number }) {
  // 히스토그램 binning
  const min = Math.min(...diameters);
  const max = Math.max(...diameters);
  const binWidth = (max - min) / bins;
  const data = Array.from({ length: bins }, (_, i) => ({
    range: Math.round(min + i * binWidth),
    count: diameters.filter(d => d >= min + i * binWidth && d < min + (i + 1) * binWidth).length,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <XAxis dataKey="range" />
        <YAxis />
        <Bar dataKey="count" fill="#6B4423" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### components/confidence-bar.tsx (Section 19-7 결정: 가로 바 + 점수 + 색)

색맹 대응 (DESIGN.md Section 11): 색 + 점수 + 길이 3중 표현.

```tsx
type Variant = 'success' | 'warning' | 'error';

export function ConfidenceBar({ score, max, variant, warningText }: Props) {
  const ratio = score / max;
  return (
    <div className={`confidence-bar variant-${variant}`}
         role="meter"
         aria-valuenow={score}
         aria-valuemin={0}
         aria-valuemax={max}
         aria-label={`신뢰도 ${score}점 만점 ${max}점`}>
      <div className="track">
        <div className="fill" style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="label numeric">신뢰도 {score}/{max}</span>
      {warningText && <p className="warning-text text-caption">{warningText}</p>}
    </div>
  );
}
```

```css
.confidence-bar { display: flex; flex-direction: column; gap: var(--space-xs); }
.confidence-bar .track {
  height: 8px;
  background: var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.confidence-bar .fill {
  height: 100%;
  border-radius: var(--radius-sm);
  transition: width var(--duration-base) var(--ease-enter);
}
.variant-success .fill { background: var(--color-success); }
.variant-warning .fill { background: var(--color-warning); }
.variant-error   .fill { background: var(--color-error); }
.warning-text { color: var(--color-warning); }
```

### [Phase 2] 결과 화면 하단 IAA 배너

Phase 0/1 출시에는 표시 X. Phase 2 진입 시점에 활성화 (사업자 등록 + 광고 단위 발급 후).

위치: "측정 저장" CTA + 저장 후 toast 영역 아래, safe-area 위. **디스클레이머 sticky 와 별도 영역** — 디스클레이머는 결과 컨텐츠 위쪽 sticky, 광고는 화면 가장 아래.

검수 4-5 룰 위반 없음:
- ❌ 인트로/로딩/컷신/팝업 모달 노출 → 결과 화면은 정적 컨텐츠 → OK
- ✅ 광고 사전 로딩 (분석 시작 시점에 useTossBanner 초기화 → 결과 화면 진입 시점에 즉시 표시)
- ✅ 광고 종료 후 미니앱 화면 정상 복귀

```tsx
// Phase 2 추가
import { useTossBanner } from '@apps-in-toss/web-framework';

export function ResultRoute() {
  const result = useMeasurementStore(s => s.result);
  const phase = import.meta.env.VITE_APP_PHASE;
  // ... 기존 result rendering

  return (
    <main role="main" aria-label="측정 결과" className="result">
      {/* ... 기존 헤드라인 / 신뢰도 / 히스토그램 / inline data list / 디스클레이머 / CTA */}

      {phase === '2' && <ResultAdBanner />}
    </main>
  );
}

function ResultAdBanner() {
  const banner = useTossBanner({ position: 'bottom', /* ... 광고 단위 ID */ });
  return <div className="ad-slot" aria-label="광고">{banner}</div>;
}
```

CSS: F02 의 `.ad-slot` 패턴 재사용 (DRY).

> **광고 텔레메트리 augmented 버전**: [F09 추가 섹션 — Phase 2 광고 텔레메트리](F09-telemetry-polish.md) 의 `ResultAdBanner` 코드 (onLoad/onClick/onError 콜백 포함) 사용. 본 spec 의 위 코드는 텔레메트리 없는 minimal 버전.

### components/disclaimer-banner.tsx

Sticky 영구 노출 (Section 19-2 wireframe). 디자인 욕심으로 작게 만들지 말 것.

```tsx
export function DisclaimerBanner() {
  return (
    <div className="disclaimer-banner" role="note">
      ⚠️ 측정값은 <strong>상대 비교용</strong>입니다. 절대값으로 단정하지 마세요.
    </div>
  );
}
```

```css
.disclaimer-banner {
  position: sticky;
  bottom: var(--space-md);
  background: var(--color-warning-bg);
  color: var(--color-warning);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  font: var(--text-caption);
  margin: var(--space-md) 0;
}
```

### routes/result.tsx (★ Section 19-2 wireframe 적용)

위계 (도구별 추천 제거됨):
1. **1차 H1**: D50 숫자 ("D50 720μm") — `--text-display`, tabular-nums
2. **1차 보조**: "분쇄 입자 크기 중앙값이에요" 한 줄 — `--text-body-large`
3. **1.5차**: 신뢰도 가로 바 + 점수 + 색 (Section 19-7)
4. **2차**: 히스토그램 (Recharts lazy)
5. **3차**: inline data list ("D10 480μm · D90 1100μm · 균일도 2.4 · Fines 8%") — 4 카드 X
6. **3차**: 신뢰도/입자수 경고 (있을 때만)
7. **3차**: 검출 동전 메타 ("100원 인식됨 (24mm) · 분석 1240ms")
8. **3차 sticky**: 디스클레이머 banner
9. **CTA primary**: 측정 저장 → 저장 후 toast + 홈 버튼

```tsx
export function ResultRoute() {
  const result = useMeasurementStore(s => s.result);
  const error = useMeasurementStore(s => s.error);
  const frame = useMeasurementStore(s => s.frame);
  const saveHistory = useHistoryStore(s => s.save);
  const [saved, setSaved] = useState(false);
  const [, setLocation] = useLocation();

  if (error) return <ErrorScreen error={error} onRetry={() => setLocation('/camera')} />;
  if (!result) { setLocation('/home'); return null; }

  const variant = result.confidence.score >= 8 ? 'success'
                : result.confidence.score >= 5 ? 'warning' : 'error';

  const warnings: string[] = [];
  if (result.confidence.score < 5) warnings.push('신뢰도가 낮아요. 더 밝은 곳에서 재측정을 권장합니다.');
  if (result.stats.particleCount < 100) warnings.push(`검출된 입자가 적어요(${result.stats.particleCount}개). 통계 신뢰도가 낮을 수 있습니다.`);

  return (
    <main role="main" aria-label="측정 결과" className="result">
      {/* 1차 — D50 헤드라인 */}
      <header className="result-headline">
        <h1 className="text-display"
            aria-label={`분쇄도 ${Math.round(result.stats.d50)} 마이크로미터`}>
          D50 {Math.round(result.stats.d50)}μm
        </h1>
        <p className="text-body-large">분쇄 입자 크기 중앙값이에요</p>
      </header>

      {/* 1.5차 — 신뢰도 바 (Section 19-7) */}
      <ConfidenceBar
        score={result.confidence.score}
        max={10}
        variant={variant}
        warningText={result.confidence.warning ? '신뢰도가 낮아요. 더 밝은 곳에서 재측정 권장' : null}
      />

      {/* 2차 — 히스토그램 */}
      <Histogram diameters={result.stats.diameters} />

      {/* 3차 inline data list (NOT 4 카드) */}
      <dl className="data-inline" aria-label="측정 통계">
        <div><dt>D10</dt><dd className="numeric">{Math.round(result.stats.d10)}μm</dd></div>
        <span className="sep">·</span>
        <div><dt>D90</dt><dd className="numeric">{Math.round(result.stats.d90)}μm</dd></div>
        <span className="sep">·</span>
        <div><dt>균일도</dt><dd className="numeric">{result.stats.uniformity.toFixed(2)}</dd></div>
        <span className="sep">·</span>
        <div><dt>Fines</dt><dd className="numeric">{result.stats.finesPercent.toFixed(1)}%</dd></div>
      </dl>

      {/* 3차 — 경고 (있을 때만) */}
      {warnings.length > 0 && (
        <ul className="result-warnings" aria-label="경고">
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}

      {/* 3차 — 검출 동전 메타 */}
      <p className="text-caption text-secondary">
        📐 {result.coin.coinType}원 인식됨 ({result.coin.diameterMm}mm) · 분석 {Math.round(result.durationMs)}ms
      </p>

      {/* 3차 sticky — 디스클레이머 */}
      <DisclaimerBanner />

      {/* CTA */}
      {!saved ? (
        <button className="btn-primary"
                onClick={async () => { await saveHistory({ ...result, frame }); setSaved(true); }}>
          측정 저장
        </button>
      ) : (
        <>
          <Toast role="status" autoDismissMs={3000}>측정 기록이 저장되었어요</Toast>
          <button className="btn-secondary" onClick={() => setLocation('/home')}>홈으로</button>
        </>
      )}
    </main>
  );
}
```

---

## 수용 기준

- [ ] 결과 화면이 plain.md **Section 19-2 wireframe** 위계 정확 적용 (1차/1.5차/2차/3차/CTA)
- [ ] **inline data list 사용** (4 카드 X — Section 19-7 결정)
- [ ] **신뢰도 가로 바** + 점수 + DESIGN.md semantic color (≥8 success / 5~7 warning / <5 error)
- [ ] 헤드라인이 **D50 측정값** 그대로 표시 — 도구별 적정성 라벨 ("V60 적정" 등) 없음
- [ ] 신뢰도 < 5 시 경고 배지 + 재측정 권장 메시지
- [ ] 입자 < 100 시 경고 추가
- [ ] **디스클레이머 sticky 영구 노출** (스크롤해도 보임)
- [ ] 저장 후 toast + 홈 이동 버튼 ("다른 도구로 보기" chip 없음)
- [ ] Recharts 가 결과 화면 진입 시점에만 로드 (번들 분리 확인)
- [ ] DESIGN.md 토큰 100% 사용 (CSS 변수 없는 hex/spacing 0)
- [ ] a11y reading order 검증 (aria-label "분쇄도 720 마이크로미터, 신뢰도 7점")
- [ ] 신뢰도 바 색맹 대응 (색 + 점수 + 바 길이 3중)

### Phase 2 추가 (Phase 0/1 미적용)
- [ ] `ResultAdBanner` 컴포넌트 작성, `VITE_APP_PHASE='2'` 일 때만 마운트
- [ ] 측정 저장 CTA 아래, 디스클레이머 sticky 와 별도 영역
- [ ] 광고 사전 로딩 (분석 시작 시점에 useTossBanner 초기화)
- [ ] 광고 종료 후 결과 화면 정상 복귀 (검수 4-5)

---

## 테스트

### tests/components (smoke)
- ConfidenceBar score=8, variant=success → 정상 렌더 + green 클래스
- ConfidenceBar score=3, variant=error + warningText → warning 텍스트 표시
- Histogram diameters=[100, 200, 300] → SVG bar 3개 렌더 (jsdom 환경)

### tests/routes/result.test.tsx (smoke)
- result 없으면 `/home` redirect
- error 있으면 ErrorScreen 렌더
- result 있으면 D50 + 신뢰도 + 히스토그램 + 디스클레이머 모두 렌더
- 저장 버튼 클릭 → saveHistory 호출 + saved 상태 전환

> **추천 매트릭스 단위 테스트는 제거됨** (Option A — 추천 로직 자체 없음)

---

## 검수 영향

- **plain.md Section 4-4** (UX 제약) — CTA "측정 저장" 만 있고 외부 유도 0개
- **결과 화면 디스클레이머**: 도구별 추천이 사라져 "절대 권장값" 인상 자체가 없음. 디스클레이머는 측정값 정확성 한계 강조용으로 유지

---

## 위험 / 함정

- ⚠️ **Recharts 번들 ~100KB**: `lazy()` 동적 import 안 하면 첫 페이지 번들에 포함 → 인트로 느려짐. 반드시 결과 화면 진입 시점에만 로드
- ⚠️ **히스토그램 binning**: 입자 수가 적으면 (< 50) bins=20 부적절. count 기반 적응형 또는 fixed 권장
- ⚠️ **디스클레이머 위치**: 결과 카드 *옆* 권장 (작은 글씨로 footer 에 두면 안 보임). visual-hierarchy 약하게라도 항상 보이게
- ⚠️ **D50 라벨만으로 사용자 가치 부족 우려**: 도구별 추천이 빠졌으니 "이 숫자가 무슨 의미?" 혼란 가능. inline data list 와 히스토그램이 보조하지만 베타 D13~17 피드백 모니터링 필요. 가치 부족 판명 시 정적 가이드 테이블(푸어오버 0.6~0.9mm 등) 추가 검토 (Phase 1)

---

## 참조

- [plain.md Section 5 (결과 화면)](../plain.md)
- [plain.md Section 19-2 결과 wireframe](../plain.md)
- [Recharts 문서](https://recharts.org/)

---

## Handoff Notes

이 feature 가 **사용자가 보는 가치의 거의 전부** — 분석 정확도(F04~F06) 가 백스테이지면, 결과 화면이 무대.

**디스클레이머는 디자인 욕심에 작게 만들지 말 것**. plain.md 에서 결정된 사용자 신뢰 방어선. 결과 카드와 같은 시각 가중치로.

도구별 추천이 빠지면서 화면이 매우 단순해졌음. 그만큼 **히스토그램과 inline data list 의 가독성/매력**이 화면 가치를 결정. 차트 색·바 두께·수치 typography 신경 써서.

다음 feature (F08) 가 결과 저장 통합. 이 feature 의 "측정 저장" 버튼은 placeholder 호출만 두고 실제 저장 로직은 F08.

---

## 추가 (2026-05-02, Phase 1) — Brewing Guide (4 카테고리 정적 가이드) ~~deprecated~~

> ⚠️ **이 섹션은 superseded 됨** (2026-05-02 같은 날 reform).
> SSOT 는 아래 ["정책 변경 4가지" → "#3. brewing-guide — 3 카테고리 (4→3 단순화)"](#3-brewing-guide--3-카테고리-43-단순화). 4-카테고리 (350/500/800) 임계값과 `classifyD50` 시그니처 (`very_fine/fine/medium/coarse`) 는 측정 ±200μm 편향으로 boundary mis-classification 빈번해 폐기, 3-카테고리 (500/900, `fine/medium/coarse`) 로 단순화 — 코드 `src/lib/brewing-guide.ts` 가 SSOT 와 일치. 본 섹션은 design rationale 이력으로만 보존.

### 배경

원 spec 위계 #4 의 "히스토그램 + inline data list" 만으로는 사용자 가치 부족 가능성이 baseline 우려로 명시됨 (Section 위험/함정 "D50 라벨만으로 사용자 가치 부족 우려"). 베타 D13~17 피드백을 기다리지 않고 **Phase 1 정적 가이드 테이블** 을 선제 도입 — Section 7 "Phase 1 베타 피드백에서 '숫자만으로 가치 부족' 판명 시 정적 가이드 테이블 추가 검토" 의 후속 실행.

### 핵심 원칙

1. **표준 sieve 임계값 사용** — 우리가 결정/조정할 영역 X. 일반 barista 가이드 (Hoffmann/SCA/PDG 등) 의 sieve 기준 D50 임계값을 그대로 사용.
2. **4 카테고리만 분류** — 도구 세분화 (V60/Origami/Kalita/Chemex 등) X. 사용자가 구분하고 싶은 단위는 "추출 방식" 단위 (에스프레소/모카포트/핸드드립/프렌치프레스).
3. **절대 권장 X, 안내** — 디스클레이머 + caveat 와 함께 사용. 측정 정확도 한계 인정.
4. **Layer 분리** — D50 입력은 sieve-equivalent (calibration 적용 후) 임을 전제. raw image D50 직접 사용 X (F06 추가 섹션 참조).

### 신규 파일 — `src/lib/brewing-guide.ts`

```ts
export interface BrewingGuide {
  primary: string[];   // 가장 적합 (1~2개)
  secondary: string[]; // 차선 (조건부)
  avoid: string[];     // 비추천 + 이유
  caveat?: string;     // 균일도 / 클럼프 기반 안내 (있을 때만)
}

/** 분쇄도 분류 — D50 기준 (μm), 표준 sieve 임계값 (4 카테고리). */
function classifyD50(d50: number): "very_fine" | "fine" | "medium" | "coarse" {
  if (d50 < 350) return "very_fine"; // 에스프레소
  if (d50 < 500) return "fine";       // 모카포트
  if (d50 < 800) return "medium";     // 핸드드립
  return "coarse";                    // 프렌치프레스 / 콜드브루
}

export function buildBrewingGuide(input: {
  d50: number;            // sieve-equivalent 전제
  uniformity: number;     // image-space (invariant)
  clumpAreaRatio: number; // 0~100 %
}): BrewingGuide;
```

#### 도구 매핑 (4 × 4 매트릭스)

| 분류 | sieve D50 (μm) | primary | secondary | avoid |
|---|---|---|---|---|
| very_fine | < 350 | 에스프레소 | 모카포트 (조금 굵게) | 핸드드립 · 프렌치프레스 |
| fine | 350–500 | 모카포트 | 에스프레소 (조금 곱게) | 프렌치프레스 |
| medium | 500–800 | 핸드드립 | 모카포트·프렌치프레스 (양 끝 조정) | 에스프레소 |
| coarse | 800+ | 프렌치프레스 · 콜드브루 | 핸드드립 (조금 곱게) | 에스프레소 · 모카포트 |

#### Caveat (균일도 + 클럼프)

| 조건 | 메시지 톤 |
|---|---|
| `clumpAreaRatio ≥ 40` | 강한 경고 — burr 점검 권장 (puck 같은 진짜 문제) |
| `20 ≤ clumpAreaRatio < 40` | 약한 안내 — "일부 입자가 뭉쳐 있어요. 분쇄 후 가볍게 흔들어 평탄하게..." (grinder 비난 X) |
| `clumpAreaRatio < 20` | caveat 없음 (전문가급 burr 도 정전기 cluster 로 일정 비율 발생, false alarm 방지) |
| uniformity > 8 | "매우 불균일 — 칼날 그라인더 또는 무뎌진 burr 의심" |
| 6 < uniformity ≤ 8 | "편차 큼 — 침지/압력 추출 권장" |

> **uniformity 임계값은 image-space**: D90/D10 비율은 ratio calibration 으로 변환 안 됨. sieve 표준 임계값 (2.5/3.5/5.0) 직접 적용 시 좋은 burr 도 "uneven" false alarm. anchor: VS3 + Hyperhoba (전문가급) image uniformity ≈ 4.95 → "good" 으로 분류돼야 정상.

### Result UI 변경 (`routes/result.tsx`)

#### 위계 변경 (원 spec wireframe + 추가)

| 위계 | 원 spec | 추가/변경 |
|---|---|---|
| 1차 헤드라인 | "D50 720μm" | **"분쇄도 720μm"** — 사용자 친화 라벨 |
| 1.5차 신뢰도 | confidence bar | (변경 없음) |
| 2차 히스토그램 | 일반 bar chart | **CDF line + ReferenceDot (10/50/90%)** 추가 |
| 3차 inline data | "D10·D90·균일도·Fines" | **"작은쪽·중앙·큰쪽·균일도·미분"** 한국어 라벨 + 데이터 진행 순서 (작 → 중 → 큰) |
| **신규 2.5차** | — | **추출 가이드 섹션** ("☕ 어떻게 추출할까요?") — primary/secondary/avoid + caveat |

#### Fines 라벨 명확화

```tsx
<dt
  className="text-caption"
  title="image 측정 기준 작은 입자 (≤300μm) 면적 비율 — 같은 분쇄 내 상대 비교용"
>
  미분
</dt>
```

`statistics.ts` 의 `FINES_THRESHOLD_UM = 300` 은 **image-space** 정의 — sieve 표준 fines (<300μm sieve) 와 다름. UI 라벨 "미분" 은 한국 커피 용어 친화도 + tooltip 으로 정확한 정의 안내. 사용자가 외부 sieve 가이드와 직접 비교 X (상대 비교용).

### 수용 기준 추가

- [ ] `buildBrewingGuide()` 가 D50 sieve-equivalent 입력 → 4 카테고리 매핑 → primary/secondary/avoid 반환
- [ ] D50 임계값 (`<350 / 350-500 / 500-800 / 800+`) 은 표준 sieve 기준 — 코드 변경 시 외부 reference 인용 필수
- [ ] clump caveat 임계 (20%/40%) — VS3 같은 전문가급 burr 가 false alarm 받지 않음을 fixture 검증
- [ ] 결과 화면에 "추출 가이드" 섹션 표시 (primary/secondary/avoid 라벨링)
- [ ] 헤드라인 라벨 "분쇄도 N μm" (D50 prefix 제거)
- [ ] inline data list 한국어 라벨 ("작은쪽/중앙/큰쪽" — D10/D50/D90 prefix 제거)
- [ ] 미분 tooltip 에 image-space 정의 명시

### 단위 테스트 추가

`tests/lib/brewing-guide.test.ts`:
- `classifyD50` 경계값 (349 → very_fine, 350 → fine, 499 → fine, 500 → medium, 799 → medium, 800 → coarse)
- `buildBrewingGuide({d50: 700, uniformity: 4.95, clumpAreaRatio: 24})` → primary=["핸드드립"], caveat 약한 안내
- `buildBrewingGuide({d50: 250, uniformity: 5, clumpAreaRatio: 54})` → primary=["에스프레소"], caveat 강한 경고

### 위험 / 함정

- ⚠️ **임계값 수정 충동 금지**: 외부 표준 (Hoffmann/SCA 등) 기준이라 임의 조정 X. 측정 정확도 안 맞으면 calibration layer (F06 추가 섹션) 로 align 하는 게 정도.
- ⚠️ **Phase 1 anchor 1점 의존**: VS3 anchor 만으로 calibration 임시 보정 — espresso/coarse 영역 검증 부족. ground-truth fixture 4종 추가 시 ratio 재보정 필요.
- ⚠️ **fines 라벨 모호성**: "미분" 단어는 한국 커피 친숙도 우선. 외부 sieve 가이드와의 직접 비교 X (tooltip 명시).
- ⚠️ **caveat 메시지 톤**: grinder 비난 톤은 false alarm 시 사용자 신뢰 손상. "촬영 시 일부 뭉침" 같은 객관적 톤 유지.

## 추가 (2026-05-02 revision) — 4-anchor 검증 후 정책 변경 (핸드드립 우선)

### 배경

VS3 4-anchor sieve fixture (5.1 espresso / 9 moka / 11 pour-over / 13 french press) 측정 결과:
- image D50 가 사용자 의도와 monotonic 하지 않음 (11≈13 < 9≈5.1)
- 원인: mmPerPx (camera distance) 에 따른 sub-pixel particle 검출 한계
- 단일 ratio 로 4-anchor 모두 정확 보정 불가 (ratio: 5.1=1.21 → 13=4.50)

### 정책 변경 4가지

#### 1. CLUMP filter — hard cap 절대값 (multiplier 폐지)

`statistics.ts`:
```diff
- const CLUMP_MIN_DIAMETER_UM = 2000;
- const CLUMP_MEDIAN_MULTIPLIER = 4;
- clumpThresholdUm = max(CLUMP_MIN_DIAMETER_UM, tempD50 * CLUMP_MEDIAN_MULTIPLIER);
+ const CLUMP_MIN_DIAMETER_UM = 2000;
+ clumpThresholdUm = CLUMP_MIN_DIAMETER_UM;  // 절대 cap
```

이유: D50×4 multiplier 가 양성 피드백 루프 (응집이 D50 부풀림 → threshold 도 부풀림 → 응집 살아남음). 사용자 지시 "프랜치프레스 용 이상 사이즈 제외" 충실.

#### 2. IMAGE_TO_SIEVE_RATIO — pour-over anchor

`calibration.ts`: 2.8 → **3.3** 변경.

- Anchor: Setting 11 (V60 pour-over, mmPerPx 0.045 = 가장 정확한 측정 조건)
- 계산: image D50 198 / V60 표준 700μm = 3.54 → 3.3 보수적 round
- 한계 인정: 다른 grind 영역 (espresso/coarse) 은 mismatch — confidence 표시로 대응

#### 3. brewing-guide — 3 카테고리 (4→3 단순화)

`brewing-guide.ts`:

| sieve D50 (μm) | label | primary | secondary | avoid |
|----------------|-------|---------|-----------|-------|
| < 500 | 미세 | 에스프레소·모카포트 | — | 핸드드립·프렌치프레스 |
| 500-900 | 중간 | 핸드드립 | 모카포트(곱게)·프렌치프레스(굵게) | 에스프레소 |
| > 900 | 거침 | 프렌치프레스·콜드브루 | 핸드드립(곱게) | 에스프레소·모카포트 |

이유: 측정 ±200μm 편향. 4-카테고리 (350/500/800) 는 boundary mis-classification 빈번. 800→900 buffer 도입.

표준 sieve 임계값에서 단순화이지만 외부 표준의 본질 (fine/medium/coarse) 은 유지. brewing 추천은 4-도구 모두 노출 (primary/secondary).

#### 4. mmPerPixel 기반 measurement confidence

`brewing-guide.ts` 의 `buildBrewingGuide` 입력에 `mmPerPixel` 추가:

| mmPerPixel | confidence | 의미 |
|------------|-----------|------|
| ≤ 0.05 | high | Setting 11 anchor 수준 — fine grind 까지 정확 |
| ≤ 0.07 | medium | 보통 — fine grind 측정 시 일부 sub-pixel 누락 |
| > 0.07 | low | 멀리 촬영 — 가까이 다시 촬영 권장 |

UX: medium/low 시 caveat 표시 ("동전이 화면 30% 이상 차지하도록 더 가까이 촬영").

### Result UI 변경

```tsx
<h2 className="text-h3 result-section-title">
  ☕ 어떻게 추출할까요?{" "}
  <span className="result-grind-label">{guide.grindLabel}</span>
</h2>
```

3-카테고리 라벨 ("미세"/"중간"/"거침") 을 헤더 옆에 chip 으로 표시. CSS: `.result-grind-label` (primary tinted background).

### 검증

`tests/opencv/pipeline.test.ts`: ratio 2.8 → 3.3 반영.
`tests/opencv/statistics.test.ts`: 비현실 입자 (10mm) → 현실 입자 (500μm) 로 수정 (CLUMP cap 통과).
4-anchor fixture 측정 결과 → `fixtures/manifest.json` `calibration_2026_05_02_revision_pour_over_anchor` 섹션.

### Phase 2 TODO

- sieve 분급된 ground-truth fixture (≤500/500-1000/>1000μm 분리)
- mmPerPixel-aware 적응형 ratio (선형 회귀: ratio = a + b*mmPerPx)
- Sub-pixel 입자 추정 (fine grind 한계 극복)
- Phase 1 mismatch fixture 재촬영 (mmPerPx 0.045 도달 시 분류 정확도 검증)
