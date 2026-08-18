/**
 * Button.jsx
 * -----------------------------------------------------------------------------
 * The single button used everywhere in the app.
 *
 * WHY NOT JUST USE <button className="...">?
 * Because then every developer invents their own shade of indigo, their own
 * padding, and their own disabled state. One component means the product looks
 * deliberate, and a design change happens in one file.
 *
 * It also handles two things raw buttons get wrong:
 *   - a built-in loading state that disables the button (stops double-submits),
 *   - `asChild`-style rendering via the `as` prop, so a link can look identical
 *     to a button without duplicating styles.
 */

import { Loader2 } from "lucide-react";

import { cn } from "../../lib/utils";

const VARIANTS = {
    primary:
        "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300",
    secondary:
        "bg-white text-ink-800 border border-ink-200 shadow-sm hover:bg-ink-50 active:bg-ink-100",
    ghost: "bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900",
    danger:
        "bg-danger-500 text-white shadow-sm hover:bg-danger-700 active:bg-danger-700 disabled:bg-danger-500/50",
    success:
        "bg-success-500 text-white shadow-sm hover:bg-success-700 active:bg-success-700",
    outline:
        "bg-transparent text-brand-700 border border-brand-300 hover:bg-brand-50 active:bg-brand-100",
};

const SIZES = {
    sm: "h-8 px-3 text-xs gap-1.5",
    md: "h-10 px-4 text-sm gap-2",
    lg: "h-12 px-6 text-base gap-2.5",
    icon: "h-10 w-10 justify-center",
};

const Button = ({
    as: Component = "button",
    variant = "primary",
    size = "md",
    isLoading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className,
    children,
    disabled,
    ...props
}) => {
    // A loading button must not be clickable again, or the user submits twice.
    const isDisabled = disabled || isLoading;

    return (
        <Component
            className={cn(
                "inline-flex items-center rounded-lg font-medium transition-all duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                "disabled:cursor-not-allowed disabled:opacity-60",
                VARIANTS[variant],
                SIZES[size],
                fullWidth && "w-full justify-center",
                className
            )}
            type={Component === "button" ? (props.type || "button") : undefined}
            disabled={Component === "button" ? isDisabled : undefined}
            aria-busy={isLoading || undefined}
            aria-disabled={isDisabled || undefined}
            {...props}
        >
            {isLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
                leftIcon
            )}

            {children}

            {!isLoading && rightIcon}
        </Component>
    );
};

export default Button;
