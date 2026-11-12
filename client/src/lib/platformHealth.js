// Platform health from the server's readiness check (Requirement 7). Never reports "Operational" without a
// real check result: an unreachable endpoint is "unreachable", and a service that is down is shown as down.
export const HEALTH_SERVICES = [
  { key: "mongodb", name: "Database", description: "Stores accounts, companies, jobs and applications." },
  { key: "jobStore", name: "Background jobs", description: "Runs resume parsing, recommendations, alerts and verification." },
];

/**
 * @param {{ data?: object, error?: { status?: number, data?: object } }} input
 *   `data`: the readiness body on success (HTTP 200). `error.data` on HTTP 503 carries the same checks.
 * @returns {{ overall: "operational"|"degraded"|"down"|"unreachable", services: Array<{key:string,name:string,description:string,state:"up"|"down"|"unknown"}>, queue: {queued:number|null, staleProcessing:number|null}|null }}
 */
export const healthFrom = ({ data, error } = {}) => {
  const body = data || (error && error.data) || null;
  const checks = body?.checks;
  if (!checks) {
    return {
      overall: "unreachable",
      services: HEALTH_SERVICES.map((s) => ({ ...s, state: "unknown" })),
      queue: null,
    };
  }
  const services = HEALTH_SERVICES.map((s) => ({
    ...s,
    state: checks[s.key] === "up" ? "up" : checks[s.key] === "down" ? "down" : "unknown",
  }));
  const queue = {
    queued: Number.isFinite(body.queue?.queued) ? body.queue.queued : null,
    staleProcessing: Number.isFinite(body.queue?.staleProcessing) ? body.queue.staleProcessing : null,
  };
  const anyDown = services.some((s) => s.state !== "up");
  let overall = "operational";
  if (anyDown) overall = "down";
  else if ((queue.staleProcessing || 0) > 0) overall = "degraded";
  return { overall, services, queue };
};
