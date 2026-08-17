/**
 * ScoreRing.jsx
 * -----------------------------------------------------------------------------
 * The circular 0-100 score dial used for match scores and ATS grades.
 *
 * HOW THE SVG RING WORKS (the one clever bit in this file)
 * A circle's outline has a known length: circumference = 2 * PI * radius.
 * `strokeDasharray` sets that full length as the dash pattern, and
 * `strokeDashoffset` hides part of it. Offsetting by 25% of the circumference
 * therefore leaves exactly 75% of the ring drawn - a progress dial with no
 * images and no charting library.
 *
 * The ring is decorative, so it is aria-hidden and the real value is exposed
 * to assistive technology via role="img" and an aria-label.
 */

import { cn } from "../../lib/utils";
import { scoreTone } from "../../lib/utils";

const TONE_STROKE = {
    success: "stroke-success-500",
    brand: "stroke-brand-500",
    warning: "stroke-warning-500",
    danger: "stroke-danger-500",
};

const TONE_TEXT = {
    success: "text-success-700",
    brand: "text-brand-700",
    warning: "text-warning-700",
    danger: "text-danger-700",
};

const ScoreRing = ({
    score = 0,
    size = 120,
    strokeWidth = 10,
    label,
    sublabel,
    className,
}) => {
    const safeScore = Math.max(0, Math.min(100, Math.round(score)));
    const tone = scoreTone(safeScore);

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (safeScore / 100) * circumference;

    return (
        <div
            className={cn("inline-flex flex-col items-center gap-1.5", className)}
            role="img"
            aria-label={`${label || "Score"}: ${safeScore} out of 100`}
        >
            <div className="relative" style={{ width: size, height: size }}>
                <svg
                    width={size}
                    height={size}
                    // Rotated so the ring starts filling from 12 o'clock.
                    className="-rotate-90"
                    aria-hidden="true"
                >
                    {/* Track */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        strokeWidth={strokeWidth}
                        className="stroke-ink-200"
                    />

                    {/* Progress */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        className={cn(
                            TONE_STROKE[tone],
                            "transition-[stroke-dashoffset] duration-700 ease-out"
                        )}
                    />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span
                        className={cn(
                            "font-bold leading-none",
                            TONE_TEXT[tone],
                            size >= 110 ? "text-3xl" : size >= 80 ? "text-2xl" : "text-lg"
                        )}
                    >
                        {safeScore}
                    </span>

                    {size >= 80 && (
                        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-400">
                            / 100
                        </span>
                    )}
                </div>
            </div>

            {label && (
                <div className="text-center">
                    <p className="text-sm font-semibold text-ink-800">{label}</p>
                    {sublabel && <p className="text-xs text-ink-500">{sublabel}</p>}
                </div>
            )}
        </div>
    );
};

/**
 * The horizontal equivalent, used for the per-component score breakdown
 * (skills / semantic / experience / education).
 */
export const ScoreBar = ({ label, score = 0, weight, className }) => {
    const safeScore = Math.max(0, Math.min(100, Math.round(score)));
    const tone = scoreTone(safeScore);

    const fill = {
        success: "bg-success-500",
        brand: "bg-brand-500",
        warning: "bg-warning-500",
        danger: "bg-danger-500",
    }[tone];

    return (
        <div className={cn("flex flex-col gap-1.5", className)}>
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink-700">
                    {label}
                    {weight !== undefined && (
                        <span className="ml-1.5 text-xs font-normal text-ink-400">
                            {Math.round(weight * 100)}% of total
                        </span>
                    )}
                </span>

                <span className="text-sm font-semibold tabular-nums text-ink-900">
                    {safeScore}
                </span>
            </div>

            <div
                className="h-2 w-full overflow-hidden rounded-full bg-ink-200"
                role="progressbar"
                aria-valuenow={safeScore}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={label}
            >
                <div
                    className={cn("h-full rounded-full transition-all duration-700 ease-out", fill)}
                    style={{ width: `${safeScore}%` }}
                />
            </div>
        </div>
    );
};

export default ScoreRing;
