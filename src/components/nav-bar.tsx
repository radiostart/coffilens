import type { ReactNode } from "react";
import { BrandIcon } from "./brand-icon";
import "./nav-bar.css";

interface RightAction {
  icon: ReactNode;
  ariaLabel: string;
  onClick: () => void;
}

interface NavBarProps {
  title: string;
  rightAction?: RightAction;
}

/**
 * 토스 비게임 표준 nav-bar.
 *
 * 좌측 백버튼은 토스 WebView 가 자동 제공 — 자체 추가 절대 금지 (검수 반려).
 * 중앙: 로고 + title.
 * 우측: rightAction (선택, 최대 1개).
 *
 * SDK 가 nav-bar 컴포넌트를 별도 export 하지 않음 (F00-investigation.md 확인).
 * 따라서 자체 구현. 추후 TDS 컴포넌트가 추가되면 wrapper 로 마이그레이션.
 */
export function NavBar({ title, rightAction }: NavBarProps) {
  return (
    <nav className="nav-bar" role="navigation" aria-label="상단 내비게이션">
      <div className="nav-bar-center">
        <BrandIcon size={24} />
        <span className="text-h4 nav-bar-title">{title}</span>
      </div>
      {rightAction && (
        <button
          type="button"
          className="nav-bar-right"
          onClick={rightAction.onClick}
          aria-label={rightAction.ariaLabel}
        >
          {rightAction.icon}
        </button>
      )}
    </nav>
  );
}
