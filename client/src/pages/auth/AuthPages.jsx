import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import PasswordField from "../../components/ui/PasswordField";
import { ErrorCallout } from "../../components/Product";
import { authApi } from "../../lib/api";
import { useAuth } from "../../context/useAuth";
import { usePageMeta } from "../../lib/usePageMeta";
import AuthShell from "./AuthShell";

const mapErrors = (error, setError) =>
  error?.fieldErrors?.forEach((item) => setError(item.path, { message: item.message }));

/* ---------------------------------- login ---------------------------------- */
const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export const LoginPage = () => {
  const auth = useAuth(),
    navigate = useNavigate(),
    location = useLocation(),
    [serverError, setServerError] = useState(null);
  usePageMeta({ title: "Sign in — HireSmart AI", description: "Sign in to your HireSmart workspace." });
  const {
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema) });
  const password = watch("password") || "";
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
    <AuthShell
      title="Welcome back"
      copy="Sign in to your candidate or hiring workspace."
      brand={{
        eyebrow: "HireSmart workspace",
        title: "The workspace where hiring is",
        highlight: "explainable.",
        sub: "Sign in to your jobs, candidates and AI insights — every recommendation shows its reasoning.",
      }}
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        {serverError && <ErrorCallout error={serverError} />}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={errors.email?.message}
          {...register("email")}
        />
        <PasswordField
          label="Password"
          value={password}
          onChange={(e) => setValue("password", e.target.value, { shouldValidate: false })}
          autoComplete="current-password"
          error={errors.password?.message}
        />
        <div className="flex justify-end">
          <Link className="text-sm font-semibold text-brand-600 hover:text-brand-700" to="/auth/forgot-password">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" variant="gradient" size="lg" fullWidth isLoading={isSubmitting}>
          Sign in
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-500">
        New here?{" "}
        <Link className="font-semibold text-brand-600 hover:text-brand-700" to="/auth/register/candidate">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
};

/* --------------------------------- register -------------------------------- */
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
  usePageMeta({
    title: recruiter ? "Create a recruiter account — HireSmart AI" : "Create a candidate account — HireSmart AI",
  });
  const brand = recruiter
    ? {
        eyebrow: "Get started",
        title: "Your company, your hiring",
        highlight: "co-pilot.",
        sub: "Create a workspace for your team, post jobs, and see why every candidate matched.",
      }
    : {
        eyebrow: "Get started",
        title: "Your career, with an",
        highlight: "explainable edge.",
        sub: "Build a private profile and get matching you can actually understand.",
      };
  const {
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { terms: false, aiProcessingConsent: true },
  });
  const password = watch("password") || "";
  const submit = async (v) => {
    if (recruiter && !v.organizationName) {
      setError("organizationName", { message: "Company name is required" });
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
    <AuthShell
      width="max-w-lg"
      title={recruiter ? "Create your hiring workspace" : "Build your candidate profile"}
      copy={
        recruiter
          ? "Start with the company you own. Invite teammates after verification."
          : "Your resume and AI results stay private and under your control."
      }
      brand={brand}
    >
      <div className="mb-6 grid grid-cols-2 rounded-xl bg-ink-100 p-1" aria-label="Account type">
        <Link
          className={`rounded-lg p-2.5 text-center text-sm font-semibold transition-all ${!recruiter ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"}`}
          to="/auth/register/candidate"
        >
          Candidate
        </Link>
        <Link
          className={`rounded-lg p-2.5 text-center text-sm font-semibold transition-all ${recruiter ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"}`}
          to="/auth/register/recruiter"
        >
          Recruiter
        </Link>
      </div>
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        {serverError && <ErrorCallout error={serverError} />}
        <Input label="Full name" autoComplete="name" placeholder="Full name" error={errors.displayName?.message} {...register("displayName")} />
        <Input
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={errors.email?.message}
          {...register("email")}
        />
        {recruiter && (
          <Input
            label="Company name"
            placeholder="Company name"
            error={errors.organizationName?.message}
            {...register("organizationName")}
          />
        )}
        <PasswordField
          label="Password"
          value={password}
          onChange={(e) => setValue("password", e.target.value, { shouldValidate: false })}
          autoComplete="new-password"
          showStrength
          hint="At least 12 characters — mix cases, numbers and symbols."
          error={errors.password?.message}
        />
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-ink-600">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 rounded accent-brand-600"
            {...register("terms")}
          />
          <span>
            I agree to the Terms and Privacy Policy.
            {errors.terms && <span className="mt-0.5 block text-xs font-medium text-danger-700">{errors.terms.message}</span>}
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-ink-600">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 rounded accent-brand-600"
            {...register("aiProcessingConsent")}
          />
          <span>
            Allow AI to help with resume analysis and job matching. Without this, built-in
            rule-based analysis remains available.
          </span>
        </label>
        <Button type="submit" variant="gradient" size="lg" fullWidth isLoading={isSubmitting}>
          Create account
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </AuthShell>
  );
};

