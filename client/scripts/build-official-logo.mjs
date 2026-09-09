import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicAssets = join(root, "public", "assets");
const publicRoot = join(root, "public");

// 1. Full Logo with Tagline (viewBox 0 0 540 140)
function createFullLogoSvg(tone = "light") {
  const isLight = tone === "light";
  const textColor = isLight ? "#ffffff" : "#0f172a";
  const taglineColor = isLight ? "#94a3b8" : "#64748b";
  const lineColor = isLight ? "rgba(255, 255, 255, 0.25)" : "rgba(15, 23, 42, 0.25)";

  const cx = 384;
  const cy = 54;
  const r = 34;
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 140" width="540" height="140" role="img" aria-label="HireSmart AI — Hire Smarter • Build Better">
  <defs>
    <linearGradient id="hs-full-facet-cyan-top-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#bae6fd" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <linearGradient id="hs-full-facet-cyan-mid-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="hs-full-facet-cyan-glow-${tone}" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#67e8f9" />
      <stop offset="100%" stop-color="#0ea5e9" />
    </linearGradient>
    <linearGradient id="hs-full-facet-blue-left-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0ea5e9" />
      <stop offset="100%" stop-color="#0369a1" />
    </linearGradient>
    <linearGradient id="hs-full-facet-blue-deep-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#0c4a6e" />
    </linearGradient>
    <linearGradient id="hs-full-facet-blue-right-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#1e40af" />
    </linearGradient>
    <linearGradient id="hs-full-facet-blue-dark-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1d4ed8" />
      <stop offset="100%" stop-color="#172554" />
    </linearGradient>
  </defs>

  <g id="hiresmart-logo-content">
    <!-- HireSmart wordmark -->
    <text x="32" y="76" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="64" font-weight="800" letter-spacing="-1.8" fill="${textColor}">HireSmart</text>

    <!-- 3D Geometric Faceted Cube -->
    <g id="faceted-cube">
      <!-- Top Section -->
      <polygon points="${pTop} ${midTopLeft} ${midCenterTop}" fill="url(#hs-full-facet-cyan-top-${tone})" />
      <polygon points="${pTop} ${midTopRight} ${midCenterTop}" fill="url(#hs-full-facet-cyan-mid-${tone})" />
      <polygon points="${midTopLeft} ${pTopLeft} ${pCenter} ${midCenterTop}" fill="url(#hs-full-facet-cyan-glow-${tone})" />
      <polygon points="${midTopRight} ${pTopRight} ${pCenter} ${midCenterTop}" fill="url(#hs-full-facet-cyan-top-${tone})" />

      <!-- Left Section -->
      <polygon points="${pTopLeft} ${midLeft} ${pCenter}" fill="url(#hs-full-facet-cyan-mid-${tone})" />
      <polygon points="${midLeft} ${pBottomLeft} ${midCenterLeft} ${pCenter}" fill="url(#hs-full-facet-blue-left-${tone})" />
      <polygon points="${pBottomLeft} ${midBottomLeft} ${pCenter}" fill="url(#hs-full-facet-blue-deep-${tone})" />
      <polygon points="${midBottomLeft} ${pBottom} ${pCenter}" fill="url(#hs-full-facet-blue-left-${tone})" />

      <!-- Right Section -->
      <polygon points="${pTopRight} ${midRight} ${pCenter}" fill="url(#hs-full-facet-blue-right-${tone})" />
      <polygon points="${midRight} ${pBottomRight} ${midCenterRight} ${pCenter}" fill="url(#hs-full-facet-blue-right-${tone})" />
      <polygon points="${pBottomRight} ${midBottomRight} ${pCenter}" fill="url(#hs-full-facet-blue-dark-${tone})" />
      <polygon points="${midBottomRight} ${pBottom} ${pCenter}" fill="url(#hs-full-facet-blue-right-${tone})" />

      <!-- High-gloss Highlights -->
      <polygon points="${midCenterTop} ${pCenter} ${midTopLeft}" fill="#ffffff" opacity="0.45" />
      <polygon points="${midCenterTop} ${pCenter} ${midTopRight}" fill="#bae6fd" opacity="0.3" />

      <!-- Crisp Structural Facet Edges -->
      <line x1="${cx}" y1="${(cy - r).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="1.2" stroke-opacity="0.5" />
      <line x1="${(cx - h).toFixed(2)}" y1="${(cy - r / 2).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.35" />
      <line x1="${(cx + h).toFixed(2)}" y1="${(cy - r / 2).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.35" />
      <line x1="${cx}" y1="${(cy + r).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.35" />
    </g>

    <!-- AI wordmark -->
    <text x="430" y="76" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="64" font-weight="800" letter-spacing="-1.8" fill="${textColor}">AI</text>

    <!-- Tagline: HIRE SMARTER • BUILD BETTER -->
    <line x1="34" y1="112" x2="88" y2="112" stroke="${lineColor}" stroke-width="1.5" stroke-linecap="round" />
    <text x="100" y="116" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" letter-spacing="4.5" fill="${taglineColor}">HIRE SMARTER  •  BUILD BETTER</text>
    <line x1="452" y1="112" x2="506" y2="112" stroke="${lineColor}" stroke-width="1.5" stroke-linecap="round" />
  </g>
</svg>`;
}

// 2. Navbar / Header Clean Logo Lockup (viewBox 0 0 516 96 — without tagline, large & clear)
function createNavbarLogoSvg(tone = "light") {
  const isLight = tone === "light";
  const textColor = isLight ? "#ffffff" : "#0f172a";

  const cx = 378;
  const cy = 48;
  const r = 36;
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 516 96" width="516" height="96" role="img" aria-label="HireSmart AI">
  <defs>
    <linearGradient id="hs-nav-facet-cyan-top-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#bae6fd" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <linearGradient id="hs-nav-facet-cyan-mid-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="hs-nav-facet-cyan-glow-${tone}" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#67e8f9" />
      <stop offset="100%" stop-color="#0ea5e9" />
    </linearGradient>
    <linearGradient id="hs-nav-facet-blue-left-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0ea5e9" />
      <stop offset="100%" stop-color="#0369a1" />
    </linearGradient>
    <linearGradient id="hs-nav-facet-blue-deep-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#0c4a6e" />
    </linearGradient>
    <linearGradient id="hs-nav-facet-blue-right-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#1e40af" />
    </linearGradient>
    <linearGradient id="hs-nav-facet-blue-dark-${tone}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1d4ed8" />
      <stop offset="100%" stop-color="#172554" />
    </linearGradient>
  </defs>

  <g id="hiresmart-nav-logo">
    <!-- HireSmart wordmark -->
    <text x="24" y="71" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="68" font-weight="800" letter-spacing="-1.8" fill="${textColor}">HireSmart</text>

    <!-- 3D Geometric Faceted Cube -->
    <g id="faceted-cube">
      <!-- Top Section -->
      <polygon points="${pTop} ${midTopLeft} ${midCenterTop}" fill="url(#hs-nav-facet-cyan-top-${tone})" />
      <polygon points="${pTop} ${midTopRight} ${midCenterTop}" fill="url(#hs-nav-facet-cyan-mid-${tone})" />
      <polygon points="${midTopLeft} ${pTopLeft} ${pCenter} ${midCenterTop}" fill="url(#hs-nav-facet-cyan-glow-${tone})" />
      <polygon points="${midTopRight} ${pTopRight} ${pCenter} ${midCenterTop}" fill="url(#hs-nav-facet-cyan-top-${tone})" />

      <!-- Left Section -->
      <polygon points="${pTopLeft} ${midLeft} ${pCenter}" fill="url(#hs-nav-facet-cyan-mid-${tone})" />
      <polygon points="${midLeft} ${pBottomLeft} ${midCenterLeft} ${pCenter}" fill="url(#hs-nav-facet-blue-left-${tone})" />
      <polygon points="${pBottomLeft} ${midBottomLeft} ${pCenter}" fill="url(#hs-nav-facet-blue-deep-${tone})" />
      <polygon points="${midBottomLeft} ${pBottom} ${pCenter}" fill="url(#hs-nav-facet-blue-left-${tone})" />

      <!-- Right Section -->
      <polygon points="${pTopRight} ${midRight} ${pCenter}" fill="url(#hs-nav-facet-blue-right-${tone})" />
      <polygon points="${midRight} ${pBottomRight} ${midCenterRight} ${pCenter}" fill="url(#hs-nav-facet-blue-right-${tone})" />
      <polygon points="${pBottomRight} ${midBottomRight} ${pCenter}" fill="url(#hs-nav-facet-blue-dark-${tone})" />
      <polygon points="${midBottomRight} ${pBottom} ${pCenter}" fill="url(#hs-nav-facet-blue-right-${tone})" />

      <!-- High-gloss Highlights -->
      <polygon points="${midCenterTop} ${pCenter} ${midTopLeft}" fill="#ffffff" opacity="0.45" />
      <polygon points="${midCenterTop} ${pCenter} ${midTopRight}" fill="#bae6fd" opacity="0.3" />

      <!-- Crisp Structural Facet Edges -->
      <line x1="${cx}" y1="${(cy - r).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="1.2" stroke-opacity="0.5" />
      <line x1="${(cx - h).toFixed(2)}" y1="${(cy - r / 2).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.35" />
      <line x1="${(cx + h).toFixed(2)}" y1="${(cy - r / 2).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.35" />
      <line x1="${cx}" y1="${(cy + r).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.35" />
    </g>

    <!-- AI wordmark -->
    <text x="428" y="71" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="68" font-weight="800" letter-spacing="-1.8" fill="${textColor}">AI</text>
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
    <!-- Top Section -->
    <polygon points="${pTop} ${midTopLeft} ${midCenterTop}" fill="url(#hs-cube-top)" />
    <polygon points="${pTop} ${midTopRight} ${midCenterTop}" fill="url(#hs-cube-mid)" />
    <polygon points="${midTopLeft} ${pTopLeft} ${pCenter} ${midCenterTop}" fill="url(#hs-cube-glow)" />
    <polygon points="${midTopRight} ${pTopRight} ${pCenter} ${midCenterTop}" fill="url(#hs-cube-top)" />

    <!-- Left Section -->
    <polygon points="${pTopLeft} ${midLeft} ${pCenter}" fill="url(#hs-cube-mid)" />
    <polygon points="${midLeft} ${pBottomLeft} ${midCenterLeft} ${pCenter}" fill="url(#hs-cube-blue-left)" />
    <polygon points="${pBottomLeft} ${midBottomLeft} ${pCenter}" fill="url(#hs-cube-blue-deep)" />
    <polygon points="${midBottomLeft} ${pBottom} ${pCenter}" fill="url(#hs-cube-blue-left)" />

    <!-- Right Section -->
    <polygon points="${pTopRight} ${midRight} ${pCenter}" fill="url(#hs-cube-blue-right)" />
    <polygon points="${midRight} ${pBottomRight} ${midCenterRight} ${pCenter}" fill="url(#hs-cube-blue-right)" />
    <polygon points="${pBottomRight} ${midBottomRight} ${pCenter}" fill="url(#hs-cube-blue-dark)" />
    <polygon points="${midBottomRight} ${pBottom} ${pCenter}" fill="url(#hs-cube-blue-right)" />

    <!-- Highlights -->
    <polygon points="${midCenterTop} ${pCenter} ${midTopLeft}" fill="#ffffff" opacity="0.45" />
    <polygon points="${midCenterTop} ${pCenter} ${midTopRight}" fill="#bae6fd" opacity="0.3" />

    <!-- Facet Edges -->
    <line x1="${cx}" y1="${(cy - r).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="1.2" stroke-opacity="0.5" />
    <line x1="${(cx - h).toFixed(2)}" y1="${(cy - r / 2).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.35" />
    <line x1="${(cx + h).toFixed(2)}" y1="${(cy - r / 2).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.35" />
    <line x1="${cx}" y1="${(cy + r).toFixed(2)}" x2="${cx}" y2="${cy.toFixed(2)}" stroke="#ffffff" stroke-width="0.9" stroke-opacity="0.35" />
  </g>
</svg>`;
}

// Write Navbar specific SVGs (clean wordmark + cube, no tagline)
writeFileSync(join(publicAssets, "hiresmart-logo-nav-light.svg"), createNavbarLogoSvg("light"));
writeFileSync(join(publicAssets, "hiresmart-logo-nav-dark.svg"), createNavbarLogoSvg("dark"));

// Write Full Logo SVGs (with tagline)
writeFileSync(join(publicAssets, "hiresmart-ai-logo-light.svg"), createFullLogoSvg("light"));
writeFileSync(join(publicAssets, "hiresmart-ai-logo-dark.svg"), createFullLogoSvg("dark"));
writeFileSync(join(publicAssets, "hiresmart-ai-logo.svg"), createNavbarLogoSvg("light"));

// Write Cube Mark SVGs
writeFileSync(join(publicAssets, "hiresmart-cube.svg"), createCubeMarkSvg());

// Root aliases
writeFileSync(join(publicRoot, "logo-full-light.svg"), createNavbarLogoSvg("light"));
writeFileSync(join(publicRoot, "logo-full.svg"), createNavbarLogoSvg("dark"));
writeFileSync(join(publicRoot, "logo-mark.svg"), createCubeMarkSvg());

console.log("Brand assets regenerated with dedicated navbar lockups!");
