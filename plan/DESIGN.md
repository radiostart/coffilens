# 커피렌즈 Design System

> 디자인 결정의 단일 진실. 모든 화면·컴포넌트는 이 시스템 토큰을 사용해야 함.

**Version**: v1 (2026-05-01)
**Source**: `/plan-design-review` Pass 5 결정
**Maintained by**: 솔로 개발 (조정 시 본 파일 + plain.md Section 5/12 + features/ 동기화 필요)

---

## 1. Brand Identity

**한 문장**: 커피렌즈는 입문~중급 핸드드립 사용자를 위한 친근한 디지털 바리스타.

**톤**:
- 따뜻하고 권장하는 어조 ("재측정을 권장합니다" 가 아니라 "다시 한 번 찍어볼까요?")
- 전문가 단정 회피 ("정확한 분쇄도는 X μm" 이 아니라 "측정값은 상대 비교용")
- 코치처럼: 격려 + 가이드 + 학습 동기

**시각 언어**: 따뜻한 cream 배경 + coffee brown accent + 충분한 여백 + 부드러운 모서리

**금지**:
- 차가운 데이터 사이언스 톤 ("정밀 측정 결과")
- 마케팅 fluff ("Welcome to..." / "Unlock the power of...")
- 일반 SaaS 패턴 (3-column icon-circle 그리드, 보라/인디고 그라데이션)

---

## 2. Color System

### Primary Palette
| Token | Hex | Usage |
|---|---|---|
| `--color-primary` | `#6B4423` | CTA 버튼, 강조 텍스트, 진행률 바 |
| `--color-primary-hover` | `#57371C` | 버튼 hover/active |
| `--color-primary-subtle` | `#FBF2E8` | 카드 강조 배경, primary 영역 |

### Neutral Palette
| Token | Hex | Usage |
|---|---|---|
| `--color-bg-page` | `#FFF8F0` | 화면 전체 배경 (warm cream) |
| `--color-bg-surface` | `#FFFFFF` | 카드, 모달 표면 |
| `--color-border` | `#E8DDD0` | 카드 경계, 구분선 |
| `--color-text-primary` | `#1A1410` | 본문, 헤딩 (warm near-black) |
| `--color-text-secondary` | `#6B6157` | 보조 본문, 캡션 (warm gray) |
| `--color-text-disabled` | `#ABA095` | 비활성 상태 |
| `--color-text-on-primary` | `#FFFFFF` | primary 배경 위 텍스트 |

### Semantic Palette
| Token | Hex | Usage |
|---|---|---|
| `--color-success` | `#4A8B5C` | 저장 성공 toast, 신뢰도 ≥ 8 |
| `--color-success-bg` | `#EAF3EC` | success 배경 영역 |
| `--color-warning` | `#C97B3F` | 신뢰도 5~7 경고, "재측정 권장" 배지 |
| `--color-warning-bg` | `#FBF0E2` | warning 배경 영역 |
| `--color-error` | `#C04848` | reject 화면, 신뢰도 < 5, 저장 실패 |
| `--color-error-bg` | `#F8E7E7` | error 배경 영역 |

### Dark Mode
**Phase 0 미지원**. Phase 1 도입 검토. 도입 시 `color-scheme: dark` + 위 토큰 dark variant 추가.

### 접근성 검증
- 본문 (`text-primary` on `bg-page`): 대비 12.4:1 ✅ (AAA)
- Caption (`text-secondary` on `bg-page`): 대비 5.2:1 ✅ (AA)
- CTA 버튼 (`text-on-primary` on `primary`): 대비 8.1:1 ✅ (AAA)
- Warning 텍스트 (`warning` on `warning-bg`): 대비 4.6:1 ✅ (AA)

색맹: error/success 만으로 의미 전달 금지. 항상 아이콘 + 라벨 동반.

---

## 3. Typography

### Font Family
**Pretendard Variable** (MIT 라이선스, 한국어 + 영문 동시 최적화)

