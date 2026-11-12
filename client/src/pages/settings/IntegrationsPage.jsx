import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Link2, ShieldAlert, Unplug, Video } from "lucide-react";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { EmptyState, ErrorState, SkeletonList } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import { useToast } from "../../components/ui/useToast";
import { useAuth } from "../../context/useAuth";
import { integrationsApi } from "../../lib/api";
import { formatDate } from "../../lib/utils";

const OUTCOMES = {
  connected: { tone: "success", text: "Google Calendar is connected. New interviews can get a Google Meet link." },
  denied: { tone: "warning", text: "Google access was not granted, so nothing was connected." },
  invalid_state: { tone: "danger", text: "That connection request expired or was not valid. Start the connection again." },
  not_configured: { tone: "warning", text: "Google Calendar is not set up on this server yet." },
  error: { tone: "danger", text: "Google Calendar could not be connected. Try again in a moment." },
};

const TONE_CLASS = {
  success: "border-success-200 bg-success-50 text-success-900",
  warning: "border-warning-200 bg-warning-50 text-warning-900",
  danger: "border-danger-200 bg-danger-50 text-danger-900",
};

/** Only a Google sign-in address is followed; the server builds the URL, this is a guard on the client. */
const isGoogleAuthUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "accounts.google.com";
  } catch {
    return false;
  }
};

const STATUS_COPY = {
  setup_required: { label: "Setup required", variant: "warning" },
  connected: { label: "Connected", variant: "success" },
  reconnect_required: { label: "Reconnect required", variant: "warning" },
  not_connected: { label: "Not connected", variant: "outline" },
};

const GoogleCalendarCard = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const status = useQuery({
    queryKey: ["google-status"],
    queryFn: () => integrationsApi.googleStatus(),
    retry: false,
  });
  const connect = useMutation({
    mutationFn: () => integrationsApi.googleConnect(),
    onSuccess: (res) => {
      const url = res?.data?.url;
      if (!isGoogleAuthUrl(url)) {
        toast.error("The Google sign-in address was not valid. Try again.");
        return;
      }
      window.location.assign(url);
    },
    onError: (error) => toast.error(error.message || "Google Calendar could not start the connection."),
  });
  const disconnect = useMutation({
    mutationFn: () => integrationsApi.googleDisconnect(),
    onSuccess: () => {
      setDisconnectOpen(false);
      toast.success("Google Calendar disconnected. Existing Meet links stay as they are.");
      qc.invalidateQueries({ queryKey: ["google-status"] });
    },
    onError: (error) => toast.error(error.message || "Google Calendar could not be disconnected."),
  });

  if (status.isLoading) return <SkeletonList rows={2} />;
  if (status.error) return <ErrorState error={status.error} onRetry={() => status.refetch()} />;

  const data = status.data?.data || {};
  const copy = STATUS_COPY[data.status] || STATUS_COPY.not_connected;

  return (
    <section aria-labelledby="google-card-heading" className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <Video className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="google-card-heading" className="font-bold text-ink-950">
              Google Calendar and Meet
            </h2>
            <p className="text-sm text-ink-600">Create interview events and a Google Meet link for each interview.</p>
          </div>
        </div>
        <Badge variant={copy.variant}>{copy.label}</Badge>
      </div>

      {data.status === "setup_required" && (
        <div role="status" className={`rounded-xl border p-4 text-sm ${TONE_CLASS.warning}`}>
          <p className="font-semibold">Google Calendar is not set up on this server.</p>
          <p className="mt-1">
            An administrator must configure the Google OAuth client and the token encryption key on the server. Until
            then, add a meeting link to each interview. It will be labelled as a manual link.
          </p>
        </div>
      )}

      {data.status === "connected" && (
        <div role="status" className={`rounded-xl border p-4 text-sm ${TONE_CLASS.success}`}>
          <p className="flex items-center gap-2 font-semibold">
            <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Connected
          </p>
          {data.connectedAt && <p className="mt-1">Connected on {formatDate(data.connectedAt)}.</p>}
        </div>
      )}

      {data.status === "reconnect_required" && (
        <p role="status" className={`rounded-xl border p-4 text-sm ${TONE_CLASS.warning}`}>
          Google no longer accepts this connection. Reconnect to create Meet links again.
        </p>
      )}

      <div className="rounded-xl bg-ink-50 p-4 text-xs leading-5 text-ink-700">
        <p className="flex items-center gap-2 font-semibold text-ink-900">
          <ShieldAlert className="h-4 w-4 text-ink-500" aria-hidden="true" /> What HireSmart asks Google for
        </p>
        <p className="mt-1">
          The calendar events permission (calendar.events). Google describes it as viewing and editing events on your
          calendars. HireSmart uses it only to create, update and delete the interview events it makes. Refresh tokens
          are stored encrypted and never shown in the browser.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {data.status === "connected" ? (
          <Button
            variant="secondary"
            leftIcon={<Unplug className="h-4 w-4" aria-hidden="true" />}
            onClick={() => setDisconnectOpen(true)}
          >
            Disconnect Google Calendar
          </Button>
        ) : (
          <Button
            leftIcon={<Link2 className="h-4 w-4" aria-hidden="true" />}
            disabled={data.status === "setup_required"}
            isLoading={connect.isPending}
            onClick={() => connect.mutate()}
          >
            {data.status === "reconnect_required" ? "Reconnect Google Calendar" : "Connect Google Calendar"}
          </Button>
        )}
      </div>

      <ConfirmModal
        isOpen={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        onConfirm={() => disconnect.mutate()}
        title="Disconnect Google Calendar?"
        description="New interviews will not get Google Meet links until you connect again. Existing events are not deleted."
        confirmLabel="Disconnect"
        tone="warning"
        isLoading={disconnect.isPending}
      />
    </section>
  );
};

const IntegrationsPage = () => {
  const auth = useAuth();
  const [params] = useSearchParams();
  const outcome = OUTCOMES[params.get("google") || ""];
  const isRecruiterWorkspace = auth.role !== "candidate" && auth.role !== "admin" && Boolean(auth.organizationId);

  return (
    <div className="page-wrap max-w-3xl space-y-6">
      <Link to="/app/settings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
        ← Back to settings
      </Link>
      <PageHeader
        eyebrow="Settings"
        title="Integrations"
        description="Connect the tools HireSmart uses for interviews. Each connection is per person and can be removed at any time."
      />

      {outcome && (
        <div role="status" className={`rounded-xl border p-4 text-sm ${TONE_CLASS[outcome.tone]}`}>
          {outcome.text}
        </div>
      )}

      {isRecruiterWorkspace ? (
        <GoogleCalendarCard />
      ) : (
        <EmptyState
          icon={Link2}
          title="Interview integrations are for recruiters"
          description="Recruiters connect Google Calendar to create meeting links. As a candidate you join interviews from your interview page once your recruiter starts them."
          action={
            <Button as={Link} to="/app/candidate/interviews" variant="secondary" size="sm">
              Go to my interviews
            </Button>
          }
        />
      )}

      <section aria-labelledby="manual-link-heading" className="panel space-y-2 p-5">
        <h2 id="manual-link-heading" className="font-bold text-ink-950">
          Meeting links you add yourself
        </h2>
        <p className="text-sm text-ink-600">
          You can always paste a meeting link into an interview, for example Zoom or Microsoft Teams. HireSmart labels it
          as a <strong>manual link</strong> so nobody mistakes it for a Google Meet link.
        </p>
      </section>
    </div>
  );
};

export default IntegrationsPage;
