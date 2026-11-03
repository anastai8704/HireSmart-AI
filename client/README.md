# HireSmart AI frontend

Production React/Vite client for the versioned `/api/v1` backend.

## Commands

```bash
npm ci
npm run dev
npm run lint
npm run test
npm run build
```

The browser uses relative `/api/v1` requests. Vite proxies `/api` to the local Express service; Nginx does the same in the production container.

Authentication uses an in-memory access token plus backend-managed rotating refresh and CSRF cookies. No API key or refresh token belongs in frontend environment variables or browser storage.

## Architecture

- `src/lib/apiClient.js`: secure session/refresh transport
- `src/lib/api.js`: v1 endpoint modules
- `src/context/AuthContext.jsx`: identity and organization membership state
- `src/components/`: accessible design system and product components
- `src/pages/auth`: registration, verification and recovery
- `src/pages/candidate`: resume, job, application, interview and copilot workflows
- `src/pages/recruiter`: organization recruiting and hiring-manager workflows
- `src/pages/SystemPages.jsx`: notifications, settings and platform admin

See `../docs/backend-api.md` and `../docs/FRONTEND_IMPLEMENTATION_PLAN.md`.
