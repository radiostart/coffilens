# F02 — Home & Coin Selection & Routing

**Status**: 🟡 미시작
**Estimated effort**: 1 day (D3)
**Dependencies**: F01 (nav-bar)
**Blocks**: F07 (result 화면도 라우터 필요)
**plain.md 참조**: Section 5 (화면 플로우), Section 12 (routes/), **Section 19-2 홈 wireframe**, **Section 19-3 EMPTY state 시각 사양**
**DESIGN.md 참조**: Section 2 (Color), Section 3 (Typography — `--text-h2`/`--text-body-large`), Section 5 (`--radius-lg` for hero card), Section 7 (`--shadow-card`), Section 8 (Card component pattern)

---

## 목표

홈 화면 + **기준 동전 선택 (100원/500원)** + 촬영 가이드 화면 + 라우터 셋업. 사용자가 인트로 → 측정 시작까지 도달하는 경로.

> **컨셉 변경 (2026-05-01, Option A)**: 추출 도구 선택 (V60/Kalita 등) → 기준 동전 선택으로 교체. 추천 매트릭스 제거, 순수 측정 도구로 단순화. 동전 선택은 F04 직경 환산 정확도를 위해 사용자가 사전 지정.

---

## 산출물

### 신규 파일
- `src/routes/home.tsx` — 측정 기록 리스트 + "분쇄도 측정하기" CTA + 빈 상태 카드
- `src/routes/coin-select.tsx` — 100원 / 500원 카드
- `src/routes/capture-guide.tsx` — 촬영 가이드 (흰종이 + 선택한 동전 1개 + 균일 조명 + 가장자리 안 잘림)

### 수정 파일
- `src/App.tsx` — Wouter 라우터 셋업 + 모든 routes 마운트
- `src/stores/measurement.store.ts` — 임시 셋업 (선택 동전 저장만, 측정 결과는 F06)

---

## 구현 디테일

### App.tsx (Wouter 라우터)
```tsx
import { Route, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location'; // hash 기반, 토스 백버튼 호환

export function App() {
  return (
    <Router hook={useHashLocation}>
      <NavBar title="커피렌즈" />
      <Switch>
        <Route path="/" component={IntroRoute} />
        <Route path="/home" component={HomeRoute} />
        <Route path="/coin-select" component={CoinSelectRoute} />
        <Route path="/capture-guide" component={CaptureGuideRoute} />
        <Route path="/camera" component={CameraRoute} /> {/* F03 */}
        <Route path="/analyzing" component={AnalyzingRoute} /> {/* F03 */}
        <Route path="/result/:id?" component={ResultRoute} /> {/* F07 */}
      </Switch>
    </Router>
  );
}
```

### home.tsx

위계 (plain.md Section 19-2 홈 wireframe):
- 1차: hero card (W: 92%, `--radius-lg`, `--shadow-card`, `--space-lg` padding)
- 헤드라인 "첫 측정을 시작해보세요" (`--text-h2`, weight 700)
- body "분쇄한 원두와 동전을 같이 촬영하면 분쇄도를 측정해드려요" (`--text-body-large`)
- CTA "분쇄도 측정하기" (primary button, ≥44px, `--color-primary` 배경) → `/coin-select`
- 2차: 빈 상태 caption "아직 측정 기록이 없어요" (`--text-caption`, `--color-text-secondary`)

EMPTY state 시각 사양: Section 19-3 표 참조.

```tsx
export function HomeRoute() {
  const meta = useHistoryStore(s => s.meta); // F08에서 채움. 지금은 빈 배열 hook만.

  return (
    <main role="main" aria-label="홈" className="home">
      {meta.length === 0 ? (
        <EmptyStateCard
          title="첫 측정을 시작해보세요"
          description="분쇄한 원두와 동전을 같이 촬영하면 분쇄도를 측정해드려요"
          cta={{ label: '분쇄도 측정하기', to: '/coin-select' }}
        />
      ) : (
        <>
          <PrimaryCTA label="분쇄도 측정하기" to="/coin-select" />
          <RecordList records={meta} /> {/* F08 가상 스크롤 + thumbnail lazy */}
        </>
      )}
      {meta.length === 0 && (
        <p className="text-caption text-secondary">아직 측정 기록이 없어요</p>
      )}
    </main>
  );
}
```

