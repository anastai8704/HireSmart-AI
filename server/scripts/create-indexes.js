const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const { connectDB, disconnectDB } = require("../config/db");
const { validateEnvironment } = require("../config/env");
const run = async () => {
    validateEnvironment();
    const modelDir = path.join(__dirname, "..", "models");
    for (const file of fs.readdirSync(modelDir).filter((name) => name.endsWith(".js"))) require(path.join(modelDir, file));
    await connectDB();
    const result = {};
    for (const [name, model] of Object.entries(mongoose.models)) { await model.createIndexes(); result[name] = "ok"; }
    console.log(JSON.stringify(result, null, 2)); await disconnectDB();
};
run().catch(async (error) => { console.error(error.stack || error.message); await disconnectDB(); process.exitCode = 1; });
