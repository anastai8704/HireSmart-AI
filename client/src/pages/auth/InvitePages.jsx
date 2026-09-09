import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Ban,
  Building2,
  CheckCheck,
  Clock,
  Hourglass,
  KeyRound,
  LogIn,
  Mail,
  PartyPopper,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import Button from "../../components/ui/Button";
import PasswordField from "../../components/ui/PasswordField";
import Input from "../../components/ui/Input";
import { ErrorCallout } from "../../components/Product";
import { Skeleton } from "../../components/ui/States";
import { inviteApi } from "../../lib/api";
import { useAuth } from "../../context/useAuth";
import { usePageMeta } from "../../lib/usePageMeta";
import { cn } from "../../lib/utils";
import AuthShell from "./AuthShell";

const roleLabel = (role) =>
  String(role || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const ROLE_CHIP = {
  owner: "border-brand-300 bg-brand-50 text-brand-700",
  admin: "border-brand-300 bg-brand-50 text-brand-700",
  recruiter: "border-cyan-600/30 bg-cyan-600/10 text-cyan-600",
  hiring_manager: "border-warning-500/40 bg-warning-50 text-warning-700",
  interviewer: "border-ink-200 bg-ink-100 text-ink-700",
  viewer: "border-ink-200 bg-white text-ink-600",
};

const RoleChip = ({ role }) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
      ROLE_CHIP[role] || ROLE_CHIP.viewer,
    )}
  >
    {roleLabel(role)}
  </span>
);

/** Terminal invitation states: expired, revoked, used, invalid, mismatch. */
const InviteStatus = ({ icon: Icon, tone, title, copy, sub, children }) => {
  const tones = {
    warning: "bg-warning-50 text-warning-700 ring-warning-500/30",
    danger: "bg-danger-50 text-danger-700 ring-danger-500/30",
    info: "bg-brand-50 text-brand-700 ring-brand-500/30",
    success: "bg-success-50 text-success-700 ring-success-500/30",
  };
  return (
    <div className="animate-fade-up">
      <div className="panel overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-brand-500 via-[#4f7cff] to-cyan-300" />
        <div className="p-8 text-center">
          <span
            className={cn(
              "animate-pop-in mx-auto grid h-16 w-16 place-items-center rounded-full ring-8",
              tones[tone] || tones.info,
            )}
          >
            <Icon className="h-7 w-7" />
          </span>
          <h1 className="mt-6 text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2.5 text-sm leading-6 text-ink-600">{copy}</p>
          {sub && <p className="mt-1.5 text-sm leading-6 text-ink-500">{sub}</p>}
          {children && <div className="mt-7 flex flex-col items-center gap-3">{children}</div>}
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-ink-500">
        Need help?{" "}
        <Link to="/" className="font-semibold text-brand-600 hover:text-brand-700">
          Back to HireSmart
        </Link>
      </p>
    </div>
  );
};

const InfoRow = ({ icon: Icon, label, children }) => (
  <div className="flex items-center justify-between gap-4 py-3">
    <span className="flex items-center gap-2 text-sm text-ink-500">
      <Icon className="h-4 w-4" />
      {label}
    </span>
    <span className="text-sm font-semibold text-ink-800">{children}</span>
  </div>
);