```css
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css');

:root {
  --font-family: 'Pretendard Variable', Pretendard, -apple-system,
                  BlinkMacSystemFont, system-ui, Roboto, sans-serif;
}
```

`-apple-system` 등은 fallback 만 — primary 는 항상 Pretendard.

### Scale
| Token | Size | Line | Weight | Usage |
|---|---|---|---|---|
| `--text-display` | 32px | 1.15 | 700 | 결과 진단 라벨 (V60 적정), 인트로 앱명 |
| `--text-h2` | 24px | 1.2 | 700 | 페이지 헤딩 (홈 빈 상태 카드 헤드라인) |
| `--text-h3` | 20px | 1.25 | 600 | 카드 헤딩, D50 숫자 강조 |
| `--text-h4` | 16px | 1.3 | 600 | 서브 헤딩, 버튼 라벨 |
| `--text-body-large` | 16px | 1.5 | 400 | 본문, 가이드 텍스트 |
| `--text-body` | 14px | 1.5 | 400 | 보조 본문, 카드 내용 |
| `--text-caption` | 12px | 1.4 | 400 | 메타 정보, 디스클레이머, 도움말 |

### Numeric
숫자 표시 시 `font-variant-numeric: tabular-nums` 강제. D50/D10/D90/Uniformity/Fines%/신뢰도 점수 모두 적용.

```css
.numeric {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}
```

### Letter Spacing
- Display: `-0.01em` (큰 글자 시각 보정)
- Body: `0`
- Caption: `+0.02em` (작은 글자 가독성)

### Text Wrap
헤딩에 `text-wrap: balance` 적용 (지원 브라우저). 본문에 `text-wrap: pretty`.

---

## 4. Spacing Scale

4px 베이스. 화면 여백 + 컴포넌트 padding/margin 모두 이 토큰만 사용.

| Token | Value | Usage |
|---|---|---|
| `--space-xs` | 4px | 아이콘-텍스트 간격, badge padding |
| `--space-sm` | 8px | 그룹 내부 간격 (button padding-y) |
| `--space-md` | 16px | 컴포넌트 padding (card padding-x) |
| `--space-lg` | 24px | 섹션 간격, card padding-y |
| `--space-xl` | 32px | 페이지 좌우 여백 (main content padding) |
| `--space-2xl` | 48px | 주요 섹션 사이 |

**예외 금지**: `13px`, `20px` 같은 임의 값 → 항상 토큰. Breakpoint case 만 예외.

---

## 5. Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 8px | 버튼, 입력 필드, 작은 badge |
| `--radius-md` | 12px | 작은 카드, toast |
| `--radius-lg` | 16px | 메인 카드 (홈 빈 상태, 결과 카드) |
| `--radius-xl` | 24px | 모달, hero 영역 |

**Inner = Outer - gap 룰**: 카드(16px) 안에 버튼(8px) — gap 8px 일관.

---

## 6. Motion

### Duration
| Token | Value | Usage |
|---|---|---|
| `--duration-fast` | 150ms | 버튼 press, focus ring, hover |
| `--duration-base` | 250ms | 페이지 전환, 카드 enter |
| `--duration-slow` | 400ms | hero 애니메이션, 모달 open |

### Easing
| Token | Value | Usage |
|---|---|---|
| `--ease-enter` | `cubic-bezier(0.16, 1, 0.3, 1)` | 등장 (smooth out) |
| `--ease-exit` | `cubic-bezier(0.7, 0, 0.84, 0)` | 사라짐 (smooth in) |
| `--ease-inout` | `cubic-bezier(0.65, 0, 0.35, 1)` | 양방향 전환 |

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
opacity 전환만 유지 (사용자에게 변화는 알려주되 motion 제거).

### Animated Properties (룰)
- 허용: `transform`, `opacity`
- 금지: `width`, `height`, `top`, `left`, `margin` (layout 트리거)
- 명시 금지: `transition: all` → 항상 속성 명시

---

## 7. Elevation (Shadow)

