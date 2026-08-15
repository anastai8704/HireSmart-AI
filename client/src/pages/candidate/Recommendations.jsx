/**
 * candidate/Recommendations.jsx
 * -----------------------------------------------------------------------------
 * Every open job, ranked by how well it fits this candidate's resume.
 *
 * This is the candidate-facing payoff of the matching engine: instead of
 * scrolling a list sorted by date, they see the roles where they actually stand
 * a chance, strongest first, with the missing skills visible up front.
 */

import { Link } from "react-router-dom";
import { RefreshCw, Sparkles, Upload } from "lucide-react";

import Button from "../../components/ui/Button";
import JobCard from "../../components/jobs/JobCard";
import { Card, CardContent } from "../../components/ui/Card";
import { EmptyState, ErrorState, SkeletonList } from "../../components/ui/States";
import { aiApi } from "../../lib/api";
import { useAuth } from "../../context/useAuth";
import { useFetch } from "../../hooks/useApi";

const Recommendations = () => {
    const { user } = useAuth();
    const hasResume = Boolean(user?.resume);

    const { data, isLoading, error, refetch } = useFetch(
        () => aiApi.recommendations(20),
        [hasResume],
        { enabled: hasResume }
    );

    const recommendations = data?.data?.recommendations || [];

    // A quick summary line so the ranking feels grounded.
    const averageScore = recommendations.length
        ? Math.round(
              recommendations.reduce((sum, item) => sum + item.match.matchScore, 0) /
                  recommendations.length
          )
        : 0;

    return (
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
            <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-ink-900">
                        <Sparkles className="h-7 w-7 text-brand-500" aria-hidden="true" />
                        Recommended for you
                    </h1>

                    <p className="mt-1.5 text-ink-500">
                        Open roles ranked against your resume by the matching engine.
                    </p>
                </div>

                {hasResume && (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={refetch}
                        isLoading={isLoading}
                        leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                    >
                        Refresh
                    </Button>
                )}
            </header>

            {!hasResume ? (
                <EmptyState
                    icon={Upload}
                    title="Upload a resume to get recommendations"
                    description="The engine scores every open job against your resume. Without one there is nothing to compare."
                    action={
                        <Button as={Link} to="/my-resume">
                            Upload my resume
                        </Button>
                    }
                />
            ) : isLoading ? (
                <SkeletonList count={4} />
            ) : error ? (
                <ErrorState error={error} onRetry={refetch} />
            ) : recommendations.length === 0 ? (
                <EmptyState
                    icon={Sparkles}
                    title="No strong matches right now"
                    description="We only show roles scoring above 20% so the list stays useful. Try browsing everything, or add more detail to your resume."
                    action={
                        <Button as={Link} to="/jobs" variant="secondary">
                            Browse all jobs
                        </Button>
                    }
                />
            ) : (
                <>
                    <Card className="mb-5 border-brand-200 bg-brand-50">
                        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                            <p className="text-sm text-ink-700">
                                <strong>{recommendations.length}</strong> roles matched, averaging{" "}
                                <strong>{averageScore}%</strong>. Your best match is{" "}
                                <strong>{recommendations[0].match.matchScore}%</strong>.
                            </p>

                            <Link
                                to="/my-resume"
                                className="text-sm font-medium text-brand-700 hover:underline"
                            >
                                Improve my score
                            </Link>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4">
                        {recommendations.map((item) => (
                            <JobCard key={item.job._id} job={item.job} match={item.match} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default Recommendations;
