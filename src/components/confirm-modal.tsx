import "./confirm-modal.css";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Bottom-sheet confirm 모달 — backdrop + slide-up sheet.
 * `<ExitModal>`, retake confirm 등 mobile bottom-sheet 스타일 dialog 의 공통 shell.
 */
export function ConfirmModal({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  if (!open) return null;
  const titleId = "confirm-modal-title";
  return (
    <div className="confirm-modal-backdrop" onClick={onCancel}>
      <div
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <p id={titleId} className="text-h4 confirm-modal-title">
          {title}
        </p>
        {description && (
          <p className="text-body confirm-modal-description">{description}</p>
        )}
        <div className="confirm-modal-actions">
          <button
            type="button"
            className="confirm-modal-button confirm-modal-cancel"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-modal-button confirm-modal-confirm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
