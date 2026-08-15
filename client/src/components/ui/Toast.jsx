/**
 * Toast.jsx
 * -----------------------------------------------------------------------------
 * Brief confirmation messages ("Application submitted", "Job saved").
 *
 * WHY NOT alert()?
 * alert() blocks the entire browser tab, cannot be styled, and looks like a
 * 1998 website. Toasts confirm an action without interrupting the user, then
 * disappear on their own.
 *
 * Usage anywhere in the app:
 *   const toast = useToast();
 *   toast.success("Application submitted");
 *   toast.error("Could not save the job");
 */

import { useCallback, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X, XCircle } from "lucide-react";

import { ToastContext } from "./ToastContext";
import { cn } from "../../lib/utils";

const TOAST_STYLES = {
    success: {
        icon: CheckCircle2,
        className: "border-success-500/30 bg-success-50 text-success-700",
        iconClass: "text-success-500",
    },
    error: {
        icon: XCircle,
        className: "border-danger-500/30 bg-danger-50 text-danger-700",
        iconClass: "text-danger-500",
    },
    warning: {
        icon: AlertCircle,
        className: "border-warning-500/30 bg-warning-50 text-warning-700",
        iconClass: "text-warning-500",
    },
    info: {
        icon: Info,
        className: "border-brand-200 bg-brand-50 text-brand-700",
        iconClass: "text-brand-500",
    },
};

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const dismiss = useCallback((id) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);

    const push = useCallback(
        (type, message, duration = 4000) => {
            // crypto.randomUUID avoids duplicate React keys when several toasts
            // are triggered within the same millisecond.
            const id = crypto.randomUUID();

            setToasts((current) => [...current, { id, type, message }]);

            if (duration > 0) {
                setTimeout(() => dismiss(id), duration);
            }

            return id;
        },
        [dismiss]
    );

    const value = useMemo(
        () => ({
            success: (message, duration) => push("success", message, duration),
            error: (message, duration) => push("error", message, duration ?? 6000),
            warning: (message, duration) => push("warning", message, duration),
            info: (message, duration) => push("info", message, duration),
            dismiss,
        }),
        [push, dismiss]
    );

    return (
        <ToastContext.Provider value={value}>
            {children}

            {/*
              aria-live="polite" makes screen readers announce new toasts without
              interrupting whatever the user is currently doing.
            */}
            <div
                className="pointer-events-none fixed bottom-4 right-4 z-100 flex w-full max-w-sm flex-col gap-2"
                aria-live="polite"
                aria-atomic="false"
            >
                {toasts.map((toast) => {
                    const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
                    const Icon = style.icon;

                    return (
                        <div
                            key={toast.id}
                            className={cn(
                                "pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg",
                                "animate-[fade-up_0.25s_ease-out_both]",
                                style.className
                            )}
                            role="status"
                        >
                            <Icon
                                className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", style.iconClass)}
                                aria-hidden="true"
                            />

                            <p className="flex-1 text-sm font-medium">{toast.message}</p>

                            <button
                                type="button"
                                onClick={() => dismiss(toast.id)}
                                className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
                                aria-label="Dismiss notification"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
};

export default ToastProvider;
