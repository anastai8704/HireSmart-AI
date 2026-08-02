const mongoose = require("mongoose");
const dns = require("node:dns");
const { config } = require("./env");
const logger = require("../utils/logger");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const connectDB = async () => {
    await mongoose.connect(config.mongoUri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
    });

    logger.info("MongoDB connected successfully");
};

module.exports = connectDB;
