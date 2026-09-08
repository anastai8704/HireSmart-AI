import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { cn } from "../../lib/utils";
import Logo from "../../components/brand/Logo";

/**
 * Decorative brand visual: concentric orbit rings with floating nodes and a
 * small abstract "team card". Purely decorative (aria-hidden) — no product
 * data is implied by it.
 */
export const AuthBrandVisual = () => (
  <div aria-hidden="true" className="relative mx-auto h-56 w-full max-w-sm">
    <svg viewBox="0 0 400 220" fill="none" className="absolute inset-0 h-full w-full">
      <circle
        cx="200"
        cy="110"
        r="98"
        stroke="rgb(255 255 255 / 0.14)"
        strokeWidth="1"
        strokeDasharray="3 7"
      />
      <circle
        cx="200"
        cy="110"
        r="64"
        stroke="rgb(255 255 255 / 0.2)"
        strokeWidth="1"
        strokeDasharray="2 6"
      />
      <circle cx="96" cy="66" r="4" fill="#8a80ee" />
      <circle cx="312" cy="76" r="3" fill="#67e8f9" />
      <circle cx="268" cy="196" r="4" fill="#6f64e3" />
      <circle cx="72" cy="152" r="3" fill="rgb(255 255 255 / 0.5)" />
      <line x1="96" y1="66" x2="200" y2="110" stroke="rgb(255 255 255 / 0.1)" />
      <line x1="312" y1="76" x2="200" y2="110" stroke="rgb(255 255 255 / 0.1)" />
      <line x1="268" y1="196" x2="200" y2="110" stroke="rgb(255 255 255 / 0.08)" />
    </svg>
    <div className="animate-float-soft absolute left-1/2 top-1/2 w-52 -translate-x-1/2 -translate-y-1/2">
      <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-[0_16px_40px_-16px_rgb(0_0_0/0.6)] backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-[#4f7cff] text-xs font-bold text-white">
            HS
          </span>
          <div className="w-full">
            <div className="h-2 w-3/5 rounded-full bg-white/40" />
            <div className="mt-1.5 h-2 w-2/5 rounded-full bg-white/20" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="rounded-full bg-brand-500/30 px-2.5 py-1 text-[10px] font-semibold text-brand-200">
            Role
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-ink-200">
            Team
          </span>
          <span className="rounded-full bg-cyan-300/20 px-2.5 py-1 text-[10px] font-semibold text-cyan-200">
            Workspace
          </span>
        </div>
      </div>
    </div>
  </div>
);

const DEFAULT_BRAND = {
  eyebrow: "HireSmart workspace",
  title: "HireSmart AI",
  highlight: "hiring, explained.",
  sub: "A workspace where every AI decision comes with the reasoning behind it.",
  points: [
    "Explainable matching you can review line by line",
    "Your data stays inside your workspace",
    "Hiring workflows scoped to your company",
  ],
  footnote: "AI supports decisions. It does not make them.",
};

/**
 * Premium split-screen shell for every authentication surface: dark brand
 * panel with glows + abstract visual on the left, focused form on the right.
 * Collapses to a compact brand header on small screens.
 */
const AuthShell = ({
  title,
  copy,
  children,
  brand = {},
  width = "max-w-md",
  bare = false,
}) => {
  const b = { ...DEFAULT_BRAND, ...brand };
  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[1.08fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(46rem_22rem_at_50%_-10rem,rgb(111_100_227/0.35),transparent_65%),radial-gradient(36rem_18rem_at_100%_100%,rgb(79_124_255/0.18),transparent_62%),radial-gradient(rgb(255_255_255/0.05)_1px,transparent_1px)] [background-size:auto,auto,22px_22px]"
        />
        <div className="relative">
          <Link to="/" aria-label="HireSmart AI — home">
            <Logo tone="light" />
          </Link>
        </div>
        <div className="relative max-w-lg">
          <p className="eyebrow !text-cyan-300">{b.eyebrow}</p>
          <h2 className="mt-4 text-5xl font-bold leading-[1.06] tracking-tight text-white">
            {b.title}{" "}
            <span className="bg-gradient-to-r from-brand-300 to-[#8fb0ff] bg-clip-text text-transparent">
              {b.highlight}
            </span>
          </h2>
          <p className="mt-5 text-base leading-7 text-ink-300">{b.sub}</p>
          <div className="mt-10">
            <AuthBrandVisual />
          </div>
        </div>
        <div className="relative">
          <div className="grid gap-2.5 text-sm text-ink-300">
            {b.points.map((x) => (
              <p key={x} className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-300" />
                {x}
              </p>
            ))}
          </div>
          <p className="mt-8 text-xs text-ink-500">{b.footnote}</p>
        </div>
      </section>
      <section className="flex flex-col px-4 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-1 items-center justify-center">
          <div className={cn("w-full", width)}>
            <div className="mb-8 lg:hidden">
              <Link to="/" aria-label="HireSmart AI — home">
                <Logo tone="dark" />
              </Link>
            </div>
            <div className="animate-fade-up">
              {!bare && (
                <header className="mb-7">
                  <p className="eyebrow">{b.eyebrow}</p>
                  <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-[2.1rem] sm:leading-9">
                    {title}
                  </h1>
                  {copy && <p className="mt-2.5 text-sm leading-6 text-ink-500">{copy}</p>}
                </header>
              )}
              {children}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AuthShell;
