/**
 * Demo reset: backs up the development database, clears it, then runs the presentation seeder.
 *
 * Development/test only. It refuses production, requires --confirm-reset, requires DEMO_RESET_DATABASE to match the
 * connected database exactly, and requires a local MongoDB host. A backup of every collection is written and verified
 * BEFORE any document is deleted. Never runs automatically: nothing calls this on app start.
 *
 *   cd server
 *   set DEMO_RESET_DATABASE=hiresmart_dev        (PowerShell: $env:DEMO_RESET_DATABASE="hiresmart_dev")
 *   npm run demo:reset -- --confirm-reset
 */
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const mongoose = require("mongoose");
const { connectDB, disconnectDB } = require("../config/db");
const { assertDemoResetAllowed } = require("../domain/demoResetPolicy");

const BACKUP_ROOT = path.join(__dirname, "..", "backups");

/** Writes one EJSON file per collection and re-reads each to verify the document count. Throws on any mismatch. */
const backupDatabase = async (db, host) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(BACKUP_ROOT, `${db.databaseName}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const EJSON = mongoose.mongo.BSON.EJSON;
  const names = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith("system."));
  const counts = {};
  for (const name of names) {
    const docs = await db.collection(name).find({}).toArray();
    const file = path.join(dir, `${name}.ejson`);
    fs.writeFileSync(file, EJSON.stringify(docs, { relaxed: false }));
    const back = EJSON.parse(fs.readFileSync(file, "utf8"));
    if (back.length !== docs.length) throw new Error(`Backup verification failed for ${name}. Nothing was deleted.`);
    counts[name] = docs.length;
  }
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({ database: db.databaseName, host, createdAt: new Date().toISOString(), counts }, null, 2),
  );
  return { dir, counts };
};

const main = async () => {
  const confirmed = process.argv.includes("--confirm-reset");
  await connectDB();
  const db = mongoose.connection.db;
  const target = assertDemoResetAllowed({
    nodeEnv: process.env.NODE_ENV,
    confirmed,
    expectedDatabase: process.env.DEMO_RESET_DATABASE,
    actualDatabase: db.databaseName,
    host: mongoose.connection.host,
  });
  console.log(`Target database: "${target.database}" on ${target.host}`);

  const { dir, counts } = await backupDatabase(db, target.host);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`Backup written and verified: ${dir} (${total} documents in ${Object.keys(counts).length} collections)`);

  for (const name of Object.keys(counts)) {
    await db.collection(name).deleteMany({});
  }
  console.log("Cleared all collections in the target database (indexes kept).");

  await disconnectDB();
  const { seedPresentationData } = require("./seed-presentation-demo");
  await seedPresentationData();
};

if (require.main === module) {
  main().catch(async (error) => {
    console.error(`Demo reset stopped: ${error.message}`);
    process.exitCode = 1;
    await disconnectDB().catch(() => {});
  });
}

module.exports = { backupDatabase };
