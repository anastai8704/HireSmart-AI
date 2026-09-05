import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Info,
  Star,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { cn, formatRelativeTime } from "../lib/utils";

export const PageHeader = ({ eyebrow, title, description, action }) => (
  <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink-950 sm:text-[34px]">
        {title}
      </h1>
      {description && (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500 sm:text-[15px]">
          {description}
        </p>
      )}
    </div>
    {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
  </header>
);

export const Metric = ({ label, value, detail, tone = "ink", icon: Icon }) => (
  <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-4">
    <div className="flex items-center gap-2">
      {Icon && (
        <span
          className={cn(
            "grid h-7 w-7 place-items-center rounded-lg",
            tone === "brand"
              ? "bg-brand-50 text-brand-600"
              : tone === "success"
                ? "bg-success-50 text-success-500"
                : "bg-white text-ink-400",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      )}
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">{label}</p>
    </div>
    <p
      className={cn(
        "mt-2 text-[26px] font-extrabold leading-none tabular-nums tracking-tight",
        tone === "brand"
          ? "text-brand-700"
          : tone === "success"
            ? "text-success-700"
            : "text-ink-950",
      )}
    >
      {value}
    </p>
    {detail && <p className="mt-1.5 text-xs text-ink-500">{detail}</p>}
  </div>
);

const DETAILS_OPEN_ATTR = "group-open:rotate-90";
export const AIProvenance = ({ metadata, confidence, limitations = [], tone = "dark" }) => {
  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "rounded-xl border p-4 text-sm",
        dark ? "border-white/10 bg-white/5" : "border-ink-200 bg-ink-50/70",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "grid h-6 w-6 place-items-center rounded-md",
            dark ? "bg-brand-500/20 text-cyan-300" : "bg-brand-50 text-brand-600",
          )}
        >
          <Bot className="h-3.5 w-3.5" />
        </span>
        <span className={cn("font-semibold", dark ? "text-white" : "text-ink-900")}>
          AI Assistant Response
        </span>
        {confidence !== undefined && confidence !== null && (
          <Badge variant={dark ? "outline" : "default"}>
            {Math.round(confidence * 100)}% confidence
          </Badge>
        )}
        {metadata?.fallbackUsed && (
          <Badge variant={dark ? "outline" : "default"}>Backup Response</Badge>
        )}
      </div>
      <details className="group mt-3">
        <summary
          className={cn(
            "flex cursor-pointer list-none items-center gap-1 text-xs font-semibold [&::-webkit-details-marker]:hidden",
            dark ? "text-ink-400 hover:text-ink-300" : "text-ink-500 hover:text-ink-700",
          )}
        >
          <ArrowRight className={cn("h-3 w-3 transition-transform", DETAILS_OPEN_ATTR)} />
          How this answer was generated
        </summary>
        <div
          className={cn("mt-2 space-y-2", dark ? "text-xs text-ink-400" : "text-xs text-ink-500")}
        >
          {metadata && (
            <p>
              {metadata.provider} · {metadata.model} · {metadata.promptVersion}
            </p>
          )}
          {limitations.length > 0 && (
            <ul className="space-y-1">
              {limitations.map((item) => (
                <li key={item} className="flex gap-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
};

const matchBand = (score) =>
  score >= 80
    ? { label: "Strong Match", stroke: "stroke-success-500", text: "text-success-700" }
    : score >= 60
      ? { label: "Good Match", stroke: "stroke-brand-500", text: "text-brand-700" }
      : score >= 40
        ? { label: "Fair Match", stroke: "stroke-warning-500", text: "text-warning-700" }
        : { label: "Needs Review", stroke: "stroke-danger-500", text: "text-danger-700" };

export const MatchRing = ({ score, size = 116 }) => {
  const pct = Math.max(0, Math.min(100, Number(score) || 0));
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const band = matchBand(pct);
  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth="9"
          fill="none"
          className="stroke-ink-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth="9"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          className={cn(band.stroke)}
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-extrabold tabular-nums tracking-tight">{pct}</div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
          Match Score
        </div>
      </div>
    </div>
  );
};

const COMPONENT_LABELS = {
  skills: "Required Skills Match",
  semantic: "Profile Match",
  experience: "Experience Match",
  education: "Education Match",
  preferences: "Job Preferences",
};

const scoreSummary = (match) => {
  const parts = [];
  const strong = (match.matchedSkills || []).slice(0, 3);
  if (strong.length) parts.push(`Strong overlap on ${strong.join(", ")}.`);
  const missing = match.missingRequiredSkills || [];
  if (missing.length) parts.push(`Not clearly shown in the resume: ${missing.join(", ")}.`);
  else parts.push("All required skills were found in the resume.");
  const exp = match.experienceEvidence;
  if (exp) {
    if (exp.candidateYears != null && exp.requiredYears != null)
      parts.push(
        `Experience: ${exp.candidateYears} year(s) on the resume against a ${exp.requiredYears} year requirement.`,
      );
    else if (exp.candidateYears != null)
      parts.push(`Experience: ${exp.candidateYears} year(s) on the resume.`);
  }
  return parts.join(" ");
};

export const HybridMatch = ({ match, compact = false }) => {
  if (!match) return null;
  const components = match.componentScores || {};
  const band = matchBand(match.overallScore);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <MatchRing score={match.overallScore} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-extrabold capitalize tracking-tight">
              {String(match.recommendation || "Match analysis").replaceAll("_", " ")}
            </h3>
            <span className={cn("text-sm font-bold", band.text)}>{band.label}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="default">{Math.round((match.confidence || 0) * 100)}% confidence</Badge>
            <span className="text-xs text-ink-500">
              Decision support only — the final call is yours.
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(match.matchedSkills || []).slice(0, 8).map((skill) => (
              <Badge key={skill} variant="success">
                {skill}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      {!compact && (
        <>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
              How the score is built
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(components).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-ink-100 bg-ink-50/50 p-3.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold text-ink-700">
                      {COMPONENT_LABELS[key] || key.replace(/([A-Z])/g, " $1")}
                    </span>
                    <span className="font-extrabold tabular-nums text-ink-950">
                      {value.applicable === false ? "N/A" : `${value.score}%`}
                    </span>
                  </div>
                  <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400"
                      style={{ width: `${value.applicable === false ? 0 : value.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
                Strong Matches
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {match.matchedSkills?.length ? (
                  match.matchedSkills.map((s) => (
                    <Badge key={s} variant="success">
                      {s}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-ink-500">No skill overlaps detected.</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-danger-700">
                Missing Skills
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {match.missingRequiredSkills?.length ? (
                  match.missingRequiredSkills.map((s) => (
                    <Badge key={s} variant="danger">
                      {s}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-ink-500">No required skill gaps detected.</span>
                )}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-warning-500/20 bg-warning-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-warning-700">
              Things to Check
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-700">
              {(match.concerns || []).map((x) => (
                <li key={x} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-500" />
                  {x}
                </li>
              ))}
              {!match.concerns?.length && (
                <li className="text-ink-600">No major concerns identified for this candidate.</li>
              )}
            </ul>
          </div>
          <div className="rounded-xl bg-ink-50 p-4 text-sm text-ink-600">
            <p className="font-semibold text-ink-900">Why we gave this score</p>
            <p className="mt-1 leading-6">{scoreSummary(match)}</p>
          </div>
          <div className="rounded-xl border border-ink-100 p-4 text-sm text-ink-600">
            <p className="font-semibold text-ink-900">What we found</p>
            <ul className="mt-2 space-y-1.5">
              <li>Profile match compares the wording of your resume and the job description.</li>
              {match.experienceEvidence?.candidateYears != null && (
                <li>
                  Experience on the resume: {match.experienceEvidence.candidateYears} year (s)
                  {match.experienceEvidence.requiredYears != null
                    ? `, required minimum: ${match.experienceEvidence.requiredYears} year(s)`
                    : ""}
                  .
                </li>
              )}
              {(match.limitations || []).map((x) => (
                <li key={x}>• {x}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

const STATUS_STYLES = {
  ready: [CheckCircle2, "success"],
  completed: [CheckCircle2, "success"],
  approved: [CheckCircle2, "success"],
  active: [CheckCircle2, "success"],
  confirmed: [CheckCircle2, "success"],
  hired: [Star, "success"],
  failed: [XCircle, "danger"],
  rejected: [XCircle, "danger"],
  suspended: [XCircle, "danger"],
  processing: [CircleDashed, "brand"],
  invited: [Clock3, "brand"],
  shortlisted: [CheckCircle2, "brand"],
  offer: [Star, "brand"],
  queued: [Clock3, "warning"],
  pending: [Clock3, "warning"],
  under_review: [CircleDashed, "warning"],
  interview: [Clock3, "warning"],
  withdrawn: [XCircle, "default"],
  closed: [XCircle, "default"],
  deleted: [XCircle, "default"],
  draft: [CircleDashed, "default"],
};
export const StatusPill = ({ status }) => {
  const s = String(status || "unknown");
  const [Icon, variant] = STATUS_STYLES[s] || [Info, "default"];
  const label = s.replaceAll("_", " ");
  return (
    <Badge variant={variant}>
      <Icon className="mr-1 h-3 w-3" />
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </Badge>
  );
};

export const JobTile = ({ job, match, saved, onSave }) => {
  const jobId = job.id || job._id;
  const href = !match && !onSave ? `/jobs/${jobId}` : `/app/candidate/jobs/${jobId}`;
  const skills = job.requiredSkills || job.skills || [];
  const band = match ? matchBand(match.overallScore) : null;
  return (
    <article className="panel group flex flex-col p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-card-hover)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600">
            {job.workplaceMode || job.jobType}
          </p>
          <h3 className="mt-1 text-lg font-bold leading-snug">
            <Link to={href} className="transition-colors hover:text-brand-600">
              {job.title}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            {job.company} · {job.location}
          </p>
        </div>
        {match && (
          <div
            className={cn(
              "shrink-0 rounded-xl border border-ink-100 bg-ink-50 px-3 py-2 text-center",
            )}
          >
            <div className={cn("text-xl font-extrabold tabular-nums", band.text)}>
              {match.overallScore}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Match</div>
          </div>
        )}
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink-600">{job.description}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {skills.slice(0, 5).map((skill) => (
          <Badge key={skill}>{skill}</Badge>
        ))}
        {skills.length > 5 && <Badge variant="outline">+{skills.length - 5}</Badge>}
      </div>
      <div className="mt-5 flex items-center gap-2 pt-1">
        <Button as={Link} to={href} size="sm">
          View match <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        {onSave && (
          <Button variant="ghost" size="sm" onClick={() => onSave(jobId)}>
            {saved ? "Saved" : "Save"}
          </Button>
        )}
        <span className="ml-auto text-xs text-ink-400">
          {job.createdAt ? formatRelativeTime(job.createdAt) : "Open"}
        </span>
      </div>
    </article>
  );
};

export const ErrorCallout = ({ error }) => (
  <div
    role="alert"
    className="flex gap-3 rounded-xl border border-danger-500/20 bg-danger-50 p-4 text-sm text-danger-700"
  >
    <AlertTriangle className="h-5 w-5 shrink-0" />
    <div>
      <p className="font-semibold">This action did not complete</p>
      <p>{error?.message || "Please try again."}</p>
      {error?.requestId && <p className="mt-1 font-mono text-xs">Request {error.requestId}</p>}
    </div>
  </div>
);
