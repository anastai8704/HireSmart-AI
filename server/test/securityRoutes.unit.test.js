// Route-table regression tests (Phase 8). Read the Express router directly, so no database or network is needed.
// They fail if an endpoint is added without an authentication guard, or if /admin loses its guard.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "unit_test_only_jwt_secret_0123456789abcdef0123456789";

const test = require("node:test");
const assert = require("node:assert/strict");

const router = require("../routes/v1Routes");
const { authenticate, optionalAuthenticate, requirePlatformAdmin } = require("../middleware/v1Auth");

// Endpoints that are intentionally reachable without a session. Adding to this list needs a review.
const PUBLIC_ROUTES = new Set([
  "GET /health/live",
  "GET /health/ready",
  "POST /auth/register",
  "POST /auth/verify-email",
  "POST /auth/verification-emails",
  "POST /auth/login",
  "POST /auth/token",
  "POST /auth/password/forgot",
  "POST /auth/password/reset",
  "POST /auth/confirm-email-change",
  "GET /invitations/:token",
  "POST /invitations/:token/accept",
  "GET /avatars/:key", // capability URL: the key is a random UUID-based name
  "GET /jobs/:jobId",
  "GET /jobs/:jobId/related",
  "GET /companies",
  "GET /companies/:slug",
  "GET /companies/:slug/jobs",
  "GET /subscriptions/plans",
  "POST /payments/webhooks/razorpay", // authenticated by HMAC signature over the raw body
]);

const routeLayers = router.stack.filter((layer) => layer.route);
const describeRoute = (layer) =>
  `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`;
const handlesOf = (layer) => layer.route.stack.map((entry) => entry.handle);

test("every non-public endpoint requires an authenticated caller", () => {
  const unguarded = routeLayers
    .filter((layer) => !PUBLIC_ROUTES.has(describeRoute(layer)))
    .filter((layer) => {
      const handles = handlesOf(layer);
      return !handles.includes(authenticate) && !handles.includes(optionalAuthenticate);
    })
    .map(describeRoute);
  assert.deepEqual(unguarded, [], `endpoints missing authenticate: ${unguarded.join(", ")}`);
});

test("the public allowlist only names endpoints that exist", () => {
  const existing = new Set(routeLayers.map(describeRoute));
  const stale = [...PUBLIC_ROUTES].filter((name) => !existing.has(name));
  assert.deepEqual(stale, [], `allowlist entries with no matching route: ${stale.join(", ")}`);
});

test("every /admin endpoint is behind requirePlatformAdmin, applied at the prefix", () => {
  const adminLayers = routeLayers.filter((layer) => layer.route.path.startsWith("/admin"));
  assert.ok(adminLayers.length >= 30, `expected the admin surface, found ${adminLayers.length}`);

  const guardIndex = router.stack.findIndex(
    (layer) => !layer.route && layer.handle === requirePlatformAdmin,
  );
  assert.notEqual(guardIndex, -1, "requirePlatformAdmin must be mounted with router.use");
  const firstAdminIndex = router.stack.indexOf(adminLayers[0]);
  assert.ok(guardIndex < firstAdminIndex, "the admin guard must be registered before any /admin route");
});

test("the /admin guard is not weakened by a later route that bypasses it", () => {
  const offenders = routeLayers
    .filter((layer) => layer.route.path.startsWith("/admin"))
    .filter((layer) => !handlesOf(layer).includes(authenticate))
    .map(describeRoute);
  // Admin routes also keep the per-route authenticate call, so the prefix guard runs after it.
  assert.deepEqual(offenders, [], `admin routes without authenticate: ${offenders.join(", ")}`);
});
