# F01 — Navigation & Intro Bridge

**Status**: 🟡 미시작
**Estimated effort**: 1 day (D2)
**Dependencies**: F00 (스캐폴드 + SDK 조사 결과)
**Blocks**: F02
**plain.md 참조**: Section 4-1, 4-2, 4-3, 12 (components/, eslint-rules/), **Section 19-2 인트로 wireframe**
**DESIGN.md 참조**: Section 1 (Brand), Section 2 (Color — `--color-bg-page`, `--color-primary`), Section 3 (Typography — `--text-display`), Section 11 (a11y — nav-bar aria-label)

---

## 목표

토스 비게임 표준 내비게이션 바 + 인트로 브릿지뷰 + ESLint 룰로 자체 뒤로가기 버튼 사용 차단. **검수 반려 단골 사유 두 개 (인트로 누락, 자체 백버튼 추가) 코드 레벨 차단**.

---

## 산출물

### 신규 파일
- `src/routes/intro.tsx` — 브릿지뷰 (앱 이름 + 로고 + 대표 색상)
- `src/components/nav-bar.tsx` — 비게임 표준 nav (SDK 컴포넌트 우선)
- `src/components/exit-modal.tsx` — 종료 모달 (텍스트 자리만, 정확 매치는 F09 D10)
- `eslint-rules/no-custom-back-button.ts` — 커스텀 ESLint 룰
- `tests/eslint-rules/no-custom-back-button.test.ts` — RuleTester 양성/음성

### 수정 파일
- `src/App.tsx` — 라우터에 `/intro` 마운트
- `package.json` — eslint, @typescript-eslint/parser 추가
- `.eslintrc.json` — 커스텀 룰 등록

---

## 구현 디테일

### nav-bar.tsx

a11y (DESIGN.md Section 11):
- 백버튼 (SDK 자동 제공): `aria-label="뒤로"`
- ⋯ 더보기 버튼: `aria-label="더보기 메뉴"`
- nav 자체: `<nav role="navigation">`

```tsx
// SDK 컴포넌트가 있으면 그것을 wrapper. 없으면 fallback.
// F00 D1 조사 결과에 따라 분기.

interface NavBarProps {
  title: string;
  showHomeButton?: boolean;
  rightAction?: { icon: ReactNode; ariaLabel: string; onClick: () => void }; // 최대 1개
}

export function NavBar({ title, showHomeButton, rightAction }: NavBarProps) {
  // 좌측 백버튼은 SDK 가 자동 제공 (자체 추가 절대 X) — aria-label="뒤로" 포함
  // 중앙: 로고 + title (Pretendard --text-h4)
  // 우측: rightAction (선택, ariaLabel 강제)
  // ⋯ 더보기: SDK 공통 (신고/공유), aria-label="더보기 메뉴"
}
```

### intro.tsx

위계 (plain.md Section 19-2):
- 1차: 로고 (64px, `--color-primary`)
- 1차: 앱명 "커피렌즈" (`--text-display`, weight 700)
- 2차: 부제 "동전 하나로 분쇄도 진단" (`--text-caption`, `--color-text-secondary`)
- 배경: `--color-bg-page` (cream)

```tsx
// 검수 4-1: 앱 이름 + 로고 + 대표 색상
// 즉시 토스 로그인 유도 금지 → 서비스 설명 먼저
// Basic / Inverted 중 미니앱 분위기에 맞는 스타일 (커피 톤 + cream 배경 → Basic 권장)

export function IntroRoute() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const t = setTimeout(() => setLocation('/home'), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <main role="main" className="intro" aria-label="커피렌즈 시작 화면">
      <BrandIcon size={64} aria-hidden="true" />
      <h1 className="text-display">커피렌즈</h1>
      <p className="text-caption">동전 하나로 분쇄도 진단</p>
    </main>
  );
}
```

CSS (DESIGN.md 토큰):
```css
.intro {
  background: var(--color-bg-page);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  gap: var(--space-md);
  animation: fadeIn var(--duration-slow) var(--ease-enter);
}
```

### eslint-rules/no-custom-back-button.ts
```ts
// AST 매칭 패턴:
// 1. history.back() / history.go(-1) / window.history.back()
// 2. <button>/<Link> 의 children 텍스트가 ['뒤로', '이전', '←', '<']
// 3. router.back() (Wouter 의 useLocation 등 활용)

import type { Rule } from 'eslint';

const BLOCKED_TEXTS = ['뒤로', '이전', '←', '<'];

export const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: '자체 뒤로가기 버튼 사용 차단 (토스 검수 반려 사유)',
    },
    messages: {
      historyBack: 'history.back() / history.go(-1) 사용 금지. 토스 nav-bar 백버튼 사용.',
      backText: '버튼 텍스트 "{{text}}"는 자체 백버튼 의도로 보임. 토스 nav-bar 백버튼 사용.',
    },
  },
  create(context) {
    return {
      // history.back() / history.go(-1) 검출
      CallExpression(node) {
        // ... AST 매칭
      },
      // <button>/<Link> 텍스트 검출
      JSXElement(node) {
        // ... AST 매칭
      },
    };
  },
};
```

