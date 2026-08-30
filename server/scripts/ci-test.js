const { spawn } = require("node:child_process");

// Runs the real test suite (`node --test --test-concurrency=1`) and relays
// its output. On failure, mirrors the tail of the output into GitHub Actions
// check-run annotations because raw step logs are not always retrievable from
// outside the runner.
const args = ["--test", "--test-concurrency=1"];
const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });

let buffer = "";
const tail = (stream) => (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    buffer += text;
};
child.stdout.on("data", tail());
child.stderr.on("data", tail());

const annotate = (level, message) => {
    if (process.env.CI !== "true") return;
    const escaped = String(message)
        .slice(0, 4000)
        .replace(/%/g, "%25")
        .replace(/\r/g, "%0D")
        .replace(/\n/g, "%0A");
    process.stdout.write(`::${level} file=server/test::${escaped}\n`);
};

child.on("close", (code) => {
    if (code === 0) {
        annotate("notice", "test suite passed");
        process.exit(0);
    }
    const lines = buffer
        .split("\n")
        .map((line) => line.slice(0, 500))
        .filter((line) => line.trim().length > 0)
        .slice(-30);
    for (const line of lines) annotate("error", line);
    process.exit(code ?? 1);
});

child.on("error", (error) => {
    console.error(error.stack || error.message);
    annotate("error", `test runner failed to start: ${error.message}`);
    process.exit(1);
});
