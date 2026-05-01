import { useLocation } from "wouter";
import "./permission-denied-screen.css";

/**
 * 카메라 권한 거부 시 표시 — 설정 진입 안내.
 *
 * F09 D10 시점에 텍스트 토스 가이드와 정합 검증.
 * 현재는 명확한 안내 + 홈 복귀 + (가능 시) 설정 진입 hint.
 */
export function PermissionDeniedScreen() {
  const isIOS = /iPhone|iPad/.test(navigator.userAgent);
  const [, setLocation] = useLocation();

  return (
    <main className="permission-denied" aria-label="카메라 권한 안내">
      <div className="permission-denied-icon" aria-hidden="true">
        🔒
      </div>
      <h1 className="text-h2">카메라 권한이 필요해요</h1>
      <p className="text-body-large permission-denied-description">
        분쇄도 측정을 위해 카메라 권한을 허용해주세요.
      </p>

      <section className="permission-denied-section">
        <h2 className="text-h4">설정에서 권한 허용하기</h2>
        {isIOS ? (
          <ol className="permission-denied-steps">
            <li>아이폰 설정 앱 열기</li>
            <li>토스 → 카메라</li>
            <li>"허용" 선택</li>
            <li>토스로 돌아와서 다시 시도</li>
          </ol>
        ) : (
          <ol className="permission-denied-steps">
            <li>안드로이드 설정 → 앱 → 토스</li>
            <li>권한 → 카메라</li>
            <li>"허용" 선택</li>
            <li>토스로 돌아와서 다시 시도</li>
          </ol>
        )}
      </section>

      <button
        type="button"
        className="btn-primary"
        onClick={() => setLocation("/home")}
      >
        홈으로
      </button>
    </main>
  );
}
