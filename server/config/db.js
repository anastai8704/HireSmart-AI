const mongoose = require("mongoose");
const { config } = require("./env");
const logger = require("../utils/logger");


const connectDB = async (uriOverride) => {
    try {
        const uri = uriOverride || process.env.MONGO_URI || config.mongoUri;
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000,
        });

        logger.info("MongoDB connected successfully");
    } catch (error) {
        logger.error(`MongoDB Connection Failed: ${error.message}`);
        throw error;
    }
};

const disconnectDB = async () => {
    try {
        await mongoose.connection.close();
        logger.info("MongoDB connection closed");
    } catch (error) {
        logger.error(`Error closing MongoDB: ${error.message}`);
    }
};

module.exports = {
    connectDB,
    disconnectDB,
};