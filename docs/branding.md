# HireSmart AI — Brand System

Finalized: Part 8. This is the single source of truth for the HireSmart AI
brand. If a surface and this document disagree, the document wins.

## The concept — "the Matchpoint H"

Every hire is two people and a decision that connects them. The mark is the
letter **H** with meaning:

- **The two verticals** are the two people in every hire — the candidate and
  the company — drawn as equal, rounded figures.
- **The crossbar** is the bridge between them: the offer, the match, what
  HireSmart exists to build.
- **The amber four-point spark** sits exactly at the crossing — the AI
  "match" moment, the instant skills, role and culture line up.

It is deliberately **not** a lightning bolt, a circuit, or a generic
"sparkle" icon. The spark only exists *at the intersection of the two
people*, which is the whole brand story: intelligence in the middle of a
human connection.

## The mark

| Element      | Spec                                                        |
| ------------ | ----------------------------------------------------------- |
| Canvas       | 24 × 24 brand grid                                          |
| Tile         | rounded square, corner radius 6.6 (radius 0 = full-bleed)   |
| Tile fill    | diagonal gradient `#6f64e3` (brand-500) → `#413993` (brand-800) |
| H            | white `#ffffff`; verticals 2.8 × 13.2, rounded ends; crossbar 11.2 × 2.8 |
| Spark        | amber `#f5a524`; four-point, outer radius 3.6, inner 1.45, centred on the crossbar |

Geometry lives in exactly two places (keep them in sync):

- `client/src/components/brand/Logo.jsx` — the React mark used by the whole app
- `client/scripts/generate-logo-assets.mjs` — renders the raster files
- `client/public/*.svg` — hand-authored vector copies for static contexts

## Files

| File                          | Use                                                    |
| ----------------------------- | ------------------------------------------------------ |
| `public/logo-mark.svg`        | icon mark, vector                                        |
| `public/logo-full.svg`        | full lockup, wordmark in ink (light surfaces)            |
| `public/logo-full-light.svg`  | full lockup, wordmark in white (dark surfaces)           |
| `public/favicon.svg`          | browser favicon (vector)                                 |
| `public/favicon.ico`          | browser favicon (16/32/48, PNG-compressed ICO)           |
| `public/apple-touch-icon.png` | iOS home screen (180, full-bleed)                        |
| `public/pwa-192.png` / `pwa-512.png` | PWA "any" icons                                 |
| `public/pwa-512-maskable.png` | PWA "maskable" icon (full-bleed, no corner radius)       |
| `public/site.webmanifest`     | web app manifest                                         |

Regenerate rasters (after any geometry change):

```
cd client && node scripts/generate-logo-assets.mjs
```

## Usage

1. **Full logo** — public site header (Navbar), footer, auth page headers
   (`Logo` component, `tone="dark"` on light / `tone="light"` on dark).
2. **Icon mark** — sidebar top block, notification panel header, favicons,
   app icons (`LogoMark`).
3. **Sidebar** — `AppShell` top block: mark + wordmark on the dark rail.
4. **Login / Signup** — `AuthShell`: full lockup top-left on the dark panel
   (desktop), mobile bar above the form.
5. **Email header** — drawn in pure HTML/CSS (no external images, so it
   survives blocked images): brand tile with a white "H" and the amber spark,
   plus the "HireSmart AI" wordmark. See `server/services/email/templates.js → logo()`.
6. **Browser favicon** — `favicon.svg` + `favicon.ico` (16/32/48).
7. **Mobile / PWA** — `site.webmanifest`, `apple-touch-icon.png`, PWA icons
   (192/512 any + 512 maskable), `theme-color` `#0e1222`.
8. **Notification UI** — bell dropdown header carries the mark at 20px.

## Colour

| Token         | Hex       | Notes                                  |
| ------------- | --------- | -------------------------------------- |
| brand-500     | `#6f64e3` | primary purple (gradient start)        |
| brand-600     | `#5c50d4` | primary on light surfaces, email tile  |
| brand-800     | `#413993` | gradient end                           |
| brand-300     | `#a8a3f6` | "AI" suffix on dark surfaces           |
| spark         | `#f5a524` | the amber match accent — **only** used in the mark and the email logo |
| ink-950       | `#0e1222` | dark rail / chrome, `theme-color`      |
| ink-900       | `#171c30` | wordmark in email                      |

The spark is a brand accent, not a UI status colour: it never appears in
buttons, badges or charts — status colours stay in the `success / warning /
danger` families.

## Do / don't

- Do use the mark as a whole unit; keep the spark centred on the crossbar.
- Do use the dark-variant wordmark on light surfaces and vice versa.
- Don't stretch, rotate, outline or recolour the tile or the spark.
- Don't place the mark on busy imagery; use it on white, light grey or the
  dark rail.
- Don't substitute other "AI" glyphs (lightning, brains, circuits) for the
  spark.
- Don't add shadows, glows or 3D effects to the mark.
- Minimum sizes: mark 20px in UI, 16px favicon; lockup height 24px.
