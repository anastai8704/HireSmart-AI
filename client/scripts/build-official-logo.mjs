import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicAssets = join(root, "public", "assets");
const publicRoot = join(root, "public");

// 1. Full Logo with Tagline (viewBox 0 0 300 80 — tight, balanced spacing around diamond)
function createFullLogoSvg(tone = "light") {
  const isLight = tone === "light";
  const textColor = isLight ? "#ffffff" : "#0f172a";
  const taglineColor = isLight ? "#94a3b8" : "#64748b";
  const lineColor = isLight ? "rgba(255, 255, 255, 0.25)" : "rgba(15, 23, 42, 0.25)";

  const cx = 195;
  const cy = 25;
  const r = 16.5;
  const h = r * Math.sqrt(3) / 2;

  const pTop = `${cx},${(cy - r).toFixed(2)}`;
  const pTopRight = `${(cx + h).toFixed(2)},${(cy - r / 2).toFixed(2)}`;
  const pBottomRight = `${(cx + h).toFixed(2)},${(cy + r / 2).toFixed(2)}`;
  const pBottom = `${cx},${(cy + r).toFixed(2)}`;
  const pBottomLeft = `${(cx - h).toFixed(2)},${(cy + r / 2).toFixed(2)}`;
  const pTopLeft = `${(cx - h).toFixed(2)},${(cy - r / 2).toFixed(2)}`;
  const pCenter = `${cx},${cy.toFixed(2)}`;

  const midTopLeft = `${(cx - h * 0.5).toFixed(2)},${(cy - r * 0.75).toFixed(2)}`;
  const midTopRight = `${(cx + h * 0.5).toFixed(2)},${(cy - r * 0.75).toFixed(2)}`;
  const midLeft = `${(cx - h).toFixed(2)},${cy.toFixed(2)}`;
  const midRight = `${(cx + h).toFixed(2)},${cy.toFixed(2)}`;
  const midBottomLeft = `${(cx - h * 0.5).toFixed(2)},${(cy + r * 0.75).toFixed(2)}`;
  const midBottomRight = `${(cx + h * 0.5).toFixed(2)},${(cy + r * 0.75).toFixed(2)}`;
  const midCenterLeft = `${(cx - h * 0.5).toFixed(2)},${(cy + r * 0.25).toFixed(2)}`;
  const midCenterRight = `${(cx + h * 0.5).toFixed(2)},${(cy + r * 0.25).toFixed(2)}`;
  const midCenterTop = `${cx},${(cy - r * 0.5).toFixed(2)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80" width="300" height="80" role="img" aria-label="HireSmart AI — Hire Smarter • Build Better">
  <defs>
    <linearGradient id="hs-full-cyan-top-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#bae6fd" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <linearGradient id="hs-full-cyan-mid-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="hs-full-cyan-glow-${tone}" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#67e8f9" />
      <stop offset="100%" stop-color="#0ea5e9" />
    </linearGradient>
    <linearGradient id="hs-full-blue-left-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0ea5e9" />
      <stop offset="100%" stop-color="#0369a1" />
    </linearGradient>
    <linearGradient id="hs-full-blue-deep-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#0c4a6e" />
    </linearGradient>
    <linearGradient id="hs-full-blue-right-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#1e40af" />
    </linearGradient>
    <linearGradient id="hs-full-blue-dark-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1d4ed8" />
      <stop offset="100%" stop-color="#172554" />
    </linearGradient>
  </defs>

  <g id="hiresmart-brand-artwork">
    <!-- HireSmart wordmark -->
    <text x="14" y="36" font-family="Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="800" letter-spacing="-0.6" fill="${textColor}">HireSmart</text>

    <!-- 3D Geometric Faceted Diamond/Cube (tight, close, balanced integration) -->
    <g id="diamond-cube">
      <polygon points="${pTop} ${midTopLeft} ${midCenterTop}" fill="url(#hs-full-cyan-top-${tone})" />
      <polygon points="${pTop} ${midTopRight} ${midCenterTop}" fill="url(#hs-full-cyan-mid-${tone})" />
      <polygon points="${midTopLeft} ${pTopLeft} ${pCenter} ${midCenterTop}" fill="url(#hs-full-cyan-glow-${tone})" />
      <polygon points="${midTopRight} ${pTopRight} ${pCenter} ${midCenterTop}" fill="url(#hs-full-cyan-top-${tone})" />
      <polygon points="${pTopLeft} ${midLeft} ${pCenter}" fill="url(#hs-full-cyan-mid-${tone})" />
      <polygon points="${midLeft} ${pBottomLeft} ${midCenterLeft} ${pCenter}" fill="url(#hs-full-blue-left-${tone})" />
      <polygon points="${pBottomLeft} ${midBottomLeft} ${pCenter}" fill="url(#hs-full-blue-deep-${tone})" />
      <polygon points="${midBottomLeft} ${pBottom} ${pCenter}" fill="url(#hs-full-blue-left-${tone})" />
      <polygon points="${pTopRight} ${midRight} ${pCenter}" fill="url(#hs-full-blue-right-${tone})" />
      <polygon points="${midRight} ${pBottomRight} ${midCenterRight} ${pCenter}" fill="url(#hs-full-blue-right-${tone})" />
      <polygon points="${pBottomRight} ${midBottomRight} ${pCenter}" fill="url(#hs-full-blue-dark-${tone})" />
      <polygon points="${midBottomRight} ${pBottom} ${pCenter}" fill="url(#hs-full-blue-right-${tone})" />
      <polygon points="${midCenterTop} ${pCenter} ${midTopLeft}" fill="#ffffff" opacity="0.45" />
      <polygon points="${midCenterTop} ${pCenter} ${midTopRight}" fill="#bae6fd" opacity="0.3" />
      <line x1="${cx}" y1="${(cy - r).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.5" />
      <line x1="${(cx - h).toFixed(2)}" y1="${(cy - r / 2).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.7" stroke-opacity="0.35" />
      <line x1="${(cx + h).toFixed(2)}" y1="${(cy - r / 2).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.7" stroke-opacity="0.35" />
      <line x1="${cx}" y1="${(cy + r).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.7" stroke-opacity="0.35" />
    </g>

    <!-- AI wordmark -->
    <text x="214" y="36" font-family="Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="800" letter-spacing="-0.6" fill="${textColor}">AI</text>

    <!-- Tagline: HIRE SMARTER • BUILD BETTER -->
    <line x1="14" y1="60" x2="58" y2="60" stroke="${lineColor}" stroke-width="1.2" stroke-linecap="round" />
    <text x="66" y="63" font-family="Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="600" letter-spacing="2.4" fill="${taglineColor}">HIRE SMARTER  •  BUILD BETTER</text>
    <line x1="242" y1="60" x2="286" y2="60" stroke="${lineColor}" stroke-width="1.2" stroke-linecap="round" />
  </g>
</svg>`;
}

