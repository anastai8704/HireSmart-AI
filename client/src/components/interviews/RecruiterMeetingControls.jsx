import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, RefreshCw, Video } from "lucide-react";
import Button from "../ui/Button";
import ConfirmModal from "../ui/ConfirmModal";
import { useToast } from "../ui/useToast";
import { interviewApi } from "../../lib/api";
import { meetingInfo, startAvailability } from "../../lib/interviewWorkflow";
import { openPreparedWindow, prepareWindow } from "./openMeeting";

const CLOSED = ["cancelled", "completed", "no_show"];
const RETRYABLE = ["pending", "failure", "setup_required"];

/**
 * Start, open-meeting and retry controls for the recruiter. The server enforces every rule; the disabled reasons shown
 * here come from the same window rules and are only a guide.
 */
const RecruiterMeetingControls = ({ orgId, interview, showHint = true }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmStart, setConfirmStart] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState("");
  const id = interview._id || interview.id;
  const closed = CLOSED.includes(interview.status);
  const info = meetingInfo(interview);
  const availability = startAvailability(interview, new Date());
  const live = interview.status === "in_progress";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["interviews", orgId] });
    qc.invalidateQueries({ queryKey: ["interview-detail", orgId, id] });
  };

  const start = useMutation({
    mutationFn: () => interviewApi.start(orgId, id),
    onSuccess: () => {
      setConfirmStart(false);
      toast.success("Interview started. The candidate can now join.");
      refresh();
    },
    onError: (error) => {
      setConfirmStart(false);
      toast.error(error.message || "The interview could not be started.");
    },
  });

  const openMeeting = useMutation({
    mutationFn: (win) => interviewApi.staffJoin(orgId, id).then((res) => ({ res, win })),
    onSuccess: ({ res, win }) => {
      const url = res?.data?.url;
      if (openPreparedWindow(win, url)) return;
      setFallbackUrl(url || "");
      toast.error("Your browser blocked the new tab. Use the meeting link below.");
    },
    onError: (error) => {
      toast.error(error.message || "The meeting link is not available.");
    },
  });

  const retry = useMutation({
    mutationFn: () => interviewApi.retryMeeting(orgId, id),
    onSuccess: (res) => {
      const status = res?.data?.meetingStatus;
      if (status === "success") toast.success("Google Meet link created.");
      else if (status === "setup_required") toast.error("Connect Google Calendar in Settings first.");
      else toast.error("Google did not return a Meet link yet. Try again shortly.");
      refresh();
    },
    onError: (error) => toast.error(error.message || "Could not retry the meeting link."),
  });

  return (
    <div className="flex flex-col gap-2" data-testid="recruiter-meeting-controls">
      <div className="flex flex-wrap items-center gap-2">
        {!closed && (
          <Button
            size="sm"
            leftIcon={<Play className="h-4 w-4" aria-hidden="true" />}
            disabled={live || !availability.ok}
            aria-describedby={showHint ? `start-hint-${id}` : undefined}
            onClick={() => setConfirmStart(true)}
          >
            {live ? "Started" : "Start interview"}
          </Button>
        )}
        {!closed && info.url && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Video className="h-4 w-4" aria-hidden="true" />}
            isLoading={openMeeting.isPending}
            onClick={() => openMeeting.mutate(prepareWindow())}
          >
            Open meeting
          </Button>
        )}
        {!closed && RETRYABLE.includes(info.kind) && interview.meetingProvider !== "manual" && (
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
            isLoading={retry.isPending}
            onClick={() => retry.mutate()}
          >
            Retry Meet link
          </Button>
        )}
      </div>
      {showHint && !closed && (
        <p id={`start-hint-${id}`} className="text-xs text-ink-500">
          {live
            ? "The interview is live. The candidate can join from their interview page."
            : availability.ok
              ? "The candidate can join after you start."
              : availability.reason}
        </p>
      )}
      {fallbackUrl && (
        <a
          href={fallbackUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-brand-700 underline"
        >
          Open the meeting link (opens in a new tab)
        </a>
      )}
      <ConfirmModal
        isOpen={confirmStart}
        onClose={() => setConfirmStart(false)}
        onConfirm={() => start.mutate()}
        title="Start this interview?"
        description="The candidate will be notified and can join now. Only start when you are ready to meet."
        confirmLabel="Start interview"
        tone="brand"
        isLoading={start.isPending}
      />
    </div>
  );
};

export default RecruiterMeetingControls;
