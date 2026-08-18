const { connectDB, disconnectDB } = require("./config/db");
const { validateEnvironment } = require("./config/env");
const { processNext } = require("./services/jobQueueService");
const logger = require("./utils/logger");
let stopping = false;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = async () => {
    validateEnvironment(); await connectDB(); logger.info("Background worker started");
    while (!stopping) { const worked = await processNext(); if (!worked) await wait(1000); }
    await disconnectDB();
};
process.on("SIGTERM", () => { stopping = true; }); process.on("SIGINT", () => { stopping = true; });
run().catch((error) => { logger.error(error.stack || error.message); process.exitCode = 1; });