// 2. Navbar / Header Clean Logo Lockup (viewBox 0 0 256 52 — single unified wordmark, reduced space around diamond)
function createNavbarLogoSvg(tone = "light") {
  const isLight = tone === "light";
  const textColor = isLight ? "#ffffff" : "#0f172a";

  const cx = 195;
  const cy = 26;
  const r = 16.5;
  const h = r * Math.sqrt(3) / 2;

  const pTop = `${cx},${(cy - r).toFixed(2)}`;
  const pTopRight = `${(cx + h).toFixed(2)},${(cy - r / 2).toFixed(2)}`;
  const pBottomRight = `${(cx + h).toFixed(2)},${(cy + r / 2).toFixed(2)}`;
  const pBottom = `${cx},${(cy + r).toFixed(2)}`;
  const pBottomLeft = `${(cx - h).toFixed(2)},${(cy + r / 2).toFixed(2)}`;
  const pTopLeft = `${(cx - h).toFixed(2)},${(cy - r / 2).toFixed(2)}`;
  const pCenter = `${cx},${cy.toFixed(2)}`;

  const midTopLeft = `${(cx - h * 0.5).toFixed(2)},${(cy - r * 0.75).toFixed(2)}`;
  const midTopRight = `${(cx + h * 0.5).toFixed(2)},${(cy - r * 0.75).toFixed(2)}`;
  const midLeft = `${(cx - h).toFixed(2)},${cy.toFixed(2)}`;
  const midRight = `${(cx + h).toFixed(2)},${cy.toFixed(2)}`;
  const midBottomLeft = `${(cx - h * 0.5).toFixed(2)},${(cy + r * 0.75).toFixed(2)}`;
  const midBottomRight = `${(cx + h * 0.5).toFixed(2)},${(cy + r * 0.75).toFixed(2)}`;
  const midCenterLeft = `${(cx - h * 0.5).toFixed(2)},${(cy + r * 0.25).toFixed(2)}`;
  const midCenterRight = `${(cx + h * 0.5).toFixed(2)},${(cy + r * 0.25).toFixed(2)}`;
  const midCenterTop = `${cx},${(cy - r * 0.5).toFixed(2)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 52" width="256" height="52" role="img" aria-label="HireSmart AI">
  <defs>
    <linearGradient id="hs-nav-cyan-top-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#bae6fd" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <linearGradient id="hs-nav-cyan-mid-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="hs-nav-cyan-glow-${tone}" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#67e8f9" />
      <stop offset="100%" stop-color="#0ea5e9" />
    </linearGradient>
    <linearGradient id="hs-nav-blue-left-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0ea5e9" />
      <stop offset="100%" stop-color="#0369a1" />
    </linearGradient>
    <linearGradient id="hs-nav-blue-deep-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#0c4a6e" />
    </linearGradient>
    <linearGradient id="hs-nav-blue-right-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#1e40af" />
    </linearGradient>
    <linearGradient id="hs-nav-blue-dark-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1d4ed8" />
      <stop offset="100%" stop-color="#172554" />
    </linearGradient>
  </defs>

  <g id="hiresmart-brand-artwork">
    <!-- HireSmart wordmark -->
    <text x="10" y="37" font-family="Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="35" font-weight="800" letter-spacing="-0.6" fill="${textColor}">HireSmart</text>

    <!-- 3D Geometric Faceted Diamond/Cube (tight, reduced spacing, no overlap) -->
    <g id="diamond-cube">
      <polygon points="${pTop} ${midTopLeft} ${midCenterTop}" fill="url(#hs-nav-cyan-top-${tone})" />
      <polygon points="${pTop} ${midTopRight} ${midCenterTop}" fill="url(#hs-nav-cyan-mid-${tone})" />
      <polygon points="${midTopLeft} ${pTopLeft} ${pCenter} ${midCenterTop}" fill="url(#hs-nav-cyan-glow-${tone})" />
      <polygon points="${midTopRight} ${pTopRight} ${pCenter} ${midCenterTop}" fill="url(#hs-nav-cyan-top-${tone})" />
      <polygon points="${pTopLeft} ${midLeft} ${pCenter}" fill="url(#hs-nav-cyan-mid-${tone})" />
      <polygon points="${midLeft} ${pBottomLeft} ${midCenterLeft} ${pCenter}" fill="url(#hs-nav-blue-left-${tone})" />
      <polygon points="${pBottomLeft} ${midBottomLeft} ${pCenter}" fill="url(#hs-nav-blue-deep-${tone})" />
      <polygon points="${midBottomLeft} ${pBottom} ${pCenter}" fill="url(#hs-nav-blue-left-${tone})" />
      <polygon points="${pTopRight} ${midRight} ${pCenter}" fill="url(#hs-nav-blue-right-${tone})" />
      <polygon points="${midRight} ${pBottomRight} ${midCenterRight} ${pCenter}" fill="url(#hs-nav-blue-right-${tone})" />
      <polygon points="${pBottomRight} ${midBottomRight} ${pCenter}" fill="url(#hs-nav-blue-dark-${tone})" />
      <polygon points="${midBottomRight} ${pBottom} ${pCenter}" fill="url(#hs-nav-blue-right-${tone})" />
      <polygon points="${midCenterTop} ${pCenter} ${midTopLeft}" fill="#ffffff" opacity="0.45" />
      <polygon points="${midCenterTop} ${pCenter} ${midTopRight}" fill="#bae6fd" opacity="0.3" />
      <line x1="${cx}" y1="${(cy - r).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.5" />
      <line x1="${(cx - h).toFixed(2)}" y1="${(cy - r / 2).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.7" stroke-opacity="0.35" />
      <line x1="${(cx + h).toFixed(2)}" y1="${(cy - r / 2).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.7" stroke-opacity="0.35" />
      <line x1="${cx}" y1="${(cy + r).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.7" stroke-opacity="0.35" />
    </g>

    <!-- AI wordmark (tight spacing, right next to diamond) -->
    <text x="212" y="37" font-family="Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="35" font-weight="800" letter-spacing="-0.6" fill="${textColor}">AI</text>
  </g>
</svg>`;
}

