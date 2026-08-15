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

    let testUri = "";

    try {
        mongoServer = await MongoMemoryServer.create({
            instance: { dbName: "hiresmart_test" },
            binary: { version: "6.0.8" },
        });
        testUri = mongoServer.getUri();
        process.env.MONGO_URI = testUri;
    } catch (error) {
        if (!process.env.MONGO_URI) {
            throw error;
        }

        // If in-memory Mongo fails, NEVER wipe Atlas cloud cluster! Use local test DB
        if (process.env.MONGO_URI.includes("mongodb.net")) {
            console.warn(
                "[TEST WARNING] MongoDB Memory Server failed. Refusing to run tests against MongoDB Atlas cluster to prevent data loss."
            );
            testUri = "mongodb://127.0.0.1:27017/hiresmart_test";
            process.env.MONGO_URI = testUri;
        } else {
            testUri = replaceDatabaseName(process.env.MONGO_URI, "hiresmart_test");
            process.env.MONGO_URI = testUri;
        }
    }

    const { connectDB } = require("../config/db");
    await connectDB(testUri);
};

const stopDatabase = async () => {
    await mongoose.disconnect();

    if (mongoServer) {
        await mongoServer.stop();
    }
};

const clearDatabase = async () => {
    const currentHost = mongoose.connection.host || "";
    const currentDb = mongoose.connection.name || "";

    // STRICT SAFETY GUARD: Never allow deleting collections from cloud Atlas or production database!
    if (
        currentHost.includes("mongodb.net") ||
        currentDb === "hiresmart" ||
        (currentDb !== "hiresmart_test" && !currentHost.includes("127.0.0.1") && !currentHost.includes("localhost"))
    ) {
        throw new Error(
            `[SAFETY GUARD] Attempted to clear database "${currentDb}" on host "${currentHost}". Tests are only allowed to clear "hiresmart_test" on local or in-memory server!`
        );
    }

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
