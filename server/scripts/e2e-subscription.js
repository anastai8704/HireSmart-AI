/**
 * Browser E2E helper: expire or restore a demo candidate subscription in the DISPOSABLE E2E database only.
 *
 *   node scripts/e2e-subscription.js expire <email>
 *   node scripts/e2e-subscription.js restore <email>
 */
process.env.NODE_ENV = "development";
const mongoose = require("mongoose");
const { connectDB, disconnectDB } = require("../config/db");

const DAY = 24 * 60 * 60 * 1000;

const main = async () => {
  const [action, email] = process.argv.slice(2);
  const uri = process.env.E2E_MONGO_URI;
  if (!uri || !/e2e/i.test(uri)) throw new Error("E2E_MONGO_URI must name the disposable E2E database.");
  if (!["expire", "restore"].includes(action) || !email) throw new Error("Usage: expire|restore <email>");
  await connectDB(uri);
  const user = await mongoose.connection.db.collection("users").findOne({ email: email.toLowerCase() });
  if (!user) throw new Error(`No user ${email}`);
  const end = action === "expire" ? new Date(Date.now() - DAY) : new Date(Date.now() + 20 * DAY);
  const result = await mongoose.connection.db
    .collection("subscriptions")
    .updateOne({ subscriberType: "candidate", subscriberId: user._id, isDemo: true }, { $set: { currentPeriodEnd: end, status: "active" } });
  console.log(JSON.stringify({ action, matched: result.matchedCount, modified: result.modifiedCount, currentPeriodEnd: end }));
  await disconnectDB();
};

main().catch(async (error) => {
  console.error(error.message);
  process.exitCode = 1;
  await disconnectDB().catch(() => {});
});
