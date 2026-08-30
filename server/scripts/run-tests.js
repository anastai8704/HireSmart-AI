const { spawn } = require("node:child_process");

// Runs the real test suite (`node --test --test-concurrency=1`) and relays
// its output. On failure, mirrors the tail of the output into GitHub Actions
// check-run annotations because raw step logs are not always retrievable from
// outside the runner. NOTE: keep this filename free of "test" so the Node
// test runner does not discover it as a test file itself.
const args = ["--test", "--test-concurrency=1"];
const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });

let buffer = "";
const relay = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    buffer += text;
};
child.stdout.on("data", relay);
child.stderr.on("data", relay);

const annotate = (level, message) => {
    if (process.env.CI !== "true") return;
    const escaped = String(message)
        .slice(0, 4000)
        .replace(/%/g, "%25")
        .replace(/\r/g, "%0D")
        .replace(/\n/g, "%0A");
    process.stdout.write(`::${level} file=server/test::${escaped}\n`);
};

child.on("close", (code, signal) => {
    if (code === 0) {
        annotate("notice", "test suite passed");
        process.exit(0);
    }
    annotate("error", `test runner exited code=${code} signal=${signal}`);
    const lines = buffer
        .split("\n")
        .map((line) => line.slice(0, 500))
        .filter((line) => line.trim().length > 0)
        .slice(-60);
    for (const line of lines) annotate("error", line);
    process.exit(code ?? 1);
});

child.on("error", (error) => {
    console.error(error.stack || error.message);
    annotate("error", `test runner failed to start: ${error.message}`);
    process.exit(1);
});
