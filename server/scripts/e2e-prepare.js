/**
 * Browser E2E database preparation (Requirement 18). Drops and re-seeds a DISPOSABLE database. It refuses any database
 * whose name does not contain "e2e" or any non-local host. Never point this at a personal or production database.
 *
 *   E2E_MONGO_URI=mongodb://127.0.0.1:27017/hiresmart_e2e DEMO_PASSWORD=... node scripts/e2e-prepare.js
 */
process.env.NODE_ENV = "development";
const mongoose = require("mongoose");
const { connectDB, disconnectDB } = require("../config/db");

const LOCAL = ["localhost", "127.0.0.1", "::1"];

const main = async () => {
  const uri = process.env.E2E_MONGO_URI;
  if (!uri) throw new Error("Set E2E_MONGO_URI to the disposable E2E database.");
  const dbName = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://")).pathname.replace(/^\//, "").split("?")[0];
  const host = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://")).hostname;
  if (!/e2e/i.test(dbName)) throw new Error(`Refusing to reset "${dbName}": the E2E database name must contain "e2e".`);
  if (!LOCAL.includes(host)) throw new Error(`Refusing to reset a non-local host "${host}".`);

  process.env.MONGO_URI = uri;
  await connectDB(uri);
  await mongoose.connection.db.dropDatabase();
  console.log(`Dropped disposable database "${dbName}".`);
  await disconnectDB();

  const { seedPresentationData } = require("./seed-presentation-demo");
  await seedPresentationData();
};

main().catch(async (error) => {
  console.error(`E2E preparation failed: ${error.message}`);
  process.exitCode = 1;
  await disconnectDB().catch(() => {});
});
