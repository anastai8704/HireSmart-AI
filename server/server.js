const app = require("./app");
const { connectDB, disconnectDB } = require("./config/db");
const { config, validateEnvironment } = require("./config/env");
const logger = require("./utils/logger");

const startServer = async () => {
    validateEnvironment(); await connectDB();
    const server = app.listen(config.port, "0.0.0.0", () => logger.info(`Server listening on port ${config.port}`));
    server.requestTimeout = 65000; server.headersTimeout = 70000; server.keepAliveTimeout = 5000;
    const shutdown = (signal) => {
        logger.info(`${signal} received. Draining HTTP connections...`);
        const force = setTimeout(() => { logger.error("Graceful shutdown timed out"); process.exit(1); }, 15000); force.unref();
        server.close(async () => { try { await disconnectDB(); clearTimeout(force); logger.info("Server stopped successfully"); process.exit(0); } catch (error) { logger.error(error.message); process.exit(1); } });
    };
    process.once("SIGINT", () => shutdown("SIGINT")); process.once("SIGTERM", () => shutdown("SIGTERM"));
    return server;
};
if (require.main === module) startServer().catch((error) => { logger.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { startServer };