// 3. Compact cube logo mark SVG (viewBox 0 0 100 100)
function createCubeMarkSvg() {
  const cx = 50;
  const cy = 50;
  const r = 44;
  const h = r * Math.sqrt(3) / 2;

  const pTop = `${cx},${(cy - r).toFixed(2)}`;
  const pTopRight = `${(cx + h).toFixed(2)},${(cy - r / 2).toFixed(2)}`;
  const pBottomRight = `${(cx + h).toFixed(2)},${(cy + r / 2).toFixed(2)}`;
  const pBottom = `${cx},${(cy + r).toFixed(2)}`;
  const pBottomLeft = `${(cx - h).toFixed(2)},${(cy + r / 2).toFixed(2)}`;
  const pTopLeft = `${(cx - h).toFixed(2)},${(cy - r / 2).toFixed(2)}`;
  const pCenter = `${cx},${cy.toFixed(2)}`;

  const midTopLeft = `${(cx - h * 0.5).toFixed(2)},${(cy - r * 0.75).toFixed(2)}`;
  const midTopRight = `${(cx + h * 0.5).toFixed(2)},${(cy - r * 0.75).toFixed(2)}`;
  const midLeft = `${(cx - h).toFixed(2)},${cy.toFixed(2)}`;
  const midRight = `${(cx + h).toFixed(2)},${cy.toFixed(2)}`;
  const midBottomLeft = `${(cx - h * 0.5).toFixed(2)},${(cy + r * 0.75).toFixed(2)}`;
  const midBottomRight = `${(cx + h * 0.5).toFixed(2)},${(cy + r * 0.75).toFixed(2)}`;
  const midCenterLeft = `${(cx - h * 0.5).toFixed(2)},${(cy + r * 0.25).toFixed(2)}`;
  const midCenterRight = `${(cx + h * 0.5).toFixed(2)},${(cy + r * 0.25).toFixed(2)}`;
  const midCenterTop = `${cx},${(cy - r * 0.5).toFixed(2)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-label="HireSmart AI Mark">
  <defs>
    <linearGradient id="hs-cube-top" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#bae6fd" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <linearGradient id="hs-cube-mid" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="hs-cube-glow" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#67e8f9" />
      <stop offset="100%" stop-color="#0ea5e9" />
    </linearGradient>
    <linearGradient id="hs-cube-blue-left" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0ea5e9" />
      <stop offset="100%" stop-color="#0369a1" />
    </linearGradient>
    <linearGradient id="hs-cube-blue-deep" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#0c4a6e" />
    </linearGradient>
    <linearGradient id="hs-cube-blue-right" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#1e40af" />
    </linearGradient>
    <linearGradient id="hs-cube-blue-dark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1d4ed8" />
      <stop offset="100%" stop-color="#172554" />
    </linearGradient>
  </defs>

  <g id="faceted-cube-mark">
    <polygon points="${pTop} ${midTopLeft} ${midCenterTop}" fill="url(#hs-cube-top)" />
    <polygon points="${pTop} ${midTopRight} ${midCenterTop}" fill="url(#hs-cube-mid)" />
    <polygon points="${midTopLeft} ${pTopLeft} ${pCenter} ${midCenterTop}" fill="url(#hs-cube-glow)" />
    <polygon points="${midTopRight} ${pTopRight} ${pCenter} ${midCenterTop}" fill="url(#hs-cube-top)" />
    <polygon points="${pTopLeft} ${midLeft} ${pCenter}" fill="url(#hs-cube-mid)" />
    <polygon points="${midLeft} ${pBottomLeft} ${midCenterLeft} ${pCenter}" fill="url(#hs-cube-blue-left)" />
    <polygon points="${pBottomLeft} ${midBottomLeft} ${pCenter}" fill="url(#hs-cube-blue-deep)" />
    <polygon points="${midBottomLeft} ${pBottom} ${pCenter}" fill="url(#hs-cube-blue-left)" />
    <polygon points="${pTopRight} ${midRight} ${pCenter}" fill="url(#hs-cube-blue-right)" />
    <polygon points="${midRight} ${pBottomRight} ${midCenterRight} ${pCenter}" fill="url(#hs-cube-blue-right)" />
    <polygon points="${pBottomRight} ${midBottomRight} ${pCenter}" fill="url(#hs-cube-blue-dark)" />
    <polygon points="${midBottomRight} ${pBottom} ${pCenter}" fill="url(#hs-cube-blue-right)" />
    <polygon points="${midCenterTop} ${pCenter} ${midTopLeft}" fill="#ffffff" opacity="0.45" />
    <polygon points="${midCenterTop} ${pCenter} ${midTopRight}" fill="#bae6fd" opacity="0.3" />
    <line x1="${cx}" y1="${(cy - r).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="1.2" stroke-opacity="0.5" />
    <line x1="${(cx - h).toFixed(2)}" y1="${(cy - r / 2).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.35" />
    <line x1="${(cx + h).toFixed(2)}" y1="${(cy - r / 2).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.35" />
    <line x1="${cx}" y1="${(cy + r).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.35" />
  </g>
</svg>`;
}

