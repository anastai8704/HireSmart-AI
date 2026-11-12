// Form controls with labels, help and error text. Each field wires up a real
// <label htmlFor>, aria-invalid, aria-describedby and a visible focus ring.

import { useId } from "react";

import { cn } from "../../lib/utils";
import { SearchableSelect } from "./SearchableSelect";

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
            className,
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
          className,
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        required={required}
        {...props}
      />
    </Field>
  );
};

// Select is the shared accessible combobox (Requirement 12). It keeps the native select call shape
// (`options`, `placeholder`, `<option>` children, `(e) => set(e.target.value)`), so existing callers are unchanged.
export const Select = (props) => <SearchableSelect {...props} />;

export default Input;
