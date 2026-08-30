const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const { connectDB, disconnectDB } = require("../config/db");
const { validateEnvironment } = require("../config/env");

// GitHub Actions annotation helpers: step logs are not always retrievable
// (e.g. from external sandboxes), so mirror the outcome into check-run
// annotations that are readable through the GitHub API.
const annotate = (level, message) => {
    if (process.env.CI !== "true") return;
    const escaped = String(message)
        .slice(0, 4000)
        .replace(/%/g, "%25")
        .replace(/\r/g, "%0D")
        .replace(/\n/g, "%0A");
    process.stdout.write(`::${level} file=server/scripts/create-indexes.js::${escaped}\n`);
};

const run = async () => {
    validateEnvironment();
    const modelDir = path.join(__dirname, "..", "models");
    for (const file of fs.readdirSync(modelDir).filter((name) => name.endsWith(".js"))) require(path.join(modelDir, file));
    await connectDB();
    const result = {};
    const failures = [];
    for (const [name, model] of Object.entries(mongoose.models)) {
        try {
            await model.createIndexes();
            result[name] = "ok";
        } catch (error) {
            result[name] = "failed";
            failures.push({ model: name, error: error && (error.stack || error.message) });
        }
    }
    console.log(JSON.stringify(result, null, 2));
    if (failures.length > 0) {
        for (const failure of failures) annotate("error", `${failure.model} createIndexes failed: ${failure.error}`);
    } else {
        annotate("notice", `All ${Object.keys(mongoose.models).length} collections indexed successfully`);
    }
    await disconnectDB();
    if (failures.length > 0) process.exitCode = 1;
};

run().catch(async (error) => {
    console.error(error.stack || error.message);
    annotate("error", `create-indexes script failed: ${error && (error.stack || error.message)}`);
    await disconnectDB();
    process.exitCode = 1;
});
