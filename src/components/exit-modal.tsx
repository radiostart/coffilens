import "./exit-modal.css";

interface ExitModalProps {
  open: boolean;
  onCancel: () => void;
  onExit: () => void;
}

/**
 * 종료 모달 placeholder.
 *
 * 텍스트 정확 매치 검증은 F09 D10 시점.
 * 토스 비게임 가이드와 1:1 매치 필요 — 임의 변경 금지.
 */
const EXIT_MODAL_TEXT = {
  title: "커피렌즈를 종료할까요?",
  cancel: "취소",
  exit: "종료하기",
};

export function ExitModal({ open, onCancel, onExit }: ExitModalProps) {
  if (!open) return null;
  return (
    <div className="exit-modal-backdrop" onClick={onCancel}>
      <div
        className="exit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="exit-modal-title" className="text-h4 exit-modal-title">
          {EXIT_MODAL_TEXT.title}
        </p>
        <div className="exit-modal-actions">
          <button
            type="button"
            className="exit-modal-button exit-modal-cancel"
            onClick={onCancel}
          >
            {EXIT_MODAL_TEXT.cancel}
          </button>
          <button
            type="button"
            className="exit-modal-button exit-modal-confirm"
            onClick={onExit}
          >
            {EXIT_MODAL_TEXT.exit}
          </button>
        </div>
      </div>
    </div>
  );
}
