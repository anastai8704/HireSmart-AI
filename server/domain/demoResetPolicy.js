// Safety rules for the demo reset. Pure functions, so the rules are unit-tested without a database.
// A reset deletes every document in the target database. These checks must all pass first.
const LOCAL_HOSTS = Object.freeze(["localhost", "127.0.0.1", "::1"]);
const DEV_NAME_PATTERN = /(dev|test|demo|local)/i;

/** Throws unless the reset may run against the connected database. Returns the target summary when allowed. */
const assertDemoResetAllowed = ({ nodeEnv, confirmed, expectedDatabase, actualDatabase, host }) => {
  if (String(nodeEnv || "").trim().toLowerCase() === "production") {
    throw new Error("Demo reset refuses to run when NODE_ENV=production.");
  }
  if (!confirmed) {
    throw new Error("Demo reset requires the --confirm-reset flag. Nothing was changed.");
  }
  if (!expectedDatabase) {
    throw new Error("Set DEMO_RESET_DATABASE to the exact name of the database you intend to reset.");
  }
  if (expectedDatabase !== actualDatabase) {
    throw new Error(
      `Connected database is "${actualDatabase}" but DEMO_RESET_DATABASE is "${expectedDatabase}". Nothing was changed.`,
    );
  }
  if (!LOCAL_HOSTS.includes(String(host || "").toLowerCase())) {
    throw new Error(`Demo reset only runs against a local MongoDB host, not "${host}". Nothing was changed.`);
  }
  if (!DEV_NAME_PATTERN.test(actualDatabase)) {
    throw new Error(
      `Database "${actualDatabase}" does not look like a development database (name must contain dev, test, demo or local).`,
    );
  }
  return { database: actualDatabase, host };
};

module.exports = { assertDemoResetAllowed, LOCAL_HOSTS };
