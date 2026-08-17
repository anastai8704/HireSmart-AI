/**
 * MatchBreakdown.jsx
 * -----------------------------------------------------------------------------
 * Renders the AI match result in a way a human can argue with.
 *
 * THIS COMPONENT IS THE PRODUCT'S CREDIBILITY.
 * A bare "72% match" invites the question "says who?". By showing the four
 * weighted components, the matched and missing skills, and the engine's own
 * plain-English reasons, the score becomes a recommendation the user can
 * verify - which is exactly what real hiring tools must do to be trusted (and
 * increasingly, to be legally defensible).
 */

import { CheckCircle2, XCircle } from "lucide-react";

import Badge from "../ui/Badge";
import ScoreRing, { ScoreBar } from "../ui/ScoreRing";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";

const COMPONENT_LABELS = {
    skills: "Skill match",
    semantic: "Content relevance",
    experience: "Experience level",
    education: "Education signals",
};

const COMPONENT_HELP = {
    skills: "How many of the skills this job requires we can evidence in the resume.",
    semantic:
        "How closely the whole resume reads like this job description, using TF-IDF and cosine similarity.",
    experience: "Years of experience found in the resume against the years the job asks for.",
    education: "Degrees and certifications detected in the resume.",
};

const MatchBreakdown = ({ match, title = "AI match analysis", compact = false }) => {
    if (!match) return null;

    const { matchScore, verdict, breakdown, matchedSkills = [], missingSkills = [], explanation = [] } =
        match;

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
                {/* Headline score */}
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                    <ScoreRing score={matchScore} size={compact ? 96 : 120} />

                    <div className="flex-1 space-y-2 text-center sm:text-left">
                        <p className="text-lg font-semibold text-ink-900">{verdict}</p>

                        {/* The engine's own reasoning, in plain English. */}
                        {explanation.length > 0 && (
                            <ul className="space-y-1 text-sm text-ink-600">
                                {explanation.map((reason, index) => (
                                    <li key={index} className="flex items-start gap-1.5">
                                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-400" />
                                        {reason}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Per-component breakdown */}
                {breakdown && (
                    <div className="space-y-3 border-t border-ink-100 pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                            How this score was calculated
                        </p>

                        {Object.entries(breakdown).map(([key, value]) => (
                            <div key={key}>
                                <ScoreBar
                                    label={COMPONENT_LABELS[key] || key}
                                    score={value.applicable ? value.score : 0}
                                    weight={value.weight}
                                />

                                {!value.applicable && (
                                    <p className="mt-1 text-xs italic text-ink-400">
                                        Not enough data - excluded from the final score.
                                    </p>
                                )}

                                {!compact && value.applicable && (
                                    <p className="mt-1 text-xs text-ink-400">
                                        {COMPONENT_HELP[key]}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Skill detail */}
                {(matchedSkills.length > 0 || missingSkills.length > 0) && (
                    <div className="grid gap-4 border-t border-ink-100 pt-4 sm:grid-cols-2">
                        <div>
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-success-700">
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                Matched skills ({matchedSkills.length})
                            </p>

                            <div className="flex flex-wrap gap-1.5">
                                {matchedSkills.length > 0 ? (
                                    matchedSkills.map((skill) => (
                                        <Badge key={skill} variant="success" size="sm">
                                            {skill}
                                        </Badge>
                                    ))
                                ) : (
                                    <p className="text-xs text-ink-400">None detected.</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-danger-700">
                                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                Missing skills ({missingSkills.length})
                            </p>

                            <div className="flex flex-wrap gap-1.5">
                                {missingSkills.length > 0 ? (
                                    missingSkills.map((skill) => (
                                        <Badge key={skill} variant="danger" size="sm">
                                            {skill}
                                        </Badge>
                                    ))
                                ) : (
                                    <p className="text-xs text-ink-400">
                                        Nothing missing - every required skill was found.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default MatchBreakdown;
