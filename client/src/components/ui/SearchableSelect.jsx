// Accessible, searchable dropdown (Requirement 12).
//
// Implements the WAI-ARIA combobox pattern with a listbox popup:
//   - Keyboard: ArrowDown/ArrowUp move, Home/End jump (when not typing), Enter or Space select,
//     Escape closes (and stops the event so an enclosing dialog stays open), Tab closes,
//     Backspace removes the last chip in multi-select.
//   - Searchable: typing filters by label and description. Search is on automatically for long lists.
//   - Single and multi-select, clear-selection button, loading, empty and disabled states.
//   - Mobile: 44px option rows, 16px input text (no iOS zoom), a popup capped at 60vh.
//
// The API matches the native <Select> it replaces: `options` (strings or {value,label}), `placeholder`,
// `<option>` children, and an event-style onChange, so callers keep `(e) => set(e.target.value)`.
// Validation stays with the caller: `error` shows a message and aria-invalid; `required` also sets a
// native validity message only while nothing is selected.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, X } from "lucide-react";

import { cn } from "../../lib/utils";
import { normaliseOptions } from "../../lib/selectOptions";

const toArray = (value) => (Array.isArray(value) ? value.map((v) => String(v)) : value ? [String(value)] : []);

export const SearchableSelect = ({
  id: providedId,
  name,
  label,
  value,
  onChange,
  onBlur,
  options = [],
  children,
  placeholder,
  searchable = true,
  searchPlaceholder = "Type to search",
  multiple = false,
  clearable = false,
  loading = false,
  loadingText = "Loading options…",
  emptyText = "No matches found",
  disabled = false,
  required = false,
  error,
  hint,
  className,
  containerClassName,
  "aria-label": ariaLabel,
  ...rest
}) => {
  const generatedId = useId();
  const id = providedId || generatedId;
  const listId = `${id}-listbox`;
  const errorId = error ? `${id}-error` : undefined;
  const hintId = !error && hint ? `${id}-hint` : undefined;

  // A placeholder given explicitly is also a selectable "" option, as with the native select it replaces,
  // so filters such as "All statuses" can always be reset.
  const all = useMemo(() => {
    const list = normaliseOptions(options, children);
    if (placeholder && !multiple && !list.some((o) => o.value === "")) {
      return [{ value: "", label: placeholder }, ...list];
    }
    return list;
  }, [options, children, placeholder, multiple]);
  // Search is on by default. searchable={false} keeps a short fixed list read-only (arrow keys only).
  const isSearchable = searchable;
  const selected = toArray(value);
  const hasValue = selected.length > 0;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const filterBy = (text) => {
    const q = text.trim().toLowerCase();
    if (!q) return all;
    return all.filter((o) => `${o.label} ${o.description}`.toLowerCase().includes(q));
  };
  const filtered = useMemo(() => filterBy(query), [all, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedOptions = selected.map((v) => all.find((o) => o.value === v) || { value: v, label: v });
  const singleLabel = !multiple && hasValue ? selectedOptions[0].label : "";

  const nextEnabled = (from, step) => {
    if (!filtered.length) return -1;
    let i = from;
    for (let n = 0; n < filtered.length; n += 1) {
      i = (i + step + filtered.length) % filtered.length;
      if (!filtered[i].disabled) return i;
    }
    return -1;
  };
  const firstEnabled = () => filtered.findIndex((o) => !o.disabled);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    const current = filtered.findIndex((o) => selected.includes(o.value) && !o.disabled);
    setActive(current >= 0 ? current : firstEnabled());
  };

  const closeList = () => {
    setOpen(false);
    setQuery("");
    setActive(-1);
  };

  const emit = (next) => {
    onChange?.({ target: { name, value: next } });
  };

  const choose = (option) => {
    if (!option || option.disabled) return;
    if (multiple) {
      const next = selected.includes(option.value)
        ? selected.filter((v) => v !== option.value)
        : [...selected, option.value];
      emit(next);
      return;
    }
    emit(option.value);
    closeList();
    inputRef.current?.focus();
  };

  const clear = (event) => {
    event?.stopPropagation();
    emit(multiple ? [] : "");
    setQuery("");
    inputRef.current?.focus();
  };

  const removeChip = (v) => emit(selected.filter((x) => x !== v));

  // Close when the pointer goes outside the control.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) closeList();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
    // closeList is stable enough for this listener; it only reads setters.
  }, [open]);

  // Keep the active option visible while moving with the keyboard.
  useEffect(() => {
    if (!open || active < 0) return;
    const node = document.getElementById(`${id}-opt-${active}`);
    node?.scrollIntoView?.({ block: "nearest" });
  }, [active, open, id]);

  // Native validity only reflects "nothing chosen" for required fields, so the browser and the form agree.
  useEffect(() => {
    const input = inputRef.current;
    if (!input || !input.setCustomValidity) return;
    input.setCustomValidity(required && !hasValue ? "Please select an option." : "");
  }, [required, hasValue]);

  const onKeyDown = (e) => {
    if (disabled) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => nextEnabled(a, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => nextEnabled(a < 0 ? 0 : a, -1));
        break;
      case "Home":
        if (open && !isSearchable) {
          e.preventDefault();
          setActive(firstEnabled());
        }
        break;
      case "End":
        if (open && !isSearchable) {
          e.preventDefault();
          const last = [...filtered].reverse().findIndex((o) => !o.disabled);
          setActive(last >= 0 ? filtered.length - 1 - last : -1);
        }
        break;
      case "Enter":
        if (open) {
          e.preventDefault();
          choose(filtered[active]);
        } else {
          e.preventDefault();
          openList();
        }
        break;
      case " ":
        if (!isSearchable) {
          e.preventDefault();
          if (open) choose(filtered[active]);
          else openList();
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          closeList();
        }
        break;
      case "Tab":
        if (open) closeList();
        break;
      case "Backspace":
        if (multiple && !query && selected.length) {
          e.preventDefault();
          removeChip(selected[selected.length - 1]);
        }
        break;
      default:
        break;
    }
  };

  const onInput = (e) => {
    const next = e.target.value;
    const list = filterBy(next);
    setQuery(next);
    if (!open) setOpen(true);
    // Highlight the first match straight away, computed from the new list.
    setActive(list.findIndex((o) => !o.disabled));
  };

  const showPopup = open;
  const optionCount = filtered.length;
  const activeId = showPopup && active >= 0 ? `${id}-opt-${active}` : undefined;

  const control = (
    <div
      ref={rootRef}
      className={cn(
        "relative w-full rounded-lg border bg-white text-sm text-ink-900 transition-colors",
        "focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20",
        disabled && "cursor-not-allowed bg-ink-100 text-ink-500",
        error ? "border-danger-500" : "border-ink-200",
        className,
      )}
      onMouseDown={(e) => {
        // Clicking the field (not an input or button) opens it and keeps focus in the input.
        if (disabled) return;
        if (e.target.closest("button")) return;
        if (e.target !== inputRef.current) e.preventDefault();
        inputRef.current?.focus();
        if (!open) openList();
      }}
    >
      <div className="flex min-h-10 flex-wrap items-center gap-1 px-2 py-1">
        {multiple &&
          selectedOptions.map((o) => (
            <span
              key={o.value}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
            >
              <span className="truncate">{o.label}</span>
              {!disabled && (
                <button
                  type="button"
                  className="grid h-5 w-5 place-items-center rounded hover:bg-brand-100"
                  aria-label={`Remove ${o.label}`}
                  onClick={() => removeChip(o.value)}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </span>
          ))}

        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete={isSearchable ? "list" : "none"}
          aria-expanded={showPopup}
          aria-controls={showPopup ? listId : undefined}
          aria-activedescendant={activeId}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          aria-invalid={Boolean(error)}
          aria-required={required || undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
          aria-busy={loading || undefined}
          disabled={disabled}
          readOnly={!isSearchable}
          placeholder={hasValue ? "" : open && isSearchable ? searchPlaceholder : placeholder || "Select an option"}
          value={isSearchable ? (open ? query : singleLabel) : singleLabel}
          onChange={onInput}
          onBlur={(e) => {
            if (!rootRef.current?.contains(e.relatedTarget)) onBlur?.(e);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "h-10 min-w-[6rem] flex-1 bg-transparent px-1 text-base text-ink-900 placeholder:text-ink-400 focus:outline-none sm:text-sm",
            "disabled:cursor-not-allowed disabled:text-ink-500",
            !isSearchable && "cursor-pointer",
          )}
          {...rest}
        />

        {clearable && hasValue && !disabled && (
          <button
            type="button"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            aria-label="Clear selection"
            onClick={clear}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="grid h-8 w-8 shrink-0 place-items-center text-ink-500"
          onClick={() => {
            if (disabled) return;
            if (open) closeList();
            else {
              inputRef.current?.focus();
              openList();
            }
          }}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {showPopup && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lg">
          {loading ? (
            <div role="status" className="flex items-center gap-2 px-3 py-3 text-sm text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {loadingText}
            </div>
          ) : optionCount === 0 ? (
            <div role="status" className="px-3 py-3 text-sm text-ink-500">
              {emptyText}
            </div>
          ) : (
            <ul
              id={listId}
              role="listbox"
              aria-multiselectable={multiple || undefined}
              aria-label={ariaLabel || label}
              className="max-h-[min(18rem,60vh)] overflow-y-auto py-1"
            >
              {filtered.map((option, index) => {
                const isSelected = selected.includes(option.value);
                const isActive = index === active;
                return (
                  <li
                    key={option.value}
                    id={`${id}-opt-${index}`}
                    data-value={option.value}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    onMouseEnter={() => !option.disabled && setActive(index)}
                    onMouseDown={(e) => {
                      // Keep focus in the input so the list does not close before the click.
                      e.preventDefault();
                      choose(option);
                    }}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm sm:min-h-9",
                      isActive && "bg-brand-50 text-brand-800",
                      !isActive && "text-ink-800",
                      option.disabled && "cursor-not-allowed text-ink-400",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{option.label}</span>
                      {option.description && (
                        <span className="block truncate text-xs text-ink-500">{option.description}</span>
                      )}
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );

  const hiddenInputs = name
    ? (multiple ? selected : [value ?? ""]).map((v, i) => (
        <input key={`${name}-${i}`} type="hidden" name={multiple ? `${name}` : name} value={v} />
      ))
    : null;

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
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
      {control}
      {hiddenInputs}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger-700" role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-xs text-ink-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
};

export default SearchableSelect;