/* ------------------------------- check email ------------------------------- */
export const CheckEmailPage = () => {
  const [params] = useSearchParams(),
    [sent, setSent] = useState(false),
    [resendError, setResendError] = useState(null);
  usePageMeta({ title: "Check your inbox — HireSmart AI" });
  const email = params.get("email");
  return (
    <AuthShell
      title="Check your inbox"
      copy={`We sent a verification link${email ? ` to ${email}` : ""}.`}
      brand={{
        eyebrow: "Almost there",
        title: "One click",
        highlight: "from verified.",
        sub: "Confirm your email and your workspace is ready.",
      }}
    >
      <div className="panel p-8 text-center">
        <span className="animate-pop-in mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600 ring-8 ring-brand-500/10">
          <Mail className="h-6 w-6" />
        </span>
        <p className="mt-5 text-sm leading-6 text-ink-600">
          Open the link to activate your account, then return to sign in.
        </p>
        {resendError && <p className="mt-3 text-xs font-medium text-danger-700">{resendError.message}</p>}
        <Button
          className="mt-6"
          variant="secondary"
          disabled={sent}
          onClick={async () => {
            try {
              await authApi.resend(email);
              setSent(true);
            } catch (e) {
              setResendError(e);
            }
          }}
        >
          {sent ? "Email sent" : "Resend verification"}
        </Button>
      </div>
    </AuthShell>
  );
};

/* ---------------------------------- verify --------------------------------- */
export const VerifyPage = () => {
  const [params] = useSearchParams(),
    [state, setState] = useState("working"),
    [error, setError] = useState(null);
  usePageMeta({ title: "Verifying your email — HireSmart AI" });
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
    <AuthShell
      title="Email verification"
      copy="Securing your HireSmart account."
      brand={{ eyebrow: "Security", title: "Verified", highlight: "means trusted." }}
    >
      {state === "working" && <p role="status" className="text-sm text-ink-500">Verifying…</p>}
      {state === "done" && (
        <div className="panel p-8 text-center">
          <span className="animate-pop-in mx-auto grid h-14 w-14 place-items-center rounded-full bg-success-50 text-success-700 ring-8 ring-success-500/15">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <p className="mt-5 font-semibold">Your email is verified.</p>
          <Button as={Link} to="/auth/login" variant="gradient" className="mt-6">
            Continue to sign in
          </Button>
        </div>
      )}
      {state === "error" && <ErrorCallout error={error} />}
    </AuthShell>
  );
};

/* ------------------------------- change email ------------------------------- */
export const ChangeEmailPage = () => {
  const [params] = useSearchParams(),
    [state, setState] = useState("working"),
    [error, setError] = useState(null);
  usePageMeta({ title: "Confirming your email change — HireSmart AI" });
  useEffect(() => {
    authApi
      .confirmEmailChange(params.get("token"))
      .then(() => setState("done"))
      .catch((e) => {
        setError(e);
        setState("error");
      });
  }, [params]);
  return (
    <AuthShell
      title="Email change"
      copy="Confirming your new HireSmart email address."
      brand={{ eyebrow: "Security", title: "Keep your", highlight: "account current." }}
    >
      {state === "working" && <p role="status" className="text-sm text-ink-500">Confirming…</p>}
      {state === "done" && (
        <div className="panel p-8 text-center">
          <span className="animate-pop-in mx-auto grid h-14 w-14 place-items-center rounded-full bg-success-50 text-success-700 ring-8 ring-success-500/15">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <p className="mt-5 font-semibold">Your email address has been updated.</p>
          <p className="mt-1.5 text-sm leading-6 text-ink-500">
            We sent a verification link to your new address — sign in and verify it.
          </p>
          <Button as={Link} to="/auth/login" variant="gradient" className="mt-6">
            Continue to sign in
          </Button>
        </div>
      )}
      {state === "error" && <ErrorCallout error={error} />}
    </AuthShell>
  );
};