기록 리스트 항목은 D50 + 신뢰도 + 날짜만 표시 (도구명 컬럼 없음).

### [Phase 2] 홈 하단 IAA 배너

Phase 0/1 출시에는 표시 X. Phase 2 진입 시점에 활성화 (사업자 등록 + 광고 단위 발급 후).

위치: 측정 기록 리스트 (또는 빈 상태 캡션) 아래, safe-area 위. 검수 4-5 룰 (인트로/로딩/모달 노출 X) 위반 없음 — 홈은 인트로 X, 모달 X, 정적 컨텐츠 화면.

```tsx
// Phase 2 추가
import { useTossBanner } from '@apps-in-toss/web-framework';

export function HomeRoute() {
  const meta = useHistoryStore(s => s.meta);
  const phase = import.meta.env.VITE_APP_PHASE; // '0' | '1' | '2'

  return (
    <main role="main" aria-label="홈" className="home">
      {/* ... 기존 hero card / record list */}

      {phase === '2' && <HomeAdBanner showInEmpty={meta.length > 0} />}
    </main>
  );
}

// Phase 2 컴포넌트
function HomeAdBanner({ showInEmpty }: { showInEmpty: boolean }) {
  const banner = useTossBanner({ position: 'bottom', /* ... 광고 단위 ID */ });

  // 빈 상태 노출 여부는 Phase 2 베타 결정. default: showInEmpty=true 이므로 노출.
  // 베타에서 goodwill 하락 발견 시 showInEmpty=false 로 전환 (1줄 수정).
  if (!showInEmpty) return null;

  return <div className="ad-slot" aria-label="광고">{banner}</div>;
}
```

CSS:
```css
.ad-slot {
  width: 100%;
  margin-top: var(--space-lg);
  padding-bottom: env(safe-area-inset-bottom);
  /* 광고 영역은 brand color 사용 X — 광고임을 명확히 */
  background: transparent;
}
```

> Phase 2 진입 시 추가 결정: (1) `VITE_APP_PHASE` 빌드 시 주입 vs 동적 토글, (2) 빈 상태 노출 여부 (default true), (3) `useTossBanner` props 전체 (광고 단위 ID, refresh interval 등). plain.md Section 18 참조.
>
> **광고 텔레메트리 augmented 버전**: [F09 추가 섹션 — Phase 2 광고 텔레메트리](F09-telemetry-polish.md) 의 `HomeAdBanner` 코드 (onLoad/onClick/onError 콜백 포함) 사용. 본 spec 의 위 코드는 텔레메트리 없는 minimal 버전.

### EmptyStateCard.tsx (DESIGN.md Card pattern)

```tsx
export function EmptyStateCard({ title, description, cta }: Props) {
  return (
    <article className="empty-card">
      <h2 className="text-h2">{title}</h2>
      <p className="text-body-large">{description}</p>
      <Link href={cta.to}>
        <button className="btn-primary">{cta.label}</button>
      </Link>
    </article>
  );
}
```

```css
.empty-card {
  background: var(--color-bg-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  width: 92%;
  margin: var(--space-2xl) auto;
}

.btn-primary {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  border-radius: var(--radius-sm);
  padding: var(--space-sm) var(--space-lg);
  min-height: 44px; /* a11y: touch target */
  font: var(--text-h4);
}

.btn-primary:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

> **Empty state 일러스트 vs 아이콘 vs 텍스트만**: plain.md Section 18 의사결정 보류 항목. D3 결정 시점에 brand identity (친근한 코치 톤) 에 맞는 라이트한 아이콘 권장. 일러스트는 Phase 1.

### coin-select.tsx
```tsx
const COINS = [
  { id: '100', name: '100원', desc: '직경 24.0mm — 다보탑', iconLabel: '100' },
  { id: '500', name: '500원', desc: '직경 26.5mm — 학', iconLabel: '500' },
] as const;

