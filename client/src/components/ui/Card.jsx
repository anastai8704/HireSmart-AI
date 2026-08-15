/**
 * Card.jsx
 * -----------------------------------------------------------------------------
 * The surface every piece of content sits on.
 *
 * Exported as a small family (Card / CardHeader / CardTitle / CardContent /
 * CardFooter) rather than one component with many props. Composition keeps the
 * markup readable and lets each screen use only the parts it needs.
 */

import { cn } from "../../lib/utils";

export const Card = ({ className, hoverable = false, children, ...props }) => (
    <div
        className={cn(
            "rounded-[var(--radius-card)] border border-ink-200 bg-white shadow-sm",
            hoverable &&
                "transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md",
            className
        )}
        {...props}
    >
        {children}
    </div>
);

export const CardHeader = ({ className, children, ...props }) => (
    <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props}>
        {children}
    </div>
);

export const CardTitle = ({ className, as: Component = "h3", children, ...props }) => (
    <Component
        className={cn("text-base font-semibold text-ink-900", className)}
        {...props}
    >
        {children}
    </Component>
);

export const CardDescription = ({ className, children, ...props }) => (
    <p className={cn("text-sm text-ink-500", className)} {...props}>
        {children}
    </p>
);

export const CardContent = ({ className, children, ...props }) => (
    <div className={cn("p-5 pt-0", className)} {...props}>
        {children}
    </div>
);

export const CardFooter = ({ className, children, ...props }) => (
    <div
        className={cn(
            "flex items-center gap-3 border-t border-ink-100 p-5 pt-4",
            className
        )}
        {...props}
    >
        {children}
    </div>
);

export default Card;
