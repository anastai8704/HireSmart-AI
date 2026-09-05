// Dialog for confirmations and forms: Escape/backdrop close, scroll lock,
// role="dialog" + aria-modal, and focus moves into the dialog on open.

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

import { cn } from "../../lib/utils";

const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const Modal = ({
  isOpen,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
  closeOnBackdrop = true,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);

  // Close on Escape, and prevent the page behind from scrolling.
  useEffect(() => {
    if (!isOpen) return undefined;

    returnFocusRef.current = document.activeElement;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
      if (event.key === "Tab" && panelRef.current) {
        const items = [
          ...panelRef.current.querySelectorAll(
            'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
          ),
        ];
        if (!items.length) {
          event.preventDefault();
          return;
        }
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    // Move focus into the dialog so keyboard users are not left behind it.
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm animate-[fade-in_0.2s_ease-out_both]"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full overflow-hidden rounded-[var(--radius-card)] bg-white shadow-2xl outline-none",
          "animate-[fade-up_0.25s_ease-out_both]",
          SIZES[size],
        )}
      >
        {(title || onClose) && (
          <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
            <div className="space-y-0.5">
              {title && (
                <h2 id={titleId} className="text-base font-semibold text-ink-900">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descriptionId} className="text-sm text-ink-500">
                  {description}
                </p>
              )}
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                aria-label="Close dialog"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            )}
          </div>
        )}

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-ink-100 bg-ink-50 px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