// 4. Favicon SVG (32x32 rounded dark tile with 3D faceted crystal cube mark)
function createFaviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="HireSmart AI">
  <defs>
    <linearGradient id="hs-fav-top" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#bae6fd" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <linearGradient id="hs-fav-mid" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="hs-fav-glow" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#67e8f9" />
      <stop offset="100%" stop-color="#0ea5e9" />
    </linearGradient>
    <linearGradient id="hs-fav-blue-left" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0ea5e9" />
      <stop offset="100%" stop-color="#0369a1" />
    </linearGradient>
    <linearGradient id="hs-fav-blue-deep" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#0c4a6e" />
    </linearGradient>
    <linearGradient id="hs-fav-blue-right" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#1e40af" />
    </linearGradient>
    <linearGradient id="hs-fav-blue-dark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1d4ed8" />
      <stop offset="100%" stop-color="#172554" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="8" fill="#0b0f19" />
  <g transform="translate(16,16) scale(0.24) translate(-50,-50)">
    <polygon points="50,6.00 28.10,17.00 50,28.00" fill="url(#hs-fav-top)" />
    <polygon points="50,6.00 71.90,17.00 50,28.00" fill="url(#hs-fav-mid)" />
    <polygon points="28.10,17.00 11.89,28.00 50,50.00 50,28.00" fill="url(#hs-fav-glow)" />
    <polygon points="71.90,17.00 88.11,28.00 50,50.00 50,28.00" fill="url(#hs-fav-top)" />
    <polygon points="11.89,28.00 11.89,50.00 50,50.00" fill="url(#hs-fav-mid)" />
    <polygon points="11.89,50.00 11.89,72.00 28.10,61.00 50,50.00" fill="url(#hs-fav-blue-left)" />
    <polygon points="11.89,72.00 28.10,83.00 50,50.00" fill="url(#hs-fav-blue-deep)" />
    <polygon points="28.10,83.00 50,94.00 50,50.00" fill="url(#hs-fav-blue-left)" />
    <polygon points="88.11,28.00 88.11,50.00 50,50.00" fill="url(#hs-fav-blue-right)" />
    <polygon points="88.11,50.00 88.11,72.00 71.90,61.00 50,50.00" fill="url(#hs-fav-blue-right)" />
    <polygon points="88.11,72.00 71.90,83.00 50,50.00" fill="url(#hs-fav-blue-dark)" />
    <polygon points="71.90,83.00 50,94.00 50,50.00" fill="url(#hs-fav-blue-right)" />
    <polygon points="50,28.00 50,50.00 28.10,17.00" fill="#ffffff" opacity="0.45" />
    <polygon points="50,28.00 50,50.00 71.90,17.00" fill="#bae6fd" opacity="0.3" />
    <line x1="50" y1="6.00" x2="50" y2="50.00" stroke="#ffffff" stroke-width="1.2" stroke-opacity="0.5" />
    <line x1="11.89" y1="28.00" x2="50" y2="50.00" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.35" />
    <line x1="88.11" y1="28.00" x2="50" y2="50.00" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.35" />
    <line x1="50" y1="94.00" x2="50" y2="50.00" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.35" />
  </g>
