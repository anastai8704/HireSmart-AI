const path = require("node:path");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

let mongoServer;

const loadTestEnv = () => {
    dotenv.config({
        path: path.join(__dirname, "..", ".env"),
        silent: true,
    });
};

const replaceDatabaseName = (uri, dbName) => {
    if (!uri) {
        return uri;
    }
    const [base, query] = uri.split("?");
    const slashIndex = base.lastIndexOf("/");
    if (slashIndex === -1) {
        return uri;
    }
    const baseWithoutDb = base.substring(0, slashIndex + 1);
    return `${baseWithoutDb}${dbName}${query ? `?${query}` : ""}`;
};

const startDatabase = async () => {
    loadTestEnv();

    try {
        mongoServer = await MongoMemoryServer.create({
            instance: { dbName: "hiresmart_test" },
            binary: { version: "6.0.8" },
        });
        process.env.MONGO_URI = mongoServer.getUri();
    } catch (error) {
        if (!process.env.MONGO_URI) {
            throw error;
        }

        process.env.MONGO_URI = replaceDatabaseName(process.env.MONGO_URI, "hiresmart_test");
    }

    const { connectDB } = require("../config/db");
    await connectDB();
};

const stopDatabase = async () => {
    await mongoose.disconnect();

    if (mongoServer) {
        await mongoServer.stop();
    }
};

const clearDatabase = async () => {
    const collections = mongoose.connection.collections;

    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }
};

module.exports = {
    startDatabase,
    stopDatabase,
    clearDatabase,
};
