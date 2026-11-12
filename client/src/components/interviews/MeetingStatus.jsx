import { ExternalLink } from "lucide-react";
import Badge from "../ui/Badge";
import { meetingInfo } from "../../lib/interviewWorkflow";
import { safeHttpUrl } from "../../lib/safeUrl";

const VARIANT = {
  google_meet: "success",
  manual: "brand",
  setup_required: "warning",
  pending: "warning",
  failure: "danger",
  unknown: "outline",
  none: "outline",
  cancelled: "outline",
};

/** Recruiter-only meeting status. Names Google Meet only when the record says Google created the link. */
const MeetingStatus = ({ interview, compact = false }) => {
  const info = meetingInfo(interview);
  const href = safeHttpUrl(info.url);
  return (
    <div className="flex flex-col gap-1" data-testid="meeting-status">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={VARIANT[info.kind] || "outline"}>{info.label}</Badge>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 break-all text-xs font-semibold text-brand-700 hover:underline"
          >
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{compact ? "Open link" : href}</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
      {!compact && info.description && <p className="text-xs text-ink-500">{info.description}</p>}
    </div>
  );
};

export default MeetingStatus;
