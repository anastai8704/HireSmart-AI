const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ignoredDirectories = new Set(["node_modules", "logs", "uploads"]);

const collectJavaScriptFiles = (directory) => {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            return ignoredDirectories.has(entry.name)
                ? []
                : collectJavaScriptFiles(entryPath);
        }

        return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
    });
};

const files = collectJavaScriptFiles(path.join(__dirname, ".."));
let hasErrors = false;

for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
        stdio: "inherit",
    });

    hasErrors ||= result.status !== 0;
}

if (hasErrors) {
    process.exitCode = 1;
}
