import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, CheckCircle2, Eye, EyeOff, Mail, ShieldCheck, Sparkles } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { ErrorCallout } from "../../components/Product";
import { authApi, inviteApi } from "../../lib/api";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/useAuth";

const Shell = ({ title, copy, children }) => (
  <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[1.05fr_.95fr]">
    <section className="hidden bg-ink-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <Link to="/" className="flex items-center gap-2 font-bold">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500">
          <Sparkles className="h-4 w-4" />
        </span>
        HireSmart AI
      </Link>
      <div className="max-w-lg">
        <p className="eyebrow !text-cyan-300">Evidence, not guesswork</p>
        <h2 className="mt-4 text-5xl font-bold leading-[1.08]">
          Make every career and hiring decision explainable.
        </h2>
        <div className="mt-8 grid gap-3 text-sm text-ink-300">
          {[
            "Private, versioned resume processing",
            "Human-controlled AI recommendations",
            "Organization-scoped recruitment workflows",
          ].map((x) => (
            <p key={x} className="flex gap-2">
              <CheckCircle2 className="h-4 w-4 text-cyan-300" />
              {x}
            </p>
          ))}
        </div>
      </div>
      <p className="text-xs text-ink-500">AI supports decisions. It does not make them.</p>
    </section>
    <section className="flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <p className="eyebrow">HireSmart workspace</p>
        <h1 className="mt-2 text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-ink-500">{copy}</p>
        <div className="mt-7">{children}</div>
      </div>
    </section>
  </div>
);
const mapErrors = (error, setError) =>
  error?.fieldErrors?.forEach((item) => setError(item.path, { message: item.message }));