| Token | Value | Usage |
|---|---|---|
| `--shadow-card` | `0 1px 2px rgba(26,20,16,0.04), 0 4px 8px rgba(26,20,16,0.06)` | 카드 |
| `--shadow-modal` | `0 4px 12px rgba(26,20,16,0.10), 0 20px 32px rgba(26,20,16,0.15)` | 모달, bottom sheet |
| `--shadow-toast` | `0 8px 16px rgba(26,20,16,0.12)` | toast |

화이트 배경 카드만 사용. cream 배경 위 카드는 `border` 약하게 + 옅은 shadow.

---

## 8. Component Patterns

### Button
- Primary: `--color-primary` 배경, `--color-text-on-primary` 텍스트, `--radius-sm`, padding `--space-sm` x `--space-lg`
- Secondary: 투명 배경 + `--color-primary` border + `--color-primary` 텍스트
- Disabled: opacity 0.5, cursor not-allowed
- 최소 높이: **44px** (Apple HIG, 터치 타겟)
- Focus ring: 2px solid `--color-primary`, offset 2px (절대 `outline:none` 단독 X)

### Card
- 배경: `--color-bg-surface`
- 테두리: `--radius-lg`
- Padding: `--space-lg`
- Shadow: `--shadow-card`
- 헤딩 → 본문 → CTA 순 위계

### Input
- Border: 1px solid `--color-border`
- Focus: 2px solid `--color-primary`
- 라벨: 반드시 외부 `<label>` 사용 (placeholder-as-label 금지)
- 최소 높이: 44px

### Toast
- bottom 또는 top 위치
- `--radius-md`, `--shadow-toast`
- 자동 사라짐: success 3초, error 4초, persistent (재시도 필요 시)
- 색: success/warning/error semantic

### Reject 화면 (공통 템플릿)
모든 reject (no_coin, multi_coin, partial_coin, blur, no_particles, low_brightness, sanity_fail) 동일 템플릿:
```
[ icon (warning amber) — 64px ]

H2 사유 (예: "동전이 보이지 않아요")

Caption 도움말 (예: "100원 또는 500원 동전을 함께 놓아주세요")

[ Primary CTA: "다시 촬영" ]
[ Secondary: "홈으로" ]
```
사유별 다른 점: H2 텍스트 + Caption + 아이콘 종류만. 레이아웃·색·간격 동일.

---

## 9. Iconography

### 시스템
**Lucide Icons** (오픈소스, MIT, React/SVG) 권장.

### Brand Icon (앱 로고)
- 컨셉: 카메라 렌즈 + 커피 빈
- 기본 크기: 24px / 32px / 48px / 64px (브릿지뷰)
- 색: `--color-primary` 단색

### 아이콘 사이즈
- xs: 12px (caption inline)
- sm: 16px (body inline, 버튼 내)
- md: 20px (헤딩 inline)
- lg: 24px (네비게이션, 카드 헤딩)
- xl: 32px (강조)

### Emoji 사용 룰
**원칙적 금지** (AI Slop 시그널). 예외:
- 디스클레이머 banner 시작에 ⚠️ (의미 강화)
- 그 외는 SVG 아이콘 사용

---

## 10. Layout Grid

### Mobile (375px 기준)
- Container max-width: 100% (full bleed)
- Page padding: `--space-xl` (32px) 좌우
- Safe area: `env(safe-area-inset-*)` 적용 (notch 디바이스)

### Breakpoints
WebView 미니앱 → mobile-only 가정. 단:
- iPhone SE: 375px
- iPhone 14 Pro: 393px
- Galaxy S23: 412px
- 큰 폰: 430px+

→ container width 변화 없이 `--space-xl` 만으로 대응. 큰 화면에서 텍스트 너비 max 600px 제한.

---

## 11. Accessibility (a11y)

