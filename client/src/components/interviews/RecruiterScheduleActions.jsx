import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCheck, Ban } from "lucide-react";
import Button from "../ui/Button";
import Input, { Select, Textarea } from "../ui/Input";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import { useToast } from "../ui/useToast";
import { ErrorCallout } from "../Product";
import { interviewApi } from "../../lib/api";
import {
  DEFAULT_TIMEZONE,
  TIMEZONE_OPTIONS,
  toZonedLocalInput,
  validateTiming,
} from "../../lib/interviewWorkflow";
import RecruiterMeetingControls from "./RecruiterMeetingControls";

const CLOSED = ["cancelled", "completed", "no_show"];

const refresh = (qc, orgId, id) => {
  qc.invalidateQueries({ queryKey: ["interviews", orgId] });
  qc.invalidateQueries({ queryKey: ["interview-detail", orgId, id] });
};

/** Reschedule. The server moves the interview back to "invited" and re-syncs the meeting link. */
const RescheduleForm = ({ orgId, interview, onDone }) => {
  const id = interview._id || interview.id;
  const qc = useQueryClient();
  const toast = useToast();
  const tz = interview.timezone || DEFAULT_TIMEZONE;
  const [form, setForm] = useState(() => ({
    start: toZonedLocalInput(interview.scheduledStart, tz),
    end: toZonedLocalInput(interview.scheduledEnd || interview.scheduledStart, tz),
    timezone: tz,
  }));
  const [errors, setErrors] = useState({});
  const mutation = useMutation({
    mutationFn: (body) => interviewApi.update(orgId, id, body),
    onSuccess: () => {
      toast.success("Interview rescheduled. The candidate needs to confirm the new time.");
      refresh(qc, orgId, id);
      onDone();
    },
    onError: (error) => toast.error(error.message || "The interview could not be rescheduled."),
  });

  const submit = (event) => {
    event.preventDefault();
    const { errors: found, start, end } = validateTiming(form, new Date());
    setErrors(found);
    if (Object.keys(found).length) return;
    mutation.mutate({
      scheduledStart: start.toISOString(),
      scheduledEnd: end.toISOString(),
      timezone: form.timezone,
    });
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Reschedule interview" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="New start"
          type="datetime-local"
          required
          value={form.start}
          error={errors.start}
          onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
        />
        <Input
          label="New end"
          type="datetime-local"
          required
          value={form.end}
          error={errors.end}
          onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
        />
      </div>
      <Select
        label="Timezone"
        value={form.timezone}
        error={errors.timezone}
        onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
        options={TIMEZONE_OPTIONS.map((zone) => ({ value: zone, label: zone }))}
      />
      {mutation.error && <ErrorCallout error={mutation.error} />}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Keep current time
        </Button>
        <Button type="submit" isLoading={mutation.isPending}>
          Save new time
        </Button>
      </div>
    </form>
  );
};

/** Cancel with a reason. Cancelling removes a Google Calendar event when one exists (server-side). */
const CancelDialog = ({ orgId, interview, open, onClose }) => {
  const id = interview._id || interview.id;
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => interviewApi.cancel(orgId, id, reason.trim() || "Cancelled by the hiring team"),
    onSuccess: () => {
      toast.success("Interview cancelled. The candidate has been notified.");
      setReason("");
      refresh(qc, orgId, id);
      onClose();
    },
    onError: (error) => toast.error(error.message || "The interview could not be cancelled."),
  });
  return (
    <ConfirmModal
      isOpen={open}
      onClose={onClose}
      onConfirm={() => mutation.mutate()}
      title="Cancel this interview?"
      description="The candidate will be told it was cancelled. This cannot be undone from here."
      confirmLabel="Cancel interview"
      tone="danger"
      isLoading={mutation.isPending}
    >
      <Textarea
        label="Reason (shown to the candidate)"
        value={reason}
        maxLength={1000}
        onChange={(e) => setReason(e.target.value)}
        placeholder="For example: the role was filled"
      />
    </ConfirmModal>
  );
};

/** Actions for one recruiter interview card: start and meeting controls, reschedule, cancel, complete and details. */
const RecruiterScheduleActions = ({ orgId, interview }) => {
  const id = interview._id || interview.id;
  const qc = useQueryClient();
  const toast = useToast();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const closed = CLOSED.includes(interview.status);
  const startPassed = interview.scheduledStart && new Date(interview.scheduledStart) <= new Date();

  const complete = useMutation({
    mutationFn: () => interviewApi.complete(orgId, id),
    onSuccess: () => {
      toast.success("Interview marked as completed.");
      setCompleteOpen(false);
      refresh(qc, orgId, id);
    },
    onError: (error) => toast.error(error.message || "The interview could not be completed."),
  });

  return (
    <div className="space-y-3">
      <RecruiterMeetingControls orgId={orgId} interview={interview} />
      <div className="flex flex-wrap gap-2">
        {!closed && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
            onClick={() => setRescheduleOpen(true)}
          >
            Reschedule
          </Button>
        )}
        {!closed && startPassed && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<CheckCheck className="h-4 w-4" aria-hidden="true" />}
            onClick={() => setCompleteOpen(true)}
          >
            Mark completed
          </Button>
        )}
        {!closed && (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger-700 hover:bg-danger-50"
            leftIcon={<Ban className="h-4 w-4" aria-hidden="true" />}
            onClick={() => setCancelOpen(true)}
          >
            Cancel
          </Button>
        )}
        <Button as={Link} to={`/app/o/${orgId}/interviews/${id}`} size="sm" variant="ghost">
          Details, feedback &amp; history
        </Button>
      </div>

      <Modal isOpen={rescheduleOpen} onClose={() => setRescheduleOpen(false)} title="Reschedule interview">
        {rescheduleOpen && (
          <RescheduleForm orgId={orgId} interview={interview} onDone={() => setRescheduleOpen(false)} />
        )}
      </Modal>
      <CancelDialog orgId={orgId} interview={interview} open={cancelOpen} onClose={() => setCancelOpen(false)} />
      <ConfirmModal
        isOpen={completeOpen}
        onClose={() => setCompleteOpen(false)}
        onConfirm={() => complete.mutate()}
        title="Mark this interview as completed?"
        description="Use this after the interview has taken place. You can add scorecard feedback on the details page."
        confirmLabel="Mark completed"
        tone="success"
        isLoading={complete.isPending}
      />
    </div>
  );
};

export default RecruiterScheduleActions;
