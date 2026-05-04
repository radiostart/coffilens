import { ConfirmModal } from "./confirm-modal";

interface ExitModalProps {
  open: boolean;
  onCancel: () => void;
  onExit: () => void;
}

// 토스 비게임 가이드와 1:1 매치 — 임의 변경 금지.
const EXIT_MODAL_TEXT = {
  title: "커피렌즈를 종료할까요?",
  cancel: "취소",
  exit: "종료하기",
};

export function ExitModal({ open, onCancel, onExit }: ExitModalProps) {
  return (
    <ConfirmModal
      open={open}
      title={EXIT_MODAL_TEXT.title}
      cancelLabel={EXIT_MODAL_TEXT.cancel}
      confirmLabel={EXIT_MODAL_TEXT.exit}
      onCancel={onCancel}
      onConfirm={onExit}
    />
  );
}
