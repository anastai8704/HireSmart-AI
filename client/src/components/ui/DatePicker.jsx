import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SHORT_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DAYS_OF_WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Pad 2 digits */
const pad2 = (n) => String(n).padStart(2, "0");

/** Parse YYYY-MM-DD or ISO string into { year, month (1-12), day (1-31), hour (0-23), minute (0-59) } */
const parseDateString = (val) => {
  if (!val) return null;
  if (typeof val === "string") {
    // Check YYYY-MM-DD or YYYY-MM-DDTHH:mm
    const dateOnlyMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    if (dateOnlyMatch) {
      return {
        year: Number(dateOnlyMatch[1]),
        month: Number(dateOnlyMatch[2]),
        day: Number(dateOnlyMatch[3]),
        hour: dateOnlyMatch[4] ? Number(dateOnlyMatch[4]) : 0,
        minute: dateOnlyMatch[5] ? Number(dateOnlyMatch[5]) : 0,
      };
    }
  }
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
};

/** Format { year, month, day } to "YYYY-MM-DD" */
const formatToYmd = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

/** Format to "YYYY-MM-DDTHH:mm" */
const formatToYmdHm = (year, month, day, hour = 0, minute = 0) =>
  `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`;

/** Display string in Indian format: "15 Nov 2026" or "15 Nov 2026, 02:30 PM" */
const formatDisplay = (parsed, showTime) => {
  if (!parsed) return "";
  const { year, month, day, hour, minute } = parsed;
  const monthName = SHORT_MONTH_NAMES[month - 1] || "";
  const dateStr = `${pad2(day)} ${monthName} ${year}`;
  if (!showTime) return dateStr;

  const h12 = hour % 12 || 12;
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${dateStr}, ${pad2(h12)}:${pad2(minute)} ${ampm}`;
};

export const DatePicker = ({
  id: providedId,
  name,
  label,
  value,
  onChange,
  onBlur,
  placeholder = "Select date",
  showTime = false,
  min,
  max,
  disabled = false,
  required = false,
  className,
  error,
  hint,
  "aria-label": ariaLabel,
  ...rest
}) => {
  const generatedId = useId();
  const id = providedId || generatedId;
  const rootRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  const parsed = useMemo(() => parseDateString(value), [value]);

  // Today in IST
  const todayParsed = useMemo(() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
    };
  }, []);

  // Calendar view override state (when the user manually navigates months/years)
  const [navView, setNavView] = useState(null);
  const viewYear = navView?.year ?? (parsed?.year || todayParsed.year);
  const viewMonth = navView?.month ?? (parsed?.month || todayParsed.month);

  // Time state override
  const [navTime, setNavTime] = useState(null);
  const selectedHour = navTime?.hour ?? (parsed?.hour ?? 10);
  const selectedMinute = navTime?.minute ?? (parsed?.minute ?? 0);

  // Close popup on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setIsOpen(false);
        onBlur?.(e);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onBlur]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const emitChange = (newVal) => {
    if (onChange) {
      // Support both event-like and raw string consumers
      const event = {
        target: { name: name || id, value: newVal },
        currentTarget: { name: name || id, value: newVal },
      };
      onChange(event);
    }
  };

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setNavView({ year: viewYear - 1, month: 12 });
    } else {
      setNavView({ year: viewYear, month: viewMonth - 1 });
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setNavView({ year: viewYear + 1, month: 1 });
    } else {
      setNavView({ year: viewYear, month: viewMonth + 1 });
    }
  };

  const handleSelectDay = (day) => {
    const nextVal = showTime
      ? formatToYmdHm(viewYear, viewMonth, day, selectedHour, selectedMinute)
      : formatToYmd(viewYear, viewMonth, day);
    emitChange(nextVal);
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e?.stopPropagation();
    setNavView(null);
    setNavTime(null);
    emitChange("");
    setIsOpen(false);
  };

  const handleTimeChange = (newHour, newMinute) => {
    setNavTime({ hour: newHour, minute: newMinute });
    if (parsed) {
      const nextValue = formatToYmdHm(parsed.year, parsed.month, parsed.day, newHour, newMinute);
      emitChange(nextValue);
    }
  };

  // Build grid of days for the viewMonth
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const days = [];

    // Empty lead cells
    for (let i = 0; i < firstDayIndex; i += 1) {
      days.push(null);
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d += 1) {
      const ymd = formatToYmd(viewYear, viewMonth, d);
      const isSelected = parsed && parsed.year === viewYear && parsed.month === viewMonth && parsed.day === d;
      const isToday = todayParsed.year === viewYear && todayParsed.month === viewMonth && todayParsed.day === d;

      let isDisabled = false;
      if (min && ymd < min.split("T")[0]) isDisabled = true;
      if (max && ymd > max.split("T")[0]) isDisabled = true;

      days.push({ day: d, ymd, isSelected, isToday, isDisabled });
    }

    return days;
  }, [viewYear, viewMonth, parsed, todayParsed, min, max]);

  const displayText = formatDisplay(parsed, showTime);

  return (
    <div ref={rootRef} className="relative inline-block w-full text-left" onKeyDown={handleKeyDown}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink-700">
          {label}
          {required && (
            <span className="ml-0.5 text-danger-500" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      {/* Accessible input for form submission, label association & automated testing */}
      <input
        type="text"
        id={id}
        name={name}
        value={value || ""}
        required={required}
        aria-label={ariaLabel || label}
        disabled={disabled}
        readOnly={!onChange}
        onChange={onChange || (() => {})}
        className="sr-only"
        {...rest}
      />

      {/* Visible Trigger Box */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={ariaLabel || (displayText ? (label ? `${label}: ${displayText}` : displayText) : placeholder)}
        onClick={() => !disabled && setIsOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setIsOpen((v) => !v);
          }
        }}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 text-sm text-ink-900 transition-all",
          "hover:border-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
          disabled && "cursor-not-allowed bg-ink-50 text-ink-400 opacity-75 hover:border-ink-200",
          error ? "border-danger-500" : "border-ink-200",
          className
        )}
      >
        <div className="flex items-center gap-2 truncate">
          <CalendarIcon className="h-4 w-4 shrink-0 text-ink-400" />
          <span className={cn("truncate", !displayText && "text-ink-400")}>
            {displayText || placeholder}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {displayText && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear date"
              className="rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-danger-700">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-500">
          {hint}
        </p>
      )}

      {/* Popover Calendar Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Date Picker Calendar"
          className="absolute z-50 mt-1 w-72 rounded-2xl border border-ink-200 bg-white p-4 shadow-xl animate-in fade-in zoom-in-95"
        >
          {/* Header Month & Year Navigation (Requirement 12: No native select elements) */}
          <div className="flex items-center justify-between pb-3 border-b border-ink-100">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setNavView({ year: viewYear - 1, month: viewMonth })}
                aria-label="Previous year"
                className="grid h-7 w-7 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="Previous month"
                className="grid h-7 w-7 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>

            <span className="text-xs font-bold text-ink-900">
              {MONTH_NAMES[viewMonth - 1]} {viewYear}
            </span>

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="Next month"
                className="grid h-7 w-7 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setNavView({ year: viewYear + 1, month: viewMonth })}
                aria-label="Next year"
                className="grid h-7 w-7 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Days of Week Row */}
          <div className="grid grid-cols-7 pt-2 text-center text-[11px] font-semibold text-ink-400">
            {DAYS_OF_WEEK.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 pt-1">
            {calendarDays.map((item, idx) => {
              if (!item) {
                return <div key={`empty-${idx}`} className="h-8 w-8" />;
              }

              const { day, isSelected, isToday, isDisabled } = item;

              return (
                <button
                  key={item.ymd}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelectDay(day)}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-lg text-xs font-medium transition-colors",
                    isDisabled && "cursor-not-allowed text-ink-300 line-through opacity-50",
                    !isDisabled && !isSelected && "hover:bg-ink-100 text-ink-800",
                    isToday && !isSelected && "border border-brand-500 font-bold text-brand-600",
                    isSelected && "bg-brand-600 font-bold text-white shadow-sm hover:bg-brand-700"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Optional Time Picker Row */}
          {showTime && (
            <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3 text-xs">
              <span className="flex items-center gap-1 font-medium text-ink-500">
                <Clock className="h-3.5 w-3.5" /> Time:
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="23"
                  aria-label="Hour"
                  value={pad2(selectedHour)}
                  onChange={(e) => {
                    const h = Math.max(0, Math.min(23, Number(e.target.value) || 0));
                    handleTimeChange(h, selectedMinute);
                  }}
                  className="w-12 rounded border border-ink-200 bg-white px-1.5 py-1 text-center text-xs font-semibold focus:border-brand-500 focus:outline-none"
                />
                <span className="font-bold">:</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  step="5"
                  aria-label="Minute"
                  value={pad2(selectedMinute)}
                  onChange={(e) => {
                    const m = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                    handleTimeChange(selectedHour, m);
                  }}
                  className="w-12 rounded border border-ink-200 bg-white px-1.5 py-1 text-center text-xs font-semibold focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Footer Quick Actions */}
          <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-2 text-xs">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const todayYmd = showTime
                  ? formatToYmdHm(now.getFullYear(), now.getMonth() + 1, now.getDate(), selectedHour, selectedMinute)
                  : formatToYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
                emitChange(todayYmd);
                setIsOpen(false);
              }}
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="font-medium text-ink-500 hover:text-ink-700"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePicker;
