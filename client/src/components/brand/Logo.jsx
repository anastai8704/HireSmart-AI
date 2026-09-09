/**
 * HireSmart AI brand system.
 *
 * Concept — "the Matchpoint H":
 *   · the two verticals of the H are the two people in every hire:
 *     the candidate and the company
 *   · the crossbar is the bridge between them — what HireSmart builds
 *   · the cyan four-point spark at the crossing is the AI "match"
 *     moment: the instant skills, role and culture line up
 *
 * This component is the single source of truth for the mark in the app so
 * every surface (sidebar, auth, notifications, public site) stays
 * pixel-identical. Static files in /public (favicon, PWA, email) use the
 * same 24x24 geometry — see docs/branding.md and
 * scripts/generate-logo-assets.mjs.
 */

const TILE_GRADIENT_ID = "hs-logo-tile";

export const LogoMark = ({ className = "h-6 w-6", title = "HireSmart AI" }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    role={title ? "img" : undefined}
    aria-label={title || undefined}
    aria-hidden={title ? undefined : "true"}
    focusable="false"
  >
    <defs>
      <linearGradient
        id={TILE_GRADIENT_ID}
        x1="0"
        y1="0"
        x2="24"
        y2="24"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="#6f64e3" />
        <stop offset="1" stopColor="#413993" />
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="6.6" fill={`url(#${TILE_GRADIENT_ID})`} />
    <g fill="#ffffff">
      <rect x="6.4" y="5.4" width="2.8" height="13.2" rx="1.4" />
      <rect x="14.8" y="5.4" width="2.8" height="13.2" rx="1.4" />
      <rect x="6.4" y="10.6" width="11.2" height="2.8" />
    </g>
    <path
      d="M12 8.4 L13.03 10.97 L15.6 12 L13.03 13.03 L12 15.6 L10.97 13.03 L8.4 12 L10.97 10.97 Z"
      fill="#67e8f9"
    />
  </svg>
);

/**
 * Full lockup: official brand logo asset.
 * tone="dark"  — brand asset on light surfaces (/logo-full.svg)
 * tone="light" — brand asset on dark surfaces (/logo-full-light.svg)
 */
export const Logo = ({
  tone = "dark",
  className = "h-8 w-auto",
  alt = "HireSmart AI",
  showWordmark = true,
  markClassName,
}) => {
  if (!showWordmark) {
    return <LogoMark className={markClassName || className} title={alt} />;
  }

  const src = tone === "light" ? "/logo-full-light.svg" : "/logo-full.svg";

  return (
    <img
      src={src}
      alt={alt}
      className={`h-8 w-auto max-w-full object-contain ${className || ""}`}
      height={24}
      width={124}
      loading="eager"
      decoding="async"
    />
  );
};

export default Logo;
