/**
 * HireSmart AI brand system.
 *
 * Official brand logo asset implementation:
 * - Full logo: HireSmart + 3D faceted blue cube + AI + tagline ("HIRE SMARTER • BUILD BETTER")
 * - Navbar logo (default): Clean "HireSmart AI" wordmark + 3D faceted blue cube (no tagline/underline), scaled for crisp navbar readability
 * - Light tone (/assets/hiresmart-logo-nav-light.svg): for dark surfaces
 * - Dark tone (/assets/hiresmart-logo-nav-dark.svg): for light surfaces
 * - Compact mark (/assets/hiresmart-cube.svg): 3D faceted crystal cube
 */

import { cn } from "../../lib/utils";

/**
 * 3D Faceted Isometric Cube Brand Mark
 */
export const CubeMark = ({ className = "h-6 w-6", title = "HireSmart AI" }) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    role={title ? "img" : undefined}
    aria-label={title || undefined}
    aria-hidden={title ? undefined : "true"}
    focusable="false"
  >
    <defs>
      <linearGradient id="hs-cube-top-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#bae6fd" />
        <stop offset="100%" stopColor="#38bdf8" />
      </linearGradient>
      <linearGradient id="hs-cube-mid-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#0284c7" />
      </linearGradient>
      <linearGradient id="hs-cube-glow-grad" x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#67e8f9" />
        <stop offset="100%" stopColor="#0ea5e9" />
      </linearGradient>
      <linearGradient id="hs-cube-blue-left-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#0369a1" />
      </linearGradient>
      <linearGradient id="hs-cube-blue-deep-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0284c7" />
        <stop offset="100%" stopColor="#0c4a6e" />
      </linearGradient>
      <linearGradient id="hs-cube-blue-right-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#2563eb" />
        <stop offset="100%" stopColor="#1e40af" />
      </linearGradient>
      <linearGradient id="hs-cube-blue-dark-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#1d4ed8" />
        <stop offset="100%" stopColor="#172554" />
      </linearGradient>
    </defs>

    <g id="faceted-cube-mark">
      {/* Top Section */}
      <polygon points="50,6.00 28.10,17.00 50,28.00" fill="url(#hs-cube-top-grad)" />
      <polygon points="50,6.00 71.90,17.00 50,28.00" fill="url(#hs-cube-mid-grad)" />
      <polygon points="28.10,17.00 11.89,28.00 50,50.00 50,28.00" fill="url(#hs-cube-glow-grad)" />
      <polygon points="71.90,17.00 88.11,28.00 50,50.00 50,28.00" fill="url(#hs-cube-top-grad)" />

      {/* Left Section */}
      <polygon points="11.89,28.00 11.89,50.00 50,50.00" fill="url(#hs-cube-mid-grad)" />
      <polygon points="11.89,50.00 11.89,72.00 28.10,61.00 50,50.00" fill="url(#hs-cube-blue-left-grad)" />
      <polygon points="11.89,72.00 28.10,83.00 50,50.00" fill="url(#hs-cube-blue-deep-grad)" />
      <polygon points="28.10,83.00 50,94.00 50,50.00" fill="url(#hs-cube-blue-left-grad)" />

      {/* Right Section */}
      <polygon points="88.11,28.00 88.11,50.00 50,50.00" fill="url(#hs-cube-blue-right-grad)" />
      <polygon points="88.11,50.00 88.11,72.00 71.90,61.00 50,50.00" fill="url(#hs-cube-blue-right-grad)" />
      <polygon points="88.11,72.00 71.90,83.00 50,50.00" fill="url(#hs-cube-blue-dark-grad)" />
      <polygon points="71.90,83.00 50,94.00 50,50.00" fill="url(#hs-cube-blue-right-grad)" />

      {/* Highlights */}
      <polygon points="50,28.00 50,50.00 28.10,17.00" fill="#ffffff" opacity="0.45" />
      <polygon points="50,28.00 50,50.00 71.90,17.00" fill="#bae6fd" opacity="0.3" />

      {/* Structural Facet Edges */}
      <line x1="50" y1="6.00" x2="50" y2="50.00" stroke="#ffffff" strokeWidth="1.2" strokeOpacity="0.5" />
      <line x1="11.89" y1="28.00" x2="50" y2="50.00" stroke="#ffffff" strokeWidth="0.9" strokeOpacity="0.35" />
      <line x1="88.11" y1="28.00" x2="50" y2="50.00" stroke="#ffffff" strokeWidth="0.9" strokeOpacity="0.35" />
      <line x1="50" y1="94.00" x2="50" y2="50.00" stroke="#ffffff" strokeWidth="0.9" strokeOpacity="0.35" />
    </g>
  </svg>
);

export const LogoMark = CubeMark;

/**
 * Official brand logo lockup asset.
 * tone="dark"  — brand asset on light surfaces (/assets/hiresmart-logo-nav-dark.svg)
 * tone="light" — brand asset on dark surfaces (/assets/hiresmart-logo-nav-light.svg)
 * variant="navbar" (default) — clean "HireSmart AI" wordmark + 3D faceted cube (no tagline/underline)
 * variant="full" — complete lockup including tagline and rules
 */
export const Logo = ({
  tone = "dark",
  variant = "navbar",
  className,
  alt = "HireSmart AI",
  showWordmark = true,
  markClassName,
}) => {
  if (!showWordmark) {
    return <LogoMark className={markClassName || className} title={alt} />;
  }

  const isLight = tone === "light";
  const src =
    variant === "full"
      ? isLight
        ? "/assets/hiresmart-ai-logo-light.svg"
        : "/assets/hiresmart-ai-logo-dark.svg"
      : isLight
        ? "/assets/hiresmart-logo-nav-light.svg"
        : "/assets/hiresmart-logo-nav-dark.svg";

  return (
    <img
      src={src}
      alt={alt}
      className={cn("h-9.5 w-auto max-w-full object-contain", className)}
      height={38}
      width={204}
      loading="eager"
      decoding="async"
    />
  );
};

export default Logo;
