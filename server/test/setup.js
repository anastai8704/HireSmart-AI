const path = require("node:path");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { useLocalMongodIfAvailable } = require("./mongo-binary");

let mongoServer;

// Sensible defaults so the test-suite runs on a fresh clone with no .env file.
// Real values (if a .env exists) still win, because dotenv never overwrites
// variables that are already set on process.env.
const TEST_ENV_DEFAULTS = {
    NODE_ENV: "test",
    JWT_SECRET: "test_only_secret_do_not_use_in_production",
    JWT_EXPIRES_IN: "1h",
    STORAGE_PROVIDER: "local",
    REQUIRE_EMAIL_VERIFICATION: "false",
    CLIENT_URL: "http://localhost:5173",
};

const loadTestEnv = () => {
    dotenv.config({
        path: path.join(__dirname, "..", ".env"),
        silent: true,
    });

    for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
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

    // Reuse a locally available mongod when one exists, instead of downloading.
    const localBinary = useLocalMongodIfAvailable();

    let testUri = "";

    // CI supplies an isolated local Mongo service. Prefer it directly instead
    // of downloading a second mongod binary at test runtime.
    if (process.env.MONGO_URI && !process.env.MONGO_URI.includes("mongodb.net")) {
        testUri = replaceDatabaseName(process.env.MONGO_URI, "hiresmart_test");
        process.env.MONGO_URI = testUri;
        const { connectDB } = require("../config/db");
        await connectDB(testUri);
        return;
    }

    try {
        mongoServer = await MongoMemoryServer.create({
            instance: { dbName: "hiresmart_test" },
            // Only pin a download version when we have to download at all.
            ...(localBinary
                ? {}
                : { binary: { version: process.env.MONGOMS_VERSION || "7.0.14" } }),
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
