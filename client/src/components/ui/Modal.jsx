/**
 * Modal.jsx
 * -----------------------------------------------------------------------------
 * A dialog used for confirmations and forms (create job, change status, etc).
 *
 * PROPER MODAL BEHAVIOUR - the details most implementations miss:
 *   - Escape closes it.
 *   - Clicking the dark backdrop closes it, clicking the panel does not.
 *   - Background scrolling is locked while it is open.
 *   - role="dialog" + aria-modal + aria-labelledby announce it correctly.
 *   - Focus moves into the dialog when it opens.
 */

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
    const panelRef = useRef(null);

    // Close on Escape, and prevent the page behind from scrolling.
    useEffect(() => {
        if (!isOpen) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                onClose?.();
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
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
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
                    SIZES[size]
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
                                <p className="text-sm text-ink-500">{description}</p>
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
