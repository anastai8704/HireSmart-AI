import { useState, useId } from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "../../lib/utils";

/** Scores a password 0–4 without calling any API. Purely a UI aid. */
const scorePassword = (value) => {
  const v = String(value || "");
  let score = 0;
  if (v.length >= 12) score += 1;
  if (v.length >= 16) score += 1;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score += 1;
  if (/\d/.test(v)) score += 1;
  if (/[^A-Za-z0-9]/.test(v)) score += 1;
  return Math.min(score, 4);
};

const STRENGTH_LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"];

const STRENGTH_BARS = [
  "bg-danger-500",
  "bg-danger-500",
  "bg-warning-500",
  "bg-brand-500",
  "bg-success-500",
];
const STRENGTH_TEXT = [
  "text-danger-700",
  "text-danger-700",
  "text-warning-700",
  "text-brand-700",
  "text-success-700",
];

/**
 * Controlled password input with a visibility toggle and an optional
 * strength meter. Pass `value`/`onChange` as with any other input — works
 * with plain state or react-hook-form's setValue.
 */
const PasswordField = ({
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete,
  placeholder = "••••••••••••",
  showStrength = false,
  id: providedId,
  required,
  className,
  ...props
}) => {
  const generatedId = useId();
  const id = providedId || generatedId;
  const [show, setShow] = useState(false);
  const strength = showStrength ? scorePassword(value) : 0;
  const showMeter = showStrength && String(value || "").length > 0;

  return (
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
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${id}-error` : showMeter ? `${id}-strength` : hint ? `${id}-hint` : undefined
          }
          className={cn(
            "w-full rounded-lg border bg-white py-2.5 pl-3 pr-11 text-sm text-ink-900",
            "placeholder:text-ink-400 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-brand-500/20",
            error ? "border-danger-500 focus:border-danger-500" : "border-ink-200 focus:border-brand-500",
          )}
          {...props}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger-700" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
      {showMeter && (
        <div id={`${id}-strength`} className="flex items-center gap-3" role="status">
          <div className="flex flex-1 gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((step) => (
              <span
                key={step}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-300",
                  strength >= step ? STRENGTH_BARS[strength] : "bg-ink-200",
                )}
              />
            ))}
          </div>
          <span className={cn("text-xs font-semibold", STRENGTH_TEXT[strength])}>
            {STRENGTH_LABELS[strength]}
          </span>
        </div>
      )}
    </div>
  );
};

export default PasswordField;
