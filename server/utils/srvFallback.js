/**
 * Resilience helpers for `mongodb+srv://` connection strings.
 *
 * An SRV URI requires a DNS SRV lookup on port 53. Some networks (corporate
 * firewalls, restricted VMs, cloud sandboxes) refuse or drop those queries,
 * which makes the driver crash before it ever talks to the database:
 *
 *   querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net
 *
 * When that happens, config/db.js re-resolves the cluster over
 * DNS-over-HTTPS (plain HTTPS, which those networks almost always allow)
 * and connects to the resolved shard hosts directly. When normal DNS works,
 * none of this code runs at all.
 */
const dns = require("node:dns");

const SRV_URI_PATTERN =
  /^mongodb\+srv:\/\/(?:(?<auth>[^@/?#]+)@)?(?<srvHost>[^/?#]+)(?:\/(?<db>[^?#]*))?(?:\?(?<query>[^#]*))?$/;

const DNS_TYPES = { A: 1, SRV: 5 };

const DEFAULT_DOH_BASE_URLS = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
];

// HIRESMART_DOH_BASE_URLS overrides the provider list (comma-separated base
// URLs of any dns-json endpoint). Mostly a test/eval seam, but also useful on
// networks where the usual DoH domains are blocked while their IP-based
// equivalents are not (e.g. "https://8.8.8.8/resolve,https://1.1.1.1/dns-query").
const DOH_BASE_URLS = process.env.HIRESMART_DOH_BASE_URLS
  ? process.env.HIRESMART_DOH_BASE_URLS.split(",")
      .map((url) => url.trim())
      .filter(Boolean)
  : DEFAULT_DOH_BASE_URLS;

const DOH_PROVIDERS = DOH_BASE_URLS.map((base) => ({
  name: base.replace(/^https?:\/\//, ""),
  url: (name, type) => `${base}?name=${encodeURIComponent(name)}&type=${type}`,
}));

const isSrvUri = (uri) => typeof uri === "string" && uri.startsWith("mongodb+srv://");

/**
 * Splits a mongodb+srv URI into its parts. Returns null for anything that is
 * not a mongodb+srv URI. Credentials, database name and query string are kept
 * verbatim (still percent-encoded) so nothing changes meaning when the direct
 * URI is reassembled.
 */
const parseSrvUri = (uri) => {
  if (!isSrvUri(uri)) return null;

  const match = SRV_URI_PATTERN.exec(uri);
  if (!match) return null;

  return {
    auth: match.groups.auth,
    srvHost: match.groups.srvHost,
    db: match.groups.db || "",
    query: match.groups.query || "",
  };
};

/**
 * Converts dns-json SRV answer strings ("0 0 27017 host") into a unique list
 * of { target, port } records ordered by priority, then weight.
 */
const parseSrvRecords = (dataStrings) => {
  const seen = new Map();

  for (const data of dataStrings) {
    const parts = String(data).trim().split(/\s+/);
    const [priority, weight, port] = parts;
    const target = parts.slice(3).join(" ");

    if (!priority || !port || !target) continue;

    const key = `${priority}:${weight}:${target}`;
    if (!seen.has(key)) {
      seen.set(key, {
        priority: Number(priority),
        weight: Number(weight),
        port: Number(port),
        target,
      });
    }
  }

  return [...seen.values()]
    .sort((a, b) => a.priority - b.priority || a.weight - b.weight)
    .map((record) => ({ port: record.port, target: record.target }));
};

/**
 * Rebuilds a direct (non-SRV) URI from the parsed SRV URI and the resolved
 * shard records. mongodb+srv implies TLS, so tls=true is appended unless the
 * user already configured a TLS option explicitly.
 */
const buildDirectSrvUri = (parsed, records) => {
  if (!parsed || !records || records.length === 0) return null;

  const params = new URLSearchParams(parsed.query || "");
  const hasTlsOption =
    params.has("tls") || params.has("tlsInsecure") || params.has("tlsAllowInvalidCertificates");

  if (!hasTlsOption) params.set("tls", "true");

  const auth = parsed.auth ? `${parsed.auth}@` : "";
  const db = parsed.db ? `/${parsed.db}` : "";
  const hosts = records.map((record) => `${record.target}:${record.port}`).join(",");
  const query = params.toString();

  return `mongodb://${auth}${hosts}${db}${query ? `?${query}` : ""}`;
};

/**
 * Resolves a name with DNS-over-HTTPS (dns-json), trying each provider in
 * turn. Returns the list of answer `data` strings for the requested type.
 */
const resolveOverDoh = async (name, type) => {
  let lastError;

  for (const provider of DOH_PROVIDERS) {
    try {
      const response = await fetch(provider.url(name, type), {
        headers: { accept: "application/dns-json" },
      });

      if (!response.ok) throw new Error(`${provider.name} returned HTTP ${response.status}`);

      const body = await response.json();
      if (body.Status !== 0) throw new Error(`${provider.name} returned DNS status ${body.Status}`);

      const answers = (body.Answer || []).filter((record) => record.type === DNS_TYPES[type]);
      if (answers.length === 0) throw new Error(`${provider.name} returned no ${type} records`);

      return answers.map((record) => record.Data);
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError ? lastError.message : "no DNS-over-HTTPS providers configured";
  throw new Error(`DNS-over-HTTPS lookup for ${name} (${type}) failed: ${message}`);
};

/** Resolves the shard hosts of an SRV record over DNS-over-HTTPS. */
const resolveSrvRecordsOverDoh = async (srvHost) =>
  parseSrvRecords(await resolveOverDoh(`_mongodb._tcp.${srvHost}`, "SRV"));

/** Resolves the A records of the given hostnames over DNS-over-HTTPS. */
const resolveHostAddressesOverDoh = async (hostnames) => {
  const addresses = new Map();

  for (const hostname of hostnames) {
    const data = await resolveOverDoh(hostname, "A");
    addresses.set(
      hostname,
      data.map((address) => ({ address, family: 4 })),
    );
  }

  return addresses;
};

/**
 * Temporarily answers `dns.lookup` (callback and promise flavours) for the
 * given hostnames with the provided addresses. Used when the local resolver
 * is blocked for the shard hostnames as well, so the driver can still reach
 * the shards while TLS certificate verification keeps using the real names.
 *
 * Returns a function that restores the original resolvers.
 */
const installLookupOverrides = (addressByHost) => {
  const originalLookup = dns.lookup;
  const originalPromiseLookup = dns.promises.lookup;

  const answer = (hostname, options = {}) => {
    const entries = addressByHost.get(hostname) || [];

    if (entries.length === 0) {
      const error = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
      error.code = "ENOTFOUND";
      return { error };
    }

    if (options.all) return { all: entries };

    const family = options.family === 4 || options.family === 6 ? options.family : 4;
    const chosen = entries.find((entry) => entry.family === family) || entries[0];
    return { address: chosen.address, family: chosen.family };
  };

  dns.lookup = (hostname, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }

    if (!addressByHost.has(hostname)) return originalLookup(hostname, options, callback);

    const result = answer(hostname, options);
    if (result.error) return callback(result.error);
    if (result.all) return callback(null, result.all);
    return callback(null, result.address, result.family);
  };

  dns.promises.lookup = (hostname, options = {}) =>
    new Promise((resolve, reject) => {
      if (!addressByHost.has(hostname)) {
        return originalPromiseLookup(hostname, options).then(resolve, reject);
      }

      const result = answer(hostname, options);
      if (result.error) return reject(result.error);
      resolve(result.all ? result.all : { address: result.address, family: result.family });
    });

  return () => {
    dns.lookup = originalLookup;
    dns.promises.lookup = originalPromiseLookup;
  };
};

module.exports = {
  DOH_PROVIDERS,
  isSrvUri,
  parseSrvUri,
  parseSrvRecords,
  buildDirectSrvUri,
  resolveOverDoh,
  resolveSrvRecordsOverDoh,
  resolveHostAddressesOverDoh,
  installLookupOverrides,
};