</svg>`;
}

// 1. Write Navbar specific SVGs (clean wordmark + diamond, reduced spacing around diamond, transparent bg)
writeFileSync(join(publicAssets, "hiresmart-logo-nav-light.svg"), createNavbarLogoSvg("light"));
writeFileSync(join(publicAssets, "hiresmart-logo-nav-dark.svg"), createNavbarLogoSvg("dark"));

// 2. Write Full Logo SVGs (with tagline, reduced spacing around diamond, transparent bg)
writeFileSync(join(publicAssets, "hiresmart-ai-logo-light.svg"), createFullLogoSvg("light"));
writeFileSync(join(publicAssets, "hiresmart-ai-logo-dark.svg"), createFullLogoSvg("dark"));
writeFileSync(join(publicAssets, "hiresmart-ai-logo.svg"), createNavbarLogoSvg("light"));

// 3. Write Cube Mark SVGs
writeFileSync(join(publicAssets, "hiresmart-cube.svg"), createCubeMarkSvg());

// 4. Root aliases
writeFileSync(join(publicRoot, "logo-full-light.svg"), createNavbarLogoSvg("light"));
writeFileSync(join(publicRoot, "logo-full.svg"), createNavbarLogoSvg("dark"));
writeFileSync(join(publicRoot, "logo-mark.svg"), createCubeMarkSvg());
writeFileSync(join(publicRoot, "favicon.svg"), createFaviconSvg());

console.log("Brand assets regenerated with reduced spacing around the diamond!");