const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
export const LoginPage = () => {
  const auth = useAuth(),
    navigate = useNavigate(),
    location = useLocation(),
    [serverError, setServerError] = useState(null),
    [show, setShow] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema) });
  const submit = async (values) => {
    setServerError(null);
    try {
      const session = await auth.login(values);
      const destination =
        location.state?.from?.pathname ||
        (session.user.role === "admin"
          ? "/app/admin"
          : session.organizationId
            ? `/app/o/${session.organizationId}`
            : "/app/candidate");
      navigate(destination, { replace: true });
    } catch (e) {
      mapErrors(e, setError);
      setServerError(e);
    }
  };
  return (
    <Shell title="Welcome back" copy="Sign in to your candidate or hiring workspace.">
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        {serverError && <ErrorCallout error={serverError} />}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <div className="relative">
          <Input
            label="Password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <button
            type="button"
            className="absolute right-3 top-8 p-1 text-ink-400"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex justify-end">
          <Link className="text-sm font-semibold text-brand-600" to="/auth/forgot-password">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" fullWidth isLoading={isSubmitting}>
          Sign in <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-500">
        New here?{" "}
        <Link className="font-semibold text-brand-600" to="/auth/register/candidate">
          Create an account
        </Link>
      </p>
    </Shell>
  );
};
const registerSchema = z.object({
  displayName: z.string().min(2, "Enter your name"),
  email: z.string().email(),
  password: z.string().min(12, "Use at least 12 characters"),
  organizationName: z.string().optional(),
  terms: z.literal(true, { message: "Accept the terms to continue" }),
  aiProcessingConsent: z.boolean().optional(),
});
export const RegisterPage = () => {
  const { intent = "candidate" } = useParams(),
    auth = useAuth(),
    navigate = useNavigate(),
    [serverError, setServerError] = useState(null);
  const recruiter = intent === "recruiter";
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { terms: false, aiProcessingConsent: true },
  });
  const submit = async (v) => {
    if (recruiter && !v.organizationName) {
      setError("organizationName", { message: "Organization name is required" });
      return;
    }
    setServerError(null);
    try {
      const response = await auth.register({
        email: v.email,
        password: v.password,
        displayName: v.displayName,
        accountIntent: recruiter ? "recruiter" : "candidate",
        organizationName: recruiter ? v.organizationName : undefined,
        termsConsent: true,
        termsPolicyVersion: "2026-08",
        privacyPolicyVersion: "2026-08",
        aiProcessingConsent: v.aiProcessingConsent,
      });
      navigate(
        response.data.verificationRequired
          ? `/auth/check-email?email=${encodeURIComponent(v.email)}`
          : "/auth/login",
      );
    } catch (e) {
      mapErrors(e, setError);
      setServerError(e);
    }
  };
  return (
    <Shell
      title={recruiter ? "Create your hiring workspace" : "Build your candidate profile"}
      copy={
        recruiter
          ? "Start with an organization you own. Add teammates after verification."
          : "Your resume and AI results remain private and under your control."
      }
    >
      <div className="mb-5 grid grid-cols-2 rounded-xl bg-ink-100 p-1">
        <Link
          className={`rounded-lg p-2 text-center text-sm font-semibold ${!recruiter ? "bg-white shadow-sm" : "text-ink-500"}`}
          to="/auth/register/candidate"
        >
          Candidate
        </Link>
        <Link
          className={`rounded-lg p-2 text-center text-sm font-semibold ${recruiter ? "bg-white shadow-sm" : "text-ink-500"}`}
          to="/auth/register/recruiter"
        >
          Recruiter
        </Link>
      </div>
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        {serverError && <ErrorCallout error={serverError} />}
        <Input label="Full name" error={errors.displayName?.message} {...register("displayName")} />
        <Input
          label="Work email"
          type="email"
          error={errors.email?.message}
          {...register("email")}
        />
        {recruiter && (
          <Input
            label="Organization name"
            error={errors.organizationName?.message}
            {...register("organizationName")}
          />
        )}
        <Input
          label="Password"
          type="password"
          hint="At least 12 characters"
          error={errors.password?.message}
          {...register("password")}
        />
        <label className="flex gap-3 text-sm text-ink-600">
          <input type="checkbox" className="mt-1" {...register("terms")} />
          <span>
            I agree to the Terms and Privacy Policy.{" "}
            {errors.terms && <span className="block text-danger-700">{errors.terms.message}</span>}
          </span>
        </label>
        <label className="flex gap-3 text-sm text-ink-600">
          <input type="checkbox" className="mt-1" {...register("aiProcessingConsent")} />
          <span>
            Allow external AI processing when configured. Without this, deterministic analysis
            remains available.
          </span>
        </label>
        <Button type="submit" fullWidth isLoading={isSubmitting}>
          Create account
        </Button>
      </form>
    </Shell>
  );
};
export const CheckEmailPage = () => {
  const [params] = useSearchParams(),
    [sent, setSent] = useState(false);
  const email = params.get("email");
  return (
    <Shell
      title="Check your inbox"
      copy={`We sent a verification link${email ? ` to ${email}` : ""}.`}
    >
      <div className="panel p-6 text-center">
        <Mail className="mx-auto h-9 w-9 text-brand-600" />
        <p className="mt-4 text-sm text-ink-600">
          Open the link to activate your account, then return to sign in.
        </p>
        <Button
          className="mt-5"
          variant="secondary"
          disabled={sent}
          onClick={async () => {
            await authApi.resend(email);
            setSent(true);
          }}
        >
          {sent ? "Email sent" : "Resend verification"}
        </Button>
      </div>
    </Shell>
  );
};
export const VerifyPage = () => {
  const [params] = useSearchParams(),
    [state, setState] = useState("working"),
    [error, setError] = useState(null);
  useEffect(() => {
    authApi
      .verify(params.get("token"))
      .then(() => setState("done"))
      .catch((e) => {
        setError(e);
        setState("error");
      });
  }, [params]);
  return (
    <Shell title="Email verification" copy="Securing your HireSmart account.">
      {state === "working" && <p role="status">Verifying…</p>}
      {state === "done" && (
        <div className="panel p-6 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-success-700" />
          <p className="mt-3">Your email is verified.</p>
          <Button as={Link} to="/auth/login" className="mt-5">
            Continue to sign in
          </Button>
        </div>
      )}
      {state === "error" && <ErrorCallout error={error} />}
    </Shell>
  );
};
export const ForgotPage = () => {
  const [done, setDone] = useState(false),
    [error, setError] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm();
  return (
    <Shell title="Reset your password" copy="We will send a one-time link if the account exists.">
      {done ? (
        <div className="panel p-6 text-center">
          <Mail className="mx-auto h-8 w-8 text-brand-600" />
          <p className="mt-3">Check your inbox for the next step.</p>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={handleSubmit(async ({ email }) => {
            try {
              await authApi.forgot(email);
              setDone(true);
            } catch (e) {
              setError(e);
            }
          })}
        >
          {error && <ErrorCallout error={error} />}
          <Input label="Email" type="email" required {...register("email")} />
          <Button type="submit" fullWidth isLoading={isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </Shell>
  );
};
export const ResetPage = () => {
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    [error, setError] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm();
  return (
    <Shell title="Choose a new password" copy="This will revoke your existing sessions.">
      <form
        className="space-y-4"
        onSubmit={handleSubmit(async ({ password }) => {
          try {
            await authApi.reset({ token: params.get("token"), newPassword: password });
            navigate("/auth/login");
          } catch (e) {
            setError(e);
          }
        })}
      >
        {error && <ErrorCallout error={error} />}
        <Input
          label="New password"
          type="password"
          minLength={12}
          required
          {...register("password")}
        />
        <Button type="submit" fullWidth isLoading={isSubmitting}>
          Reset password
        </Button>
      </form>
    </Shell>
  );
};
export const AcceptInvitePage = () => {
  const [params] = useSearchParams(),
    token = params.get("token"),
    navigate = useNavigate(),
    { login } = useAuth(),
    info = useQuery({
      queryKey: ["invite", token],
      queryFn: () => inviteApi.info(token),
      enabled: Boolean(token),
    }),
    [mode, setMode] = useState(null),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [existing, setExisting] = useState({ email: "", password: "" }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const d = info.data?.data;
  const activeMode = mode || (d?.accountExists ? "existing" : "new");
  const finish = (orgId) => navigate(`/app/o/${orgId}`, { replace: true });
  const submitNew = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await inviteApi.accept(token, { name, password });
      await login({ email: d.email, password });
      finish(d.organization.id);
    } catch (err) {
      if (err?.response?.data?.code === "EMAIL_IN_USE") {
        setMode("existing");
        setExisting({ email: d.email, password: "" });
      } else setError(err);
      setBusy(false);
    }
  };
  const submitExisting = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login({ email: existing.email, password: existing.password });
      const r = await inviteApi.acceptExisting(token);
      finish(r.data.organization.id);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  if (info.isLoading)
    return (
      <Shell title="Team invitation" copy="Checking your invitation…">
        <p role="status">Loading…</p>
      </Shell>
    );
  if (!token || info.error || !d)
    return (
      <Shell title="Team invitation" copy="This invitation link could not be opened.">
        <ErrorCallout error={info.error || new Error("Missing invitation token")} />
        <p className="mt-4 text-sm text-ink-500">
          Ask the person who invited you to send a new invitation.
        </p>
      </Shell>
    );
  return (
    <Shell
      title="Join our hiring team"
      copy={`${d.invitedByName} has invited you to ${d.organization.name} as a ${d.role.replace(/_/g, " ")}. This invitation expires on ${new Date(d.expiresAt).toDateString()}.`}
    >
      {error && (
        <div className="mb-4">
          <ErrorCallout error={error} />
        </div>
      )}
      {activeMode === "new" ? (
        <form onSubmit={submitNew} className="space-y-4">
          <Input
            label="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
          <Input
            label="Create password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={12}
            hint="At least 12 characters"
          />
          <Button type="submit" fullWidth isLoading={busy}>
            Create account and join
          </Button>
        </form>
      ) : (
        <form onSubmit={submitExisting} className="space-y-4">
          <Input
            label="Work email"
            type="email"
            value={existing.email}
            onChange={(e) => setExisting((s) => ({ ...s, email: e.target.value }))}
            required
          />
          <Input
            label="Password"
            type="password"
            value={existing.password}
            onChange={(e) => setExisting((s) => ({ ...s, password: e.target.value }))}
            required
          />
          <Button type="submit" fullWidth isLoading={busy}>
            Sign in and accept
          </Button>
        </form>
      )}
      <p className="mt-5 text-xs text-ink-400">
        {activeMode === "new" ? "Already have an account? " : "New to HireSmart? "}
        <button
          type="button"
          className="font-semibold text-brand-600"
          onClick={() => setMode(activeMode === "new" ? "existing" : "new")}
        >
          {activeMode === "new" ? "Sign in instead" : "Create an account instead"}
        </button>
      </p>
    </Shell>
  );
};
