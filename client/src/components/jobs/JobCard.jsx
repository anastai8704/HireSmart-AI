/**
 * JobCard.jsx
 * -----------------------------------------------------------------------------
 * One job in a list. Used on the public job board, in recommendations and in
 * the candidate's saved jobs.
 *
 * It optionally shows an AI match score. Passing `match` turns the card into a
 * recommendation card without needing a second component.
 */

import { Link } from "react-router-dom";
import { Bookmark, BookmarkCheck, Briefcase, IndianRupee, MapPin, Clock } from "lucide-react";

import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { Card } from "../ui/Card";
import { cn, formatRelativeTime, formatSalary, scoreClasses, truncate } from "../../lib/utils";

const JobCard = ({
    job,
    match,
    isSaved = false,
    onToggleSave,
    isSaving = false,
    showSaveButton = false,
}) => {
    if (!job) return null;

    return (
        <Card hoverable className="group flex flex-col p-5">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            to={`/jobs/${job._id}`}
                            className="text-base font-semibold text-ink-900 transition-colors hover:text-brand-600"
                        >
                            {job.title}
                        </Link>

                        {job.jobType && (
                            <Badge variant="outline" size="sm">
                                {job.jobType}
                            </Badge>
                        )}
                    </div>

                    <p className="mt-1 text-sm font-medium text-ink-600">{job.company}</p>

                    {/* Key facts row */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-500">
                        <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                            {job.location}
                        </span>

                        <span className="inline-flex items-center gap-1">
                            <IndianRupee className="h-3.5 w-3.5" aria-hidden="true" />
                            {formatSalary(job.salary)}
                        </span>

                        <span className="inline-flex items-center gap-1">
                            <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                            {job.experience}
                        </span>

                        {job.createdAt && (
                            <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                                {formatRelativeTime(job.createdAt)}
                            </span>
                        )}
                    </div>
                </div>

                {/* AI match score, when this card is used as a recommendation. */}
                {match && (
                    <div
                        className={cn(
                            "flex shrink-0 flex-col items-center rounded-xl border px-3 py-2",
                            scoreClasses(match.matchScore)
                        )}
                    >
                        <span className="text-xl font-bold leading-none tabular-nums">
                            {match.matchScore}
                        </span>
                        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-75">
                            match
                        </span>
                    </div>
                )}
            </div>

            {job.description && (
                <p className="mt-3 text-sm leading-relaxed text-ink-500">
                    {truncate(job.description, 160)}
                </p>
            )}

            {/* Skills - capped so one job with 30 tags cannot wreck the layout. */}
            {job.skills?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {job.skills.slice(0, 6).map((skill) => {
                        const isMatched = match?.matchedSkills?.includes(skill.toLowerCase());

                        return (
                            <Badge
                                key={skill}
                                size="sm"
                                variant={isMatched ? "success" : "default"}
                            >
                                {skill}
                            </Badge>
                        );
                    })}

                    {job.skills.length > 6 && (
                        <Badge size="sm" variant="outline">
                            +{job.skills.length - 6} more
                        </Badge>
                    )}
                </div>
            )}

            {/* The AI's one-line reason, when available. */}
            {match?.explanation?.[0] && (
                <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                    {match.explanation[0]}
                </p>
            )}

            <div className="mt-4 flex items-center gap-2 pt-1">
                <Button as={Link} to={`/jobs/${job._id}`} size="sm" variant="secondary">
                    View details
                </Button>

                {showSaveButton && (
                    <Button
                        size="sm"
                        variant="ghost"
                        isLoading={isSaving}
                        onClick={() => onToggleSave?.(job._id, isSaved)}
                        aria-label={isSaved ? "Remove from saved jobs" : "Save this job"}
                        leftIcon={
                            isSaved ? (
                                <BookmarkCheck className="h-4 w-4 text-brand-600" />
                            ) : (
                                <Bookmark className="h-4 w-4" />
                            )
                        }
                    >
                        {isSaved ? "Saved" : "Save"}
                    </Button>
                )}
            </div>
        </Card>
    );
};

export default JobCard;
