// Integration point for an official company-registry or trusted verification provider (Phase 2).
//
// Honesty rule: this module never invents a registry answer. Without a configured provider every
// lookup returns { status: "unavailable" }, and the case shows "Manual verification required".
//
// Configuration (optional): COMPANY_REGISTRY_URL points at a provider endpoint that accepts POST
// JSON { registrationNumber, gstin, legalName, country } and returns
// { status: "found" | "not_found", legalName?: string }. No provider is bundled or assumed.

const TIMEOUT_MS = 8000;

let injectedProvider = null;

/** Test hook: replaces the provider. Pass null to restore the default behaviour. */
const setRegistryProvider = (provider) => {
  injectedProvider = provider;
};

const unavailable = (reason) => ({ status: "unavailable", reason });

const callConfiguredProvider = async (query) => {
  const url = process.env.COMPANY_REGISTRY_URL;
  if (!url) return unavailable("No company registry integration is configured");
  if (!/^https:\/\//i.test(url)) return unavailable("The configured registry URL must use HTTPS");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(query),
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) return unavailable("The registry did not answer successfully");
    const body = await response.json();
    if (body?.status === "found" && typeof body.legalName === "string") {
      return { status: "found", legalName: body.legalName.slice(0, 200) };
    }
    if (body?.status === "not_found") return { status: "not_found" };
    return unavailable("The registry answer could not be understood");
  } catch (error) {
    return unavailable(
      error?.name === "AbortError" ? "The registry timed out" : "The registry could not be reached",
    );
  } finally {
    clearTimeout(timer);
  }
};

/**
 * @param {{ registrationNumber?: string, gstin?: string, legalName: string, country?: string }} query
 * @returns {Promise<{status: "found"|"not_found"|"unavailable", legalName?: string, reason?: string}>}
 */
const lookupRegistry = async (query) => {
  if (injectedProvider) return injectedProvider(query);
  return callConfiguredProvider(query);
};

module.exports = { lookupRegistry, setRegistryProvider };
