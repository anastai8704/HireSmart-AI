/**
 * Database Backup Script for HireSmart-AI
 *
 * Backs up all collections from the connected MongoDB database to server/backups/<db>-<timestamp>
 * in verified EJSON format. Never exposes credentials.
 */

process.env.NODE_ENV = process.env.NODE_ENV || "development";

const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const mongoose = require("mongoose");
const { connectDB, disconnectDB } = require("../config/db");

const BACKUP_ROOT = path.join(__dirname, "..", "backups");

async function backupDatabase() {
  await connectDB();
  const db = mongoose.connection.db;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(BACKUP_ROOT, `${db.databaseName}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });

  const EJSON = mongoose.mongo.BSON.EJSON;
  const collections = await db.listCollections().toArray();
  const names = collections.map((c) => c.name).filter((n) => !n.startsWith("system."));

  console.log(`Starting backup of database "${db.databaseName}" to: ${dir}`);
  console.log(`Found ${names.length} collections to back up.`);

  const manifest = {
    database: db.databaseName,
    createdAt: new Date().toISOString(),
    collections: {},
    totalDocuments: 0,
  };

  for (const name of names) {
    const docs = await db.collection(name).find({}).toArray();
    const filePath = path.join(dir, `${name}.ejson`);
    fs.writeFileSync(filePath, EJSON.stringify(docs, { relaxed: false }), "utf8");

    // Verification step: re-read file and ensure exact document count matches
    const reloaded = EJSON.parse(fs.readFileSync(filePath, "utf8"));
    if (reloaded.length !== docs.length) {
      throw new Error(
        `Backup verification mismatch on collection "${name}": DB had ${docs.length}, file has ${reloaded.length}`
      );
    }

    manifest.collections[name] = docs.length;
    manifest.totalDocuments += docs.length;
    console.log(`  ✓ Backed up "${name}": ${docs.length} documents (verified)`);
  }

  const manifestPath = path.join(dir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("\n=======================================================");
  console.log(`BACKUP COMPLETED AND VERIFIED SUCCESSFULLY`);
  console.log(`Backup Directory: ${dir}`);
  console.log(`Total Collections: ${Object.keys(manifest.collections).length}`);
  console.log(`Total Documents: ${manifest.totalDocuments}`);
  console.log("=======================================================\n");

  await disconnectDB();
  return { dir, manifest };
}

if (require.main === module) {
  backupDatabase().catch(async (err) => {
    console.error("Backup failed:", err.message);
    process.exitCode = 1;
    await disconnectDB().catch(() => {});
  });
}

module.exports = { backupDatabase };
