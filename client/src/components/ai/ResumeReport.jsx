/**
 * ResumeReport.jsx
 * -----------------------------------------------------------------------------
 * Renders the full ATS analysis of a resume: the grade, what was extracted,
 * every check that ran, and the prioritised list of things to fix.
 *
 * Shared by the public "Free resume check" page and the signed-in candidate
 * resume hub, so improving it improves both.
 */

import {
    AlertTriangle,
    AtSign,
    CheckCircle2,
    Circle,
    Code2,
    Globe,
    Info,
    Link2,
    Phone,
    XCircle,
} from "lucide-react";

import Badge from "../ui/Badge";
import ScoreRing, { ScoreBar } from "../ui/ScoreRing";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { cn } from "../../lib/utils";

/** Visual treatment per suggestion severity. */
const SEVERITY = {
    critical: {
        icon: XCircle,
        label: "Critical",
        className: "border-danger-500/30 bg-danger-50",
        iconClass: "text-danger-500",
        badge: "danger",
    },
    high: {
        icon: AlertTriangle,
        label: "High impact",
        className: "border-warning-500/30 bg-warning-50",
        iconClass: "text-warning-500",
        badge: "warning",
    },
    medium: {
        icon: Info,
        label: "Nice to fix",
        className: "border-brand-200 bg-brand-50",
        iconClass: "text-brand-500",
        badge: "brand",
    },
    low: {
        icon: Info,
        label: "Minor",
        className: "border-ink-200 bg-ink-50",
        iconClass: "text-ink-400",
        badge: "default",
    },
};

const CONTACT_FIELDS = [
    { key: "email", label: "Email", icon: AtSign },
    { key: "phone", label: "Phone", icon: Phone },
    { key: "linkedin", label: "LinkedIn", icon: Link2 },
    { key: "github", label: "GitHub", icon: Code2 },
    { key: "portfolio", label: "Portfolio", icon: Globe },
];

const CATEGORY_LABELS = {
    languages: "Languages",
    frontend: "Frontend",
    backend: "Backend",
    database: "Databases",
    devops: "DevOps & Cloud",
    datascience: "Data & AI",
    testing: "Testing",
    mobile: "Mobile",
};

