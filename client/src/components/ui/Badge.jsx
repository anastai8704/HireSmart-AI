/**
 * Badge.jsx
 * -----------------------------------------------------------------------------
 * Small status pills: application statuses, job types, skill tags, AI verdicts.
 */

import { cn } from "../../lib/utils";

const VARIANTS = {
    default: "bg-ink-100 text-ink-700 border-ink-200",
    brand: "bg-brand-50 text-brand-700 border-brand-200",
    success: "bg-success-50 text-success-700 border-success-500/30",
    warning: "bg-warning-50 text-warning-700 border-warning-500/30",
    danger: "bg-danger-50 text-danger-700 border-danger-500/30",
    outline: "bg-transparent text-ink-600 border-ink-300",
};

const SIZES = {
    sm: "px-2 py-0.5 text-[11px]",
    md: "px-2.5 py-1 text-xs",
};

const Badge = ({
    variant = "default",
    size = "md",
    className,
    icon,
    children,
    ...props
}) => (
    <span
        className={cn(
            "inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap",
            VARIANTS[variant],
            SIZES[size],
            className
        )}
        {...props}
    >
        {icon}
        {children}
    </span>
);

export default Badge;