**솔로 단순화 옵션**: 정규식 grep 기반 lint 스크립트 (~10 LOC, package.json `scripts.lint:back-button`)
```bash
# scripts/check-back-button.sh
! grep -rn "history.back\|history.go(-1)" src/ && \
! grep -rEn '>\s*(뒤로|이전|←|<)\s*<' src/
```

### .eslintrc.json
```json
{
  "rules": {
    "local/no-custom-back-button": "error"
  },
  "plugins": ["local"]
}
```

---

## 수용 기준

- [ ] 인트로 화면이 토스 검수 4-1 항목 (앱이름+로고+대표색상) 모두 충족
- [ ] nav-bar 가 비게임 표준 4-2 항목 모두 충족
- [ ] **자체 뒤로가기 버튼 없음** (시각 검증 + ESLint 룰 검증)
- [ ] ESLint 룰 단위 테스트: 양성 케이스 (history.back 호출, "뒤로" 텍스트) + 음성 케이스 (정상 button) 통과
- [ ] `npm run lint` 통과
- [ ] 샌드박스에서 인트로 → 홈 자동 이동 동작 (또는 탭 진입)

---

## 테스트

### tests/eslint-rules/no-custom-back-button.test.ts
```ts
import { RuleTester } from 'eslint';
import { rule } from '../../eslint-rules/no-custom-back-button';

const ruleTester = new RuleTester({ parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } } });

ruleTester.run('no-custom-back-button', rule, {
  valid: [
    { code: '<button onClick={onSubmit}>제출</button>' },
    { code: 'router.push("/home")' },
  ],
  invalid: [
    { code: 'history.back()', errors: [{ messageId: 'historyBack' }] },
    { code: 'window.history.go(-1)', errors: [{ messageId: 'historyBack' }] },
    { code: '<button>뒤로</button>', errors: [{ messageId: 'backText' }] },
    { code: '<button>←</button>', errors: [{ messageId: 'backText' }] },
  ],
});
```

---

## 검수 영향

- **plain.md Section 4-1** (인트로 브릿지뷰) — 직결, 미충족 시 반려
- **plain.md Section 4-2** (nav-bar) — 직결, 자체 백버튼 추가는 대표 반려 사유
- **plain.md Section 4-3** (종료 동작) — exit-modal.tsx 자리만 만들고 텍스트 정확 매치는 F09 D10

---

## 위험 / 함정

- ⚠️ **SDK nav-bar 컴포넌트가 없는 경우**: 자체 구현. 단, 좌측 백버튼은 SDK provided 백버튼 동작과 통합 (커스텀 버튼 추가 X)
- ⚠️ **인트로에서 즉시 로그인 유도**: 검수 반려 사유. 서비스 설명 먼저, 로그인은 필요 시점에만
- ⚠️ **ESLint 룰 false positive**: 텍스트 매칭이 너무 광범위하면 `<` (꺽쇠) 같은 정상 사용도 차단. JSX text content 만 검사하도록 좁힘
- ⚠️ **Basic vs Inverted**: 커피 톤(#6B4423) 다크 컬러라 Inverted 가 어울릴 수도. 시각 비교 후 결정

---

## 참조

- [plain.md Section 4-1, 4-2, 4-3](../plain.md)
- [비게임 출시 가이드](https://developers-apps-in-toss.toss.im/checklist/app-nongame.html)
- [ESLint Custom Rules](https://eslint.org/docs/latest/extend/custom-rules)

---

## Handoff Notes

이 feature 의 핵심은 **검수 반려 차단**. 두 가지가 동시에:
1. 시각적으로 표준 준수 (인트로 + nav-bar)
2. 코드 레벨 강제 (ESLint 룰)

ESLint 룰 작성이 부담스러우면 grep 기반 스크립트로 시작 가능 (~10 LOC). 솔로 프로젝트에 충분.

F00 D1 의 SDK 조사 결과에 따라 `nav-bar.tsx` 가 SDK wrapper 인지 자체 구현인지 결정. 양쪽 다 외부 인터페이스 (`<NavBar title=... />`) 는 동일하게 유지.
