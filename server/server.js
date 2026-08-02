const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const app = require("./app");
const connectDB = require("./config/db");
const { config, validateEnvironment } = require("./config/env");
const logger = require("./utils/logger");

const startServer = async () => {
    validateEnvironment();
    await connectDB();

    const server = app.listen(config.port, () => {
        logger.info(`Server listening on port ${config.port}`);
    });

    const shutdown = (signal) => {
        logger.info(`${signal} received. Closing server.`);
        server.close(() => process.exit(0));
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));

    return server;
};

if (require.main === module) {
    startServer().catch((error) => {
        logger.error(error.stack || error.message);
        process.exitCode = 1;
    });
}

module.exports = { startServer };