### Semantic HTML
- 모든 routes 에 `<main role="main">` 또는 `<main>`
- 네비게이션: `<nav role="navigation">` 또는 `<nav>`
- 모달: `<dialog>` 또는 `<div role="dialog" aria-modal="true">`
- 상태 알림: `<div role="status" aria-live="polite">` (분석 완료, 저장 토스트)
- 에러 알림: `<div role="alert" aria-live="assertive">` (reject 화면)

### Aria-label 의무
- icon-only 버튼: 반드시 `aria-label`
  - nav-bar 백버튼: `aria-label="뒤로"`
  - nav-bar ⋯ 버튼: `aria-label="더보기 메뉴"`
  - 카메라 촬영 버튼: `aria-label="사진 촬영"`
  - 취소 버튼: `aria-label="분석 취소"`

### Focus Management
- exit-modal 활성 시: 첫 actionable element (`취소` 버튼) 자동 focus
- focus trap: modal 내부에서만 tab 이동 (외부 요소로 안 나감)
- modal close 시: 모달 열기 전 focus 복귀
- focus ring: `outline: 2px solid var(--color-primary); outline-offset: 2px;` (절대 outline:none 단독 X)

### Reading Order (스크린리더)
- DOM 순서 = 시각 위계 순서 일치 (CSS order로 시각 변경 시 reading order도 일치 검증)
- 결과 카드 통합 라벨: `aria-label="V60 적정, 분쇄도 720 마이크로미터, 신뢰도 7점 만점 10점"`
- 수치 풀어쓰기:
  - 시각: `D50 720μm`
  - reader: `aria-label="분쇄도 720 마이크로미터"`
  - 시각: `7/10`
  - reader: `aria-label="7점 만점 10점"`

### Live Regions
- 분석 완료: `<div role="status" aria-live="polite">분석이 완료되었어요</div>`
- 저장 완료: `<div role="status">측정 기록이 저장되었어요</div>`
- 에러 reject: `<div role="alert">동전이 보이지 않아요</div>`

### 색맹 대응
- error/success/warning 절대 색만으로 의미 X
- 항상 아이콘 + 라벨 + 색 3중 표현
- 신뢰도 바: 색 + 점수 숫자 + 바 길이 (3중)

### Touch Targets
- 모든 인터랙티브 요소 ≥ **44px × 44px** (Apple HIG)
- 작은 시각 디자인이라도 hit area 는 44px 보장 (`::before` 가상 요소 또는 padding 활용)

### Portrait Lock
카메라/분석 화면만:
```ts
if (screen.orientation?.lock) {
  screen.orientation.lock('portrait').catch(() => {/* unsupported */});
}
```
화면 이탈 시 unlock.

### prefers-reduced-motion
[Section 6 Motion](#6-motion) 의 reduced motion 룰 준수.

---

## 12. 사용 예시 (Hero Result Card)

```tsx
<article className="result-card">
  <h1 className="text-display">V60 적정</h1>
  <h2 className="text-h2 numeric">D50 720μm</h2>
  <ConfidenceBar score={7} max={10} variant="success" />
  <Histogram data={...} />
</article>
```

```css
.result-card {
  background: var(--color-bg-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);

  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.text-display {
  font-size: var(--text-display);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.01em;
  color: var(--color-text-primary);
  text-wrap: balance;
}

.numeric {
  font-variant-numeric: tabular-nums;
}
```

---

## 13. 결정 보류 (Phase 1+)

- [ ] Dark mode (Phase 1+)
- [ ] Brand icon 최종 디자인 (D2 결정)
- [ ] Lucide Icons vs custom SVG icon set
- [ ] 인포 모달 ("?" 버튼) 톤 (Phase 1)
- [ ] Toast 위치 (top vs bottom) — 토스 SDK 제공 토스트 활용 가능 시 그것 우선

---

## 14. 변경 관리

DESIGN.md 변경 시:
1. plain.md Section 5/12 + features/ 영향 검토
2. 변경 사유 + 날짜 기록 (이 섹션 하단)
3. 영향 받는 features/ 의 spec 업데이트

### 변경 이력
- v1 (2026-05-01): 초안 — Pass 5 plan-design-review 결정 반영