const ResumeReport = ({ report }) => {
    if (!report) return null;

    const {
        atsScore,
        grade,
        summary,
        wordCount,
        contact = {},
        sections = { present: [], missing: [] },
        skills = { all: [], byCategory: {} },
        checks = [],
        suggestions = [],
        achievements,
        experienceYears,
        keywordGaps,
        tailoringTips = [],
    } = report;

    // A job-targeted report adds tailoring tips; merge them into the main list.
    const allSuggestions = [...tailoringTips, ...suggestions];

    return (
        <div className="space-y-5">
            {/* ---------- Headline ---------- */}
            <Card>
                <CardContent className="flex flex-col items-center gap-6 p-6 sm:flex-row">
                    <ScoreRing score={atsScore} size={130} />

                    <div className="flex-1 space-y-3 text-center sm:text-left">
                        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                            <h2 className="text-xl font-bold text-ink-900">
                                ATS Score: {atsScore}/100
                            </h2>
                            <Badge
                                variant={
                                    atsScore >= 80 ? "success" : atsScore >= 60 ? "warning" : "danger"
                                }
                            >
                                Grade {grade}
                            </Badge>
                        </div>

                        <p className="text-sm text-ink-600">{summary}</p>

                        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-ink-500 sm:justify-start">
                            <span>{wordCount} words</span>
                            <span>{skills.all.length} skills detected</span>
                            {achievements && <span>{achievements.count} quantified results</span>}
                            {experienceYears !== null && experienceYears !== undefined && (
                                <span>{experienceYears} years experience</span>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
                {/* ---------- Individual checks ---------- */}
                <Card>
                    <CardHeader>
                        <CardTitle>Score breakdown</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3.5">
                        {checks.map((check) => (
                            <ScoreBar
                                key={check.key}
                                label={check.label}
                                score={check.score}
                                weight={check.weight}
                            />
                        ))}
                    </CardContent>
                </Card>

                {/* ---------- What we could extract ---------- */}
                <Card>
                    <CardHeader>
                        <CardTitle>What an ATS can read</CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                                Contact details
                            </p>

                            <ul className="space-y-1.5">
                                {CONTACT_FIELDS.map((field) => {
                                    const value = contact[field.key];
                                    const Icon = field.icon;

                                    return (
                                        <li
                                            key={field.key}
                                            className="flex items-center gap-2 text-sm"
                                        >
                                            <Icon
                                                className="h-3.5 w-3.5 shrink-0 text-ink-400"
                                                aria-hidden="true"
                                            />
                                            <span className="text-ink-600">{field.label}:</span>

                                            {value ? (
                                                <span className="truncate font-medium text-success-700">
                                                    {value}
                                                </span>
                                            ) : (
                                                <span className="text-danger-700">Not found</span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>

                        <div className="border-t border-ink-100 pt-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                                Sections
                            </p>

                            <div className="flex flex-wrap gap-1.5">
                                {sections.present.map((section) => (
                                    <Badge
                                        key={section}
                                        variant="success"
                                        size="sm"
                                        icon={<CheckCircle2 className="h-3 w-3" />}
                                    >
                                        {section}
                                    </Badge>
                                ))}

                                {sections.missing.map((section) => (
                                    <Badge
                                        key={section}
                                        variant="danger"
                                        size="sm"
                                        icon={<Circle className="h-3 w-3" />}
                                    >
                                        {section}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ---------- Skills by category ---------- */}
            {Object.keys(skills.byCategory).length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Skills detected ({skills.all.length})</CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-3">
                        {Object.entries(skills.byCategory).map(([category, list]) => (
                            <div key={category}>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                                    {CATEGORY_LABELS[category] || category}
                                </p>

                                <div className="flex flex-wrap gap-1.5">
                                    {list.map((skill) => (
                                        <Badge key={skill} variant="brand" size="sm">
                                            {skill}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* ---------- Keyword gaps for a targeted job ---------- */}
            {keywordGaps?.length > 0 && (
                <Card className="border-warning-500/30">
                    <CardHeader>
                        <CardTitle>Keywords this job wants that your resume is missing</CardTitle>
                    </CardHeader>

                    <CardContent>
                        <div className="flex flex-wrap gap-1.5">
                            {keywordGaps.map((keyword) => (
                                <Badge key={keyword} variant="warning" size="sm">
                                    {keyword}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ---------- Prioritised advice ---------- */}
            {allSuggestions.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            How to improve ({allSuggestions.length}
                            {allSuggestions.length === 1 ? " item" : " items"})
                        </CardTitle>
                        <p className="text-sm text-ink-500">
                            Ordered by impact - fixing the top items moves your score the most.
                        </p>
                    </CardHeader>

                    <CardContent className="space-y-2.5">
                        {allSuggestions.map((suggestion, index) => {
                            const config = SEVERITY[suggestion.severity] || SEVERITY.medium;
                            const Icon = config.icon;

                            return (
                                <div
                                    key={`${suggestion.title}-${index}`}
                                    className={cn(
                                        "flex items-start gap-3 rounded-lg border p-3.5",
                                        config.className
                                    )}
                                >
                                    <Icon
                                        className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", config.iconClass)}
                                        aria-hidden="true"
                                    />

                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-semibold text-ink-900">
                                                {suggestion.title}
                                            </p>
                                            <Badge variant={config.badge} size="sm">
                                                {config.label}
                                            </Badge>
                                        </div>

                                        <p className="mt-1 text-sm leading-relaxed text-ink-600">
                                            {suggestion.detail}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default ResumeReport;
