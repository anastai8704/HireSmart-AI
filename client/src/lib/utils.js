/**
 * utils.js
 * -----------------------------------------------------------------------------
 * Small, dependency-light helpers used across the UI. Each is pure and easy to
 * test, which keeps formatting logic out of the components.
 */

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind class names intelligently.
 *
 * Plain string concatenation breaks with Tailwind: `"p-2 p-4"` leaves both
 * classes in the DOM and the winner depends on CSS order. twMerge keeps only
 * the last conflicting utility, so component defaults can be overridden by
 * whatever the caller passes in.
 */
export const cn = (...inputs) => twMerge(clsx(inputs));

/** "₹12,00,000" - Indian number formatting, matching the target job market. */
export const formatSalary = (amount) => {
    if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
        return "Not disclosed";
    }

    const value = Number(amount);

    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(value);
};

/** "15 Aug 2026" */
export const formatDate = (value) => {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(date);
};

/** "3 days ago" - friendlier than a raw date in activity feeds. */
export const formatRelativeTime = (value) => {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    const seconds = Math.round((Date.now() - date.getTime()) / 1000);

    const units = [
        { limit: 60, divisor: 1, name: "second" },
        { limit: 3600, divisor: 60, name: "minute" },
        { limit: 86400, divisor: 3600, name: "hour" },
        { limit: 604800, divisor: 86400, name: "day" },
        { limit: 2592000, divisor: 604800, name: "week" },
        { limit: 31536000, divisor: 2592000, name: "month" },
    ];

    if (seconds < 45) return "just now";

    for (const unit of units) {
        if (seconds < unit.limit) {
            const amount = Math.round(seconds / unit.divisor);
            return `${amount} ${unit.name}${amount === 1 ? "" : "s"} ago`;
        }
    }

    const years = Math.round(seconds / 31536000);
    return `${years} year${years === 1 ? "" : "s"} ago`;
};

/** Colour family for a 0-100 match or ATS score. */
export const scoreTone = (score) => {
    if (score >= 80) return "success";
    if (score >= 60) return "brand";
    if (score >= 40) return "warning";
    return "danger";
};

/** Tailwind classes for a score badge, derived from the tone above. */
export const scoreClasses = (score) => {
    const tone = scoreTone(score);

    return {
        success: "bg-success-50 text-success-700 border-success-500/30",
        brand: "bg-brand-50 text-brand-700 border-brand-500/30",
        warning: "bg-warning-50 text-warning-700 border-warning-500/30",
        danger: "bg-danger-50 text-danger-700 border-danger-500/30",
    }[tone];
};

/** Colour per application status, kept in one place for consistency. */
export const statusClasses = (status) =>
    ({
        Applied: "bg-ink-100 text-ink-700 border-ink-300",
        Shortlisted: "bg-brand-50 text-brand-700 border-brand-300",
        Interview: "bg-warning-50 text-warning-700 border-warning-500/40",
        Selected: "bg-success-50 text-success-700 border-success-500/40",
        Rejected: "bg-danger-50 text-danger-700 border-danger-500/40",
        Withdrawn: "bg-ink-100 text-ink-500 border-ink-300",
    }[status] || "bg-ink-100 text-ink-700 border-ink-300");

/** "Anas Tai" -> "AT", used for avatar fallbacks. */
export const initials = (name = "") =>
    name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "?";

/** Shortens long text for cards and list rows. */
export const truncate = (text, max = 140) => {
    if (!text) return "";
    return text.length <= max ? text : `${text.slice(0, max).trimEnd()}...`;
};

/** "1.2 MB" */
export const formatBytes = (bytes) => {
    if (!bytes) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1
    );

    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

/**
 * Triggers a browser download for a Blob returned by the API.
 * We create a temporary object URL, click it, then release the memory.
 */
export const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
};

/** Delays a function until the user stops typing - used for search inputs. */
export const debounce = (fn, delay = 350) => {
    let timer;

    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
};
