# HireSmart AI — Brand System

Official brand system and assets for HireSmart AI.

## The Official Brand Identity

The official HireSmart AI identity features:
- **HireSmart Wordmark**: Bold modern geometric sans-serif lettering.
- **3D Faceted Crystal Cube**: A 3D isometric faceted blue and cyan crystal polyhedron representing intelligence, precision, and multifaceted talent matching.
- **AI Wordmark**: Clean, bold uppercase lettering pairing with the central mark.
- **Tagline**: `HIRE SMARTER • BUILD BETTER` framed with clean horizontal rules.

## Official Assets

| File                                      | Use                                                    |
| ----------------------------------------- | ------------------------------------------------------ |
| `public/assets/hiresmart-ai-logo.svg`     | Official full lockup (light tone default for dark UI)  |
| `public/assets/hiresmart-ai-logo-light.svg` | Full lockup, light tone for dark surfaces             |
| `public/assets/hiresmart-ai-logo-dark.svg`  | Full lockup, dark tone for light surfaces             |
| `public/assets/hiresmart-cube.svg`        | 3D faceted crystal cube mark (vector)                  |
| `public/logo-full.svg`                    | Root alias for dark-tone full lockup                   |
| `public/logo-full-light.svg`              | Root alias for light-tone full lockup                  |
| `public/logo-mark.svg`                    | Root alias for compact cube mark                      |

Build/regenerate assets:

```
cd client && node scripts/build-official-logo.mjs
```

## Usage in App

1. **Full logo** — Public site header (Navbar), footer, auth page headers (`Logo` component, `tone="dark"` on light / `tone="light"` on dark).
2. **Compact mark** — `LogoMark` / `CubeMark` for compact and badge locations.
3. **Sidebar / Workspace** — `AppShell` top bar and navigation branding.