export function CoinSelectRoute() {
  const setCoinType = useMeasurementStore(s => s.setCoinType);
  const [, setLocation] = useLocation();

  function handleSelect(id: CoinType) {
    setCoinType(id);
    track({ type: 'measurement_attempt', coinType: id });
    setLocation('/capture-guide');
  }

  return (
    <main aria-label="기준 동전 선택">
      <h1>어떤 동전과 함께 찍을까요?</h1>
      <p>분쇄 입자 크기를 mm 로 환산하기 위한 기준이에요.</p>
      <ul>
        {COINS.map(c => (
          <li key={c.id}>
            <button onClick={() => handleSelect(c.id)}>
              <span aria-hidden="true">{c.iconLabel}</span>
              <strong>{c.name}</strong>
              <span>{c.desc}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

화면 디자인 노트:
- **2개 카드만**, 세로 스택 (`gap: --space-sm`)
- 카드 좌측에 동전 라벨 ("100" / "500") 원형 아이콘 (지폐 묘사 X — 추상 디스크)
- 카드 우측에 이름 + 직경 설명
- 100원과 500원 직경 차이가 작으므로 (24 vs 26.5mm), **반드시 사용자가 본인이 어떤 동전 썼는지 정확히 선택해야 측정 정확도 보장**

### capture-guide.tsx
```tsx
export function CaptureGuideRoute() {
  const coinType = useMeasurementStore(s => s.coinType);
  const coinLabel = coinType === '100' ? '100원' : '500원';

  return (
    <main>
      <h1>촬영 가이드</h1>
      <ol>
        <li>흰 종이 위에 분쇄한 원두를 얇게 펴주세요</li>
        <li><strong>{coinLabel} 동전 1개</strong>를 같이 놓아주세요</li>
        <li>균일한 조명 아래에서 촬영해주세요</li>
        <li>동전이 화면 안에 완전히 보이도록 해주세요</li>
      </ol>
      <Link href="/camera">
        <Button>촬영 시작</Button>
      </Link>
    </main>
  );
}
```

`coin-select` 에서 선택 안 하고 직접 진입 시 `/coin-select` 로 redirect (방어).

### measurement.store.ts (임시 셋업)
```ts
import { create } from 'zustand';

type CoinType = '100' | '500';

interface MeasurementState {
  coinType: CoinType | null;
  setCoinType: (c: CoinType) => void;
  reset: () => void;
}

export const useMeasurementStore = create<MeasurementState>((set) => ({
  coinType: null,
  setCoinType: (c) => set({ coinType: c }),
  reset: () => set({ coinType: null }),
}));
```

---

## 수용 기준

- [ ] 인트로 → 홈 → **동전 선택** → 가이드 → (camera placeholder) 플로우 동작
- [ ] 빈 상태 카드 노출 (측정 기록 없을 때)
- [ ] 100원 / 500원 선택 가능, 선택 시 store 에 저장 + 가이드 화면으로 이동
- [ ] 가이드 화면이 선택된 동전 종류를 명시 ("100원 동전 1개" / "500원 동전 1개")
- [ ] 토스 nav-bar 백버튼으로 모든 화면에서 뒤로 정상 이동
- [ ] **자체 백버튼 0개** (ESLint 통과)
- [ ] 가이드 화면 텍스트가 "동전 1개", "동전 화면 안에 완전히" 명시 (F04 reject 시점에 사용자가 이미 들었음)
- [ ] 동전 선택 없이 `/capture-guide` 직접 진입 → `/coin-select` redirect

### Phase 2 추가 (Phase 0/1 미적용)
- [ ] `HomeAdBanner` 컴포넌트 작성, `VITE_APP_PHASE='2'` 일 때만 마운트
- [ ] 빈 상태 노출 default true, props 1줄로 전환 가능
- [ ] safe-area-inset-bottom 적용, 시스템 nav 와 안 겹침
- [ ] 광고 종료 후 홈 화면 정상 복귀 (검수 4-5)

---

## 테스트

### 자동 테스트 (smoke)
- `tests/routes/home.test.tsx` — 빈 records 시 EmptyStateCard 렌더, records 있을 때 RecordList 렌더 (D50 + 신뢰도 표시)
- `tests/routes/coin-select.test.tsx` — 동전 카드 클릭 시 store 업데이트 + navigate 호출

### 수동 검증
- 인트로 → 홈 → 동전 → 가이드 사이클 실기기 / 샌드박스 확인
- 백버튼 동작

---

## 검수 영향

- **plain.md Section 4-2** (nav-bar) — 모든 화면에서 nav-bar 정상
- **plain.md Section 4-3** (종료 동작) — 홈에서 백버튼 → 인트로 → 백버튼 → 종료 모달 (F09 D10)
- **plain.md Section 4-4** (UX 제약) — 진입 즉시 바텀시트 자동 오픈 X, 자사 앱 유도 0개

---

## 위험 / 함정

- ⚠️ **Wouter hash 라우터**: 토스 WebView 가 history.pushState 와 충돌 시 hash 가 안전. 단, 페이지 새로고침 동작 검증 필요
- ⚠️ **EmptyStateCard 디자인 부재**: 첫인상 결정. F00 fixture 촬영 결과로 "이렇게 찍으면 분석됩니다" 예시 사진 1장 가이드에 추가 고려
- ⚠️ **동전 직경 차이가 작음**: 100원(24mm) vs 500원(26.5mm) — 약 10% 차이. 사용자가 잘못 선택하면 모든 입자 크기가 ±10% 편향됨. 카드 디자인이 명확해야 함 (라벨 큼지막하게, 직경 mm 명시)
- ⚠️ **추상 디스크 묘사**: 한국 동전 (이순신 / 학 / 다보탑) 사실적 묘사는 화폐 도용 시비 가능 — 카드 아이콘은 텍스트 라벨 + 단순 원형 (썸네일 SVG 가이드라인 참조)

---

## 참조

- [plain.md Section 5 (화면 플로우)](../plain.md)
- [plain.md Section 12 (routes/)](../plain.md)
- [Wouter 문서](https://github.com/molefrog/wouter)

---

## Handoff Notes

이 feature 는 비교적 단순. 비즈니스 로직 거의 없음 (UI + 라우팅만). **EmptyStateCard 의 카피와 가이드 텍스트가 사용자 경험의 첫 인상**이라 신경 써서 작성.

동전 선택 후 store 에 저장하는 패턴은 F04 동전 검출 시 사용자 지정 직경을 사용하기 위함. auto-classify 로직 (ratio 휴리스틱) 은 사용 안 함 — 사용자 선택이 single source of truth.

다음 feature (F03 OpenCV) 는 `/camera` 와 `/analyzing` 라우트를 채움. 이 feature 는 라우트 마운트만 하고 컴포넌트는 placeholder.

---

## 추가 (2026-05-02, Phase 1) — `/coin-locate` 라우트 (사용자 동전 위치 hint)

### 배경

D9~D12 fixture QC 에서 **multi_coin / partial_coin false rejection** 빈도 발견:
- napkin 텍스처가 동전과 유사한 mean intensity / stddev / rim gradient 의 false circle 생성 → HoughCircles + intensity 필터로 구분 불가
- sparse coffee 분포에서 napkin 사이의 빈 영역이 진짜 동전과 픽셀 통계상 동급 → fundamental ambiguity

근본 해결책 3가지 검토:
1. **Phase 1 — UX hint** ← 채택. 사용자가 동전 위치를 탭으로 알려줌
2. Phase 2 — 가이드 sticker (촬영 화면에 동전 영역 안내)
3. Phase 3 — ML patch classifier (동전 vs 배경)

### 라우터 흐름 변경

원 spec:
```
home → coin-select → capture-guide → camera → analyzing → result
```

신규 spec:
```
home → coin-select → capture-guide → camera → coin-locate → analyzing → result
                                                  ↓ (skip)
                                              analyzing (자동 검출 fallback)
```

`/coin-locate` 는 사용자 선택. **"건너뛰기 (자동 검출)"** 버튼으로 우회 가능 (기본 동작 = 자동). hint 가 있으면 detectCoin() 이 hint 가장 가까운 candidate 채택 + multi_coin/partial_coin 우회.

### 신규 파일 — `src/routes/coin-locate.tsx` + `coin-locate.css`

```tsx
export function CoinLocateRoute() {
  const frame = useMeasurementStore(s => s.frame);
  const setCoinHint = useMeasurementStore(s => s.setCoinHint);
  const [, setLocation] = useLocation();
  const [hint, setHint] = useState<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  // canvas → blob URL → img (img 가 native zoom/positioning 지원)
  useEffect(() => {
    if (!frame) { setLocation("/home"); return; }
    frame.toBlob((blob) => {
      if (!blob) return;
      blobUrlRef.current = URL.createObjectURL(blob);
      if (imgRef.current) imgRef.current.src = blobUrlRef.current;
    }, "image/jpeg", 0.9);
    return () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current); };
  }, [frame]);

  function handleTap(e: React.MouseEvent<HTMLImageElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setHint({
      x: (e.clientX - rect.left) / rect.width,   // 상대 좌표 0~1
      y: (e.clientY - rect.top)  / rect.height,
    });
  }

  function handleConfirm() {
    setCoinHint(hint);                // null 도 OK (skip)
    setLocation("/analyzing");
  }
  function handleSkip() {
    setCoinHint(null);
    setLocation("/analyzing");
  }

  return (
    <main className="coin-locate" aria-label="동전 위치 지정">
      <h1 className="text-h2">동전 위치를 알려주세요</h1>
      <p className="text-body">동전이 있는 위치를 탭하면 더 정확하게 인식할 수 있어요.</p>
      <div className="coin-locate-image-wrap">
        <img ref={imgRef} alt="촬영된 사진" onClick={handleTap} />
        {hint && (
          <span
            className="coin-locate-marker"
            style={{ left: `${hint.x * 100}%`, top: `${hint.y * 100}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      <button className="btn-primary" onClick={handleConfirm} disabled={!hint}>
        이 위치로 분석
      </button>
      <button className="btn-secondary" onClick={handleSkip}>
        건너뛰기 (자동 검출)
      </button>
    </main>
  );
}
```

### Wouter 라우터 추가

```tsx
<Route path="/coin-locate" component={CoinLocateRoute} /> {/* Phase 1 UX */}
```

라우터 순서 (배치): `/camera` 와 `/analyzing` 사이.

### Store 변경 (`measurement.store.ts`)

```ts
export interface CoinHint { x: number; y: number; } // 상대 좌표 0~1

interface MeasurementState {
  // ... 기존 필드
  coinHint: CoinHint | null;
  setCoinHint: (h: CoinHint | null) => void;
}
```

### CSS — coin-locate.css

마커는 DESIGN.md success color (--color-success) 의 펄싱 ring + 중앙 dot. 이미지에 `cursor: crosshair` 로 탭 가능 시각 단서.

### 수용 기준

- [ ] `/camera` 의 셔터/갤러리 업로드 → `/coin-locate` 진입
- [ ] 사용자가 이미지 탭하면 marker 표시 + "이 위치로 분석" 활성화
- [ ] 탭 없이 "건너뛰기" 누르면 `coinHint = null` 로 `/analyzing` 진입 (기존 자동 검출 동작)
- [ ] hint 있으면 store 에 상대 좌표 (0~1) 저장 → AnalyzingRoute 에서 `runPipeline()` 5번째 인자로 전달
- [ ] frame 없으면 `/home` redirect
- [ ] blob URL 누수 방지 (cleanup 에서 revokeObjectURL)
- [ ] 페이지 진입 시 marker 없는 빈 상태 + crosshair cursor

### 위험 / 함정

- ⚠️ **사용자 부담**: 측정 사이클이 한 단계 늘어남. "건너뛰기" 가 명확하게 보여야 함 (기본 secondary 버튼 두께)
- ⚠️ **상대 좌표 0~1 vs 절대 px**: store 는 상대 좌표 (canvas 가 downsample 되더라도 invariant). detectCoin() 안에서 hint × `gray.cols/rows` 로 절대 좌표 변환.
- ⚠️ **multi_coin 우회 의도적 X**: hint 있어도 진짜 동전이 여러 개 (test-vs3-multi.jpg 같은) 인 경우 → 사용자가 가리킨 가장 가까운 candidate 만 채택. 선택의 책임을 사용자에게 위임.
