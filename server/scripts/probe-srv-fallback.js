/**
 * Diagnostic for the "querySrv ECONNREFUSED" failure on mongodb+srv URIs.
 *
 * Some networks refuse or drop the DNS SRV lookup that mongodb+srv URIs
 * require, so the driver crashes before it ever talks to the database:
 *
 *   MongoDB Connection Failed: querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net
 *
 * config/db.js recovers from this automatically (public-resolver retry, then
 * DNS-over-HTTPS). This script proves that on YOUR machine:
 *
 *   1. It points Node's resolver at a dead local DNS server (127.0.0.1:53),
 *      which makes the SRV lookup fail with exactly the reported error.
 *   2. It calls the real connectDB() and verifies the recovery, with a
 *      follow-up ping to prove the connection is usable.
 *
 * Usage (from the server/ directory, with a working .env):
 *   npm run probe                 # stage 1: public-resolver retry
 *   SCENARIO=stage3 npm run probe # stage 2: force the DNS-over-HTTPS path
 *   (Windows:  set SCENARIO=stage3 && npm run probe)
 *
 * Exit code 0 = the connection recovered, 1 = it did not.
 */
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const path = require("node:path");
const dns = require("node:dns");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const mongoose = require("mongoose");
const db = require("../config/db");
const { isSrvUri } = require("../utils/srvFallback");

const scenario = process.env.SCENARIO === "stage3" ? "stage3" : "stage1";

if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set - copy .env.example to .env first.");
    process.exit(2);
}
if (!isSrvUri(process.env.MONGO_URI)) {
    console.error("This probe only works with mongodb+srv:// URIs.");
    process.exit(2);
}

if (scenario === "stage3") {
    // Skip the public-resolver retry and go straight to DNS-over-HTTPS.
    db.publicResolversApplied = true;
}

// Reproduce the broken-DNS situation: with a dead local resolver the SRV
// lookup fails with ECONNREFUSED, exactly like on the reported network.
dns.setServers(["127.0.0.1"]);

console.log("scenario :", scenario, "(stage1 = public-resolver retry, stage3 = DNS-over-HTTPS fallback)");
console.log("MONGO_URI:", process.env.MONGO_URI.replace(/:([^@/]+)@/, ":***@"));

(async () => {
    try {
        await db.connectDB();
        const ping = await mongoose.connection.db.admin().command({ ping: 1 });
        console.log(`PASS: connected after the DNS failure (ping = ${JSON.stringify(ping)})`);
        process.exitCode = 0;
    } catch (error) {
        console.log("FAIL:", error.message.split("\n")[0].slice(0, 200));
        process.exitCode = 1;
    } finally {
        await db.disconnectDB();
        process.exit(process.exitCode || 0);
    }
})();
