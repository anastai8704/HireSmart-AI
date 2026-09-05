const dns = require("node:dns");
const mongoose = require("mongoose");
const { config } = require("./env");
const logger = require("../utils/logger");
const {
  isSrvUri,
  parseSrvUri,
  buildDirectSrvUri,
  resolveSrvRecordsOverDoh,
  resolveHostAddressesOverDoh,
  installLookupOverrides,
} = require("../utils/srvFallback");

const connectionOptions = {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  autoIndex: !config.isProduction,
};

const PUBLIC_DNS_SERVERS = ["1.1.1.1", "8.8.8.8"];
// Exposed (and mutable) so tests / diagnostics can skip the public-resolver
// retry and go straight to the DNS-over-HTTPS fallback.
let publicResolversApplied = false;

const firstMeaningfulMessage = (error) =>
  [error?.message, error?.reason?.message, error?.cause?.message].find(
    (value) => typeof value === "string" && value.length > 0,
  ) || String(error || "unknown error");

/**
 * True when a `mongodb+srv://` connection failed at the DNS layer - the SRV
 * lookup was refused, timed out or the host is unknown - which is exactly
 * the situation the fallbacks below can repair. Ordinary TCP/TLS failures
 * are left untouched so their original error is reported.
 */
const isSrvDnsFailure = (uri, error) => {
  if (!isSrvUri(uri) || !error) return false;

  const message = [error.message, error.reason?.message, error.cause?.message]
    .filter((value) => typeof value === "string")
    .join(" | ");

  return (
    /querySrv|queryA|getaddrinfo|EAI_AGAIN|ENOTFOUND/i.test(message) || error.errno === "EAI_AGAIN"
  );
};

/**
 * Connects to MongoDB, repairing DNS-layer failures for `mongodb+srv://`
 * URIs (e.g. "querySrv ECONNREFUSED" on networks that block DNS port 53):
 *
 *   1. Normal connection attempt (unchanged behaviour when everything works).
 *   2. Retry once with public resolvers - a misconfigured local resolver is
 *      common, and 1.1.1.1 / 8.8.8.8 are almost always reachable.
 *   3. DNS-over-HTTPS: re-resolve the SRV record (Cloudflare, then Google)
 *      over plain HTTPS and connect to the shard hosts directly. The real
 *      hostnames are kept, so TLS certificate verification still works.
 *
 * Returns "direct" or "doh" describing which path succeeded.
 */
const connectWithRetryPolicy = async (uri) => {
  try {
    await mongoose.connect(uri, connectionOptions);
    return "direct";
  } catch (error) {
    if (!isSrvDnsFailure(uri, error)) throw error;

    if (!publicResolversApplied) {
      publicResolversApplied = true;
      dns.setServers(PUBLIC_DNS_SERVERS);
      logger.warn(
        `MongoDB SRV lookup failed (${firstMeaningfulMessage(error)}). ` +
          `Retrying with public DNS resolvers (${PUBLIC_DNS_SERVERS.join(", ")}).`,
      );

      try {
        await mongoose.connect(uri, connectionOptions);
        return "direct";
      } catch (retryError) {
        if (!isSrvDnsFailure(uri, retryError)) throw error;
      }
    }

    logger.warn(
      "MongoDB SRV lookup is still failing. Falling back to DNS-over-HTTPS resolution...",
    );

    try {
      const parsed = parseSrvUri(uri);
      const records = await resolveSrvRecordsOverDoh(parsed.srvHost);
      const directUri = buildDirectSrvUri(parsed, records);

      if (!directUri) throw new Error(`Could not build a direct URI from ${parsed.srvHost}`);

      // If the local resolver is blocked for the shard hostnames as
      // well, answer their A records from the DNS-over-HTTPS results
      // while we connect. The override is removed as soon as this
      // attempt finishes, whatever the outcome.
      const hostnames = [...new Set(records.map((record) => record.target))];
      const addresses = await resolveHostAddressesOverDoh(hostnames);
      const restoreLookups = installLookupOverrides(addresses);

      try {
        await mongoose.connect(directUri, connectionOptions);
      } finally {
        restoreLookups();
      }

      return "doh";
    } catch (fallbackError) {
      logger.error(`DNS-over-HTTPS fallback failed: ${firstMeaningfulMessage(fallbackError)}`);
      throw error; // report the original failure the caller saw
    }
  }
};

const connectDB = async (uriOverride) => {
  const uri = uriOverride || process.env.MONGO_URI || config.mongoUri;

  try {
    const mode = await connectWithRetryPolicy(uri);
    logger.info(
      mode === "doh"
        ? "MongoDB connected successfully (DNS-over-HTTPS fallback)"
        : "MongoDB connected successfully",
    );
  } catch (error) {
    logger.error(`MongoDB Connection Failed: ${firstMeaningfulMessage(error)}`);
    throw error;
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    logger.info("MongoDB connection closed");
  } catch (error) {
    logger.error(`Error closing MongoDB: ${error.message}`);
  }
};

module.exports = {
  connectDB,
  disconnectDB,
  isSrvDnsFailure,
  firstMeaningfulMessage,
  get publicResolversApplied() {
    return publicResolversApplied;
  },
  set publicResolversApplied(value) {
    publicResolversApplied = value;
  },
};