/* ---------------------------------- forgot --------------------------------- */
export const ForgotPage = () => {
  const [done, setDone] = useState(null),
    [error, setError] = useState(null);
  usePageMeta({ title: "Reset your password — HireSmart AI" });
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm();
  return (
    <AuthShell
      title={done ? "Check your inbox" : "Reset your password"}
      copy={
        done
          ? `If an account exists for ${done}, a reset link is on its way.`
          : "Enter the email on your account and we'll send you a one-time reset link."
      }
      brand={{
        eyebrow: "Account recovery",
        title: "Locked out?",
        highlight: "No problem.",
        sub: "We'll email you a secure one-time link to choose a new password.",
      }}
    >
      {done ? (
        <div className="panel p-8 text-center">
          <span className="animate-pop-in mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600 ring-8 ring-brand-500/10">
            <Mail className="h-6 w-6" />
          </span>
          <p className="mt-5 text-sm leading-6 text-ink-600">
            Open the link, pick a new password, and you're back in. Links expire after a short
            window — request a new one if yours has lapsed.
          </p>
          <Button as={Link} to="/auth/login" variant="gradient" className="mt-6">
            Back to sign in
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={handleSubmit(async ({ email }) => {
            try {
              await authApi.forgot(email);
              setDone(email);
            } catch (e) {
              setError(e);
            }
          })}
        >
          {error && <ErrorCallout error={error} />}
          <Input label="Email" type="email" autoComplete="email" placeholder="you@company.com" required {...register("email")} />
          <Button type="submit" variant="gradient" size="lg" fullWidth isLoading={isSubmitting}>
            Send reset link
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      )}
    </AuthShell>
  );
};

/* ---------------------------------- reset ---------------------------------- */
export const ResetPage = () => {
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    [rootError, setRootError] = useState(null),
    [done, setDone] = useState(false);
  usePageMeta({ title: "Choose a new password — HireSmart AI" });
  const {
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm();
  const password = watch("password") || "";
  return (
    <AuthShell
      title={done ? "Password updated" : "Choose a new password"}
      copy={
        done
          ? "Your sessions have been refreshed and only you can sign in now."
          : "Pick something strong — it revokes your existing sessions."
      }
      brand={{
        eyebrow: "Account recovery",
        title: "Fresh start,",
        highlight: "same account.",
        sub: "Choose a strong password and get back to work.",
      }}
    >
      {done ? (
        <div className="panel p-8 text-center">
          <span className="animate-pop-in mx-auto grid h-14 w-14 place-items-center rounded-full bg-success-50 text-success-700 ring-8 ring-success-500/15">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <p className="mt-5 font-semibold">You're all set.</p>
          <p className="mt-1.5 text-sm leading-6 text-ink-500">
            Sign in with your new password to continue.
          </p>
          <Button
            variant="gradient"
            className="mt-6"
            onClick={() => navigate("/auth/login")}
          >
            Continue to sign in
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={handleSubmit(async ({ password, confirm }) => {
            setRootError(null);
            if (password !== confirm) {
              setError("confirm", { type: "mismatch", message: "Passwords do not match" });
              return;
            }
            try {
              await authApi.reset({ token: params.get("token"), newPassword: password });
              setDone(true);
            } catch (e) {
              setRootError(e);
            }
          })}
        >
          {rootError && <ErrorCallout error={rootError} />}
          <PasswordField
            label="New password"
            value={password}
            onChange={(e) => setValue("password", e.target.value, { shouldValidate: false })}
            autoComplete="new-password"
            showStrength
            hint="At least 12 characters — mix cases, numbers and symbols."
            required
            minLength={12}
          />
          <PasswordField
            label="Confirm new password"
            value={watch("confirm") || ""}
            onChange={(e) => setValue("confirm", e.target.value, { shouldValidate: false })}
            autoComplete="new-password"
            error={errors.confirm?.message}
            required
            minLength={12}
          />
          <Button type="submit" variant="gradient" size="lg" fullWidth isLoading={isSubmitting}>
            Reset password
          </Button>
        </form>
      )}
    </AuthShell>
  );
};