export const AcceptInvitePage = () => {
  const [params] = useSearchParams(),
    token = params.get("token"),
    navigate = useNavigate(),
    { login, user } = useAuth(),
    info = useQuery({
      queryKey: ["invite", token],
      queryFn: () => inviteApi.info(token),
      enabled: Boolean(token),
      retry: false,
    }),
    [mode, setMode] = useState(null),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [existing, setExisting] = useState({ email: "", password: "" }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [mismatch, setMismatch] = useState(false),
    [terminal, setTerminal] = useState(null),
    [joined, setJoined] = useState(null);
  const d = info.data?.data;
  usePageMeta({
    title: d ? `Join ${d.organization.name} — HireSmart AI` : "Team invitation — HireSmart AI",
    description: "You've been invited to join a hiring team on HireSmart AI.",
  });

  // The sign-in form always starts with the invited email — the account that
  // can accept this link is the one it was sent to.
  const signInEmail = existing.email || d?.email || "";
  const signedInAsOther =
    Boolean(user?.email) &&
    Boolean(d) &&
    String(user.email).toLowerCase() !== String(d.email).toLowerCase();
  const activeMode = mode || (d?.accountExists ? "existing" : "new");

  const finish = (orgId) => navigate(`/app/o/${orgId}`, { replace: true });

  const codeOf = (err) => err?.response?.data?.code;

  const submitNew = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await inviteApi.accept(token, { name, password });
      await login({ email: d.email, password });
      setJoined({
        orgId: d.organization.id,
        orgName: d.organization.name,
        role: d.role,
        alreadyMember: false,
      });
    } catch (err) {
      if (codeOf(err) === "EMAIL_IN_USE") {
        setMode("existing");
        setExisting({ email: d.email, password: "" });
        setError(err);
      } else if (codeOf(err) === "INVITE_EXPIRED" || codeOf(err) === "INVITE_REVOKED" || codeOf(err) === "INVITE_USED") {
        // The invitation changed state mid-flow — hand over to the status card.
        setTerminal(codeOf(err));
      } else setError(err);
      setBusy(false);
    }
  };
  const submitExisting = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login({ email: signInEmail, password: existing.password });
      const r = await inviteApi.acceptExisting(token);
      setJoined({
        orgId: r.data.organization.id,
        orgName: r.data.organization.name,
        role: r.data.role,
        alreadyMember: false,
      });
    } catch (err) {
      if (codeOf(err) === "INVITE_EMAIL_MISMATCH") {
        setMismatch(true);
      } else if (codeOf(err) === "ALREADY_MEMBER") {
        setJoined({
          orgId: d.organization.id,
          orgName: d.organization.name,
          role: null,
          alreadyMember: true,
        });
      } else if (
        codeOf(err) === "INVITE_EXPIRED" ||
        codeOf(err) === "INVITE_REVOKED" ||
        codeOf(err) === "INVITE_USED"
      ) {
        setTerminal(codeOf(err));
      } else setError(err);
      setBusy(false);
    }
  };

  /* ------------------------------ terminal states ------------------------------ */
  const errorData = info.error?.response?.data;
  const errorCode = terminal || errorData?.code;
  if (info.isLoading)
    return (
      <AuthShell
        bare
        title=""
        brand={{ eyebrow: "Team invitation", title: "You're invited", highlight: "to join the team." }}
      >
        <div className="panel p-8" role="status" aria-label="Loading invitation">
          <Skeleton className="mx-auto h-12 w-12 rounded-full" />
          <Skeleton className="mx-auto mt-6 h-6 w-2/3" />
          <Skeleton className="mx-auto mt-3 h-4 w-1/2" />
          <div className="mt-8 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </AuthShell>
    );
  if (!token || info.error || !d) {
    if (errorCode === "INVITE_EXPIRED")
      return (
        <AuthShell
          bare
          brand={{ eyebrow: "Team invitation", title: "This link has", highlight: "run out of time." }}
        >
          <InviteStatus
            icon={Clock}
            tone="warning"
            title="Invitation expired"
            copy="This invitation is no longer valid."
            sub="Invitations stay open for 7 days. Ask the person who invited you to send a fresh one."
          >
            <Button as={Link} to="/" variant="secondary">
              Back to HireSmart
            </Button>
          </InviteStatus>
        </AuthShell>
      );
    if (errorCode === "INVITE_REVOKED")
      return (
        <AuthShell
          bare
          brand={{ eyebrow: "Team invitation", title: "This invitation", highlight: "was cancelled." }}
        >
          <InviteStatus
            icon={Ban}
            tone="danger"
            title="Invitation revoked"
            copy="This invitation has been cancelled by the organization."
            sub="If you believe this is a mistake, reach out to the person who invited you."
          >
            <Button as={Link} to="/" variant="secondary">
              Back to HireSmart
            </Button>
          </InviteStatus>
        </AuthShell>
      );
    if (errorCode === "INVITE_USED")
      return (
        <AuthShell
          bare
          brand={{ eyebrow: "Team invitation", title: "Already", highlight: "accepted." }}
        >
          <InviteStatus
            icon={CheckCheck}
            tone="info"
            title="Invitation already accepted"
            copy="This invitation has already been used."
            sub="If this is your account, sign in to continue — you already have access."
          >
            <Button as={Link} to="/auth/login">
              Sign in
            </Button>
          </InviteStatus>
        </AuthShell>
      );
    return (
      <AuthShell
        bare
        brand={{ eyebrow: "Team invitation", title: "We couldn't", highlight: "find that link." }}
      >
        <InviteStatus
          icon={KeyRound}
          tone="danger"
          title="Invitation not found"
          copy="This invitation link is no longer valid."
          sub="Ask the person who invited you to send a new invitation."
        >
          <Button as={Link} to="/" variant="secondary">
            Back to HireSmart
          </Button>
        </InviteStatus>
      </AuthShell>
    );
  }

  /* -------------------------------- success -------------------------------- */
  if (joined)
    return (
      <AuthShell
        bare
        brand={{
          eyebrow: "Team invitation",
          title: "Welcome to",
          highlight: `${joined.orgName}.`,
          sub: "Your seat on the team is ready.",
        }}
      >
        <div className="animate-fade-up">
          <div className="panel overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-brand-500 via-[#4f7cff] to-cyan-300" />
            <div className="p-8 text-center">
              <span className="animate-pop-in mx-auto grid h-16 w-16 place-items-center rounded-full bg-success-50 text-success-700 ring-8 ring-success-500/20">
                <PartyPopper className="h-7 w-7" />
              </span>
              <h1 className="mt-6 text-3xl font-bold tracking-tight">
                {joined.alreadyMember ? "Welcome back" : "You're in!"}
              </h1>
              <p className="mt-3 text-base text-ink-700">
                Welcome to <span className="font-semibold">{joined.orgName}</span>.
              </p>
              {joined.alreadyMember ? (
                <p className="mt-1.5 text-sm text-ink-500">
                  You're already part of the team — your access is ready to go.
                </p>
              ) : (
                <p className="mt-1.5 text-sm text-ink-500">
                  Your account is ready as a{" "}
                  <span className="font-semibold text-ink-800">{roleLabel(joined.role)}</span>.
                </p>
              )}
              <Button
                variant="gradient"
                size="lg"
                className="mt-8 w-full sm:w-auto"
                rightIcon={<ArrowRight className="h-4 w-4" />}
                onClick={() => finish(joined.orgId)}
              >
                Continue to workspace
              </Button>
            </div>
          </div>
        </div>
      </AuthShell>
    );

  /* --------------------------------- mismatch --------------------------------- */
  if (mismatch)
    return (
      <AuthShell
        bare
        brand={{
          eyebrow: "Team invitation",
          title: "Almost there —",
          highlight: "right email, please.",
        }}
      >
        <InviteStatus
          icon={ShieldCheck}
          tone="danger"
          title="This invitation was sent to another email address."
          copy={`It was sent to ${d.email}. For your security, only that account can accept it.`}
        >
          <Button
            onClick={() => {
              setMismatch(false);
              setMode("existing");
              setExisting({ email: d.email, password: "" });
            }}
          >
            Sign in with {d.email}
          </Button>
        </InviteStatus>
      </AuthShell>
    );

  /* --------------------------------- main flow --------------------------------- */
  return (
    <AuthShell
      bare
      brand={{
        eyebrow: "Team invitation",
        title: "You're invited",
        highlight: "to join the team.",
        sub: "One secure link, one role — the invitation decides, and the server enforces it.",
      }}
    >
      <header className="mb-7">
        <p className="eyebrow">You're invited to join</p>
        <div className="mt-2.5 flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-[#4f7cff] text-white shadow-md shadow-brand-500/25">
            <Building2 className="h-5 w-5" />
          </span>
          <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight sm:text-4xl">
            {d.organization.name}
          </h1>
        </div>
      </header>

      <div className="panel mb-5 px-5">
        <div className="divide-y divide-ink-100">
          <InfoRow icon={UserPlus} label="Invited by">
            {d.invitedByName}
          </InfoRow>
          <InfoRow icon={ShieldCheck} label="Role">
            <RoleChip role={d.role} />
          </InfoRow>
          <InfoRow icon={Mail} label="Sent to">
            <span className="break-all">{d.email}</span>
          </InfoRow>
          <InfoRow icon={Hourglass} label="Expires">
            {new Date(d.expiresAt).toDateString()}
          </InfoRow>
        </div>
      </div>

      {signedInAsOther && (
        <div className="mb-5 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm leading-6 text-brand-800">
          <p className="font-semibold">
            You're signed in as {user.email}, but this invitation is for {d.email}.
          </p>
          <p>Only the invited account can accept it — sign in below with {d.email}.</p>
        </div>
      )}
      {error && <ErrorCallout error={error} />}

      <div role="group" aria-label="Join options" className="mb-5 grid grid-cols-2 rounded-xl bg-ink-100 p-1">
        <button
          type="button"
          aria-pressed={activeMode === "new"}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg p-2.5 text-sm font-semibold transition-all",
            activeMode === "new" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700",
          )}
          onClick={() => setMode("new")}
        >
          <UserPlus className="h-4 w-4" />
          Create account
        </button>
        <button
          type="button"
          aria-pressed={activeMode === "existing"}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg p-2.5 text-sm font-semibold transition-all",
            activeMode === "existing"
              ? "bg-white text-ink-900 shadow-sm"
              : "text-ink-500 hover:text-ink-700",
          )}
          onClick={() => setMode("existing")}
        >
          <LogIn className="h-4 w-4" />
          Sign in
        </button>
      </div>

      {activeMode === "new" ? (
        <form onSubmit={submitNew} className="space-y-4" noValidate>
          <Input
            label="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            minLength={2}
          />
          <PasswordField
            label="Create password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            showStrength
            hint="At least 12 characters — mix cases, numbers and symbols."
            required
            minLength={12}
          />
          <Button type="submit" variant="gradient" size="lg" fullWidth isLoading={busy}>
            Create account and join
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      ) : (
        <form onSubmit={submitExisting} className="space-y-4" noValidate>
          <Input
            label="Work email"
            type="email"
            value={signInEmail}
            onChange={(e) => setExisting((s) => ({ ...s, email: e.target.value }))}
            autoComplete="email"
            required
          />
          <PasswordField
            label="Password"
            value={existing.password}
            onChange={(e) => setExisting((s) => ({ ...s, password: e.target.value }))}
            autoComplete="current-password"
            required
          />
          <Button type="submit" variant="gradient" size="lg" fullWidth isLoading={busy}>
            Sign in and accept
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      )}

      <p className="mt-5 text-xs text-ink-400">
        This link works only for <span className="font-semibold text-ink-500">{d.email}</span> and
        expires on {new Date(d.expiresAt).toDateString()}.
      </p>
    </AuthShell>
  );
};
