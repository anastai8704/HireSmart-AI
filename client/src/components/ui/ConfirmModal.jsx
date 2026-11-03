// Reusable confirmation dialog for destructive or consequential actions.
// Built on the shared Modal so it inherits focus trap, Escape and scroll lock.

import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

import Button from "./Button";
import Modal from "./Modal";
import { cn } from "../../lib/utils";

const TONES = {
  danger: {
    ring: "bg-danger-50 text-danger-600",
    icon: AlertTriangle,
    confirm: "danger",
  },
  warning: {
    ring: "bg-warning-50 text-warning-700",
    icon: ShieldAlert,
    confirm: "primary",
  },
  success: {
    ring: "bg-success-50 text-success-700",
    icon: CheckCircle2,
    confirm: "success",
  },
  brand: {
    ring: "bg-brand-50 text-brand-600",
    icon: ShieldAlert,
    confirm: "primary",
  },
};

export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = "Are you sure?",
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  isLoading = false,
  children,
}) => {
  const toneCfg = TONES[tone] || TONES.danger;
  const Icon = toneCfg.icon;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={toneCfg.confirm}
            size="md"
            onClick={onConfirm}
            isLoading={isLoading}
            leftIcon={<Icon className="h-4 w-4" />}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3.5">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", toneCfg.ring)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          {description && <p className="text-sm leading-6 text-ink-600">{description}</p>}
          {children}
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmModal;
