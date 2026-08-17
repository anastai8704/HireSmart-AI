/**
 * Input.jsx
 * -----------------------------------------------------------------------------
 * Form controls with labels, help text, error messages and icons built in.
 *
 * ACCESSIBILITY IS THE REAL REASON THIS COMPONENT EXISTS.
 * Every field here wires up:
 *   - a real <label htmlFor> so clicking the label focuses the input,
 *   - aria-invalid so screen readers announce the error state,
 *   - aria-describedby pointing at the error/help text,
 *   - a visible focus ring.
 * Getting that right once, centrally, is far more reliable than remembering it
 * on all 40+ fields in the app.
 */

import { useId } from "react";

import { cn } from "../../lib/utils";

/** Shared shell: label on top, control in the middle, message underneath. */
const Field = ({ id, label, error, hint, required, children, className }) => (
    <div className={cn("flex flex-col gap-1.5", className)}>
        {label && (
            <label htmlFor={id} className="text-sm font-medium text-ink-700">
                {label}
                {required && (
                    <span className="ml-0.5 text-danger-500" aria-hidden="true">
                        *
                    </span>
                )}
            </label>
        )}

        {children}

        {error ? (
            <p id={`${id}-error`} className="text-xs font-medium text-danger-700" role="alert">
                {error}
            </p>
        ) : (
            hint && (
                <p id={`${id}-hint`} className="text-xs text-ink-500">
                    {hint}
                </p>
            )
        )}
    </div>
);

const baseControl =
    "w-full rounded-lg border bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 transition-colors " +
    "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 " +
    "disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-500";

export const Input = ({
    label,
    error,
    hint,
    icon,
    className,
    containerClassName,
    id: providedId,
    required,
    ...props
}) => {
    // useId generates a stable unique id so the label/error wiring works even
    // when the same field renders many times on one page.
    const generatedId = useId();
    const id = providedId || generatedId;

    return (
        <Field
            id={id}
            label={label}
            error={error}
            hint={hint}
            required={required}
            className={containerClassName}
        >
            <div className="relative">
                {icon && (
                    <span
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
                        aria-hidden="true"
                    >
                        {icon}
                    </span>
                )}

                <input
                    id={id}
                    className={cn(
                        baseControl,
                        "h-10",
                        icon && "pl-9",
                        error ? "border-danger-500" : "border-ink-200",
                        className
                    )}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
                    required={required}
                    {...props}
                />
            </div>
        </Field>
    );
};

export const Textarea = ({
    label,
    error,
    hint,
    className,
    containerClassName,
    id: providedId,
    rows = 4,
    required,
    ...props
}) => {
    const generatedId = useId();
    const id = providedId || generatedId;

    return (
        <Field
            id={id}
            label={label}
            error={error}
            hint={hint}
            required={required}
            className={containerClassName}
        >
            <textarea
                id={id}
                rows={rows}
                className={cn(
                    baseControl,
                    "resize-y py-2.5 leading-relaxed",
                    error ? "border-danger-500" : "border-ink-200",
                    className
                )}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
                required={required}
                {...props}
            />
        </Field>
    );
};

export const Select = ({
    label,
    error,
    hint,
    options = [],
    placeholder,
    className,
    containerClassName,
    id: providedId,
    required,
    children,
    ...props
}) => {
    const generatedId = useId();
    const id = providedId || generatedId;

    return (
        <Field
            id={id}
            label={label}
            error={error}
            hint={hint}
            required={required}
            className={containerClassName}
        >
            <select
                id={id}
                className={cn(
                    baseControl,
                    "h-10 cursor-pointer appearance-none bg-[length:16px] bg-[right:0.75rem_center] bg-no-repeat pr-9",
                    error ? "border-danger-500" : "border-ink-200",
                    className
                )}
                style={{
                    backgroundImage:
                        "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e\")",
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
                required={required}
                {...props}
            >
                {placeholder && <option value="">{placeholder}</option>}

                {options.map((option) => {
                    const value = typeof option === "string" ? option : option.value;
                    const optionLabel = typeof option === "string" ? option : option.label;

                    return (
                        <option key={value} value={value}>
                            {optionLabel}
                        </option>
                    );
                })}

                {children}
            </select>
        </Field>
    );
};

export default Input;
