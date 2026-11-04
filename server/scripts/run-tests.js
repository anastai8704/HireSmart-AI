const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

// Runs the test suite file by file (`node --test <file>`), relaying each
// file's output. Per-file isolation makes failures diagnosable.
//
// GitHub keeps only a small number of check-run annotations (older ones are
// dropped), so on failure we emit ONE combined annotation per failing file:
// the exit code/signal plus the tail of that file's output, in a single
// multi-line message. Raw step logs are not always retrievable from outside
// the runner, so this is the diagnostic channel.
//
// NOTE: keep this filename free of "test" so the Node test runner does not
// discover it as a test file itself.
const testDir = path.join(__dirname, "..", "test");
const files = fs
  .readdirSync(testDir)
  .filter((name) => /\.test\.(js|cjs|mjs)$/.test(name))
  .sort()
  .map((name) => path.join(testDir, name));

const annotate = (level, file, message) => {
  if (process.env.CI !== "true") return;
  const escaped = String(message)
    .slice(0, 6000)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
  process.stdout.write(`::${level} file=server/test/${file}::${escaped}\n`);
};

// Check-run annotations are sometimes dropped by GitHub; the run *summary*
// is separately retrievable, so failure details are mirrored there too.
const appendSummary = (text) => {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  try {
    require("node:fs").appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
  } catch {
    /* best effort diagnostics */
  }
};

// GITHUB_OUTPUT step outputs are retrievable through the jobs API, which
// makes for a third, independent diagnostic channel for CI failures.
const writeStepOutput = (name, value) => {
  if (!process.env.GITHUB_OUTPUT) return;
  const delimiter = `EOFGH_${name}`;
  try {
    require("node:fs").appendFileSync(
      process.env.GITHUB_OUTPUT,
      `${name}<<${delimiter}
${String(value).replace(new RegExp(`^${delimiter}$`, "gm"), "")}
${delimiter}
`,
    );
  } catch {
    /* best effort diagnostics */
  }
};

// A file that stops making progress must not hold the whole suite: it is killed, reported
// as failed with its output tail, and the remaining files still run.
const FILE_TIMEOUT_MS = Number(process.env.TEST_FILE_TIMEOUT_MS) || 300000;

const runFile = (file) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test", file], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let timedOut = false;
    const relay = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      out += text;
    };
    // The database helper starts mongod as a child that inherits these pipes, so 'close' may
    // never fire after a kill. On timeout we therefore report the file immediately.
    const tailOf = () =>
      out
        .split("\n")
        .map((line) => line.slice(0, 300))
        .filter((line) => line.trim().length > 0)
        .slice(-60)
        .join("\n");
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      resolve({
        file: path.basename(file),
        failed: true,
        info: `no completion after ${FILE_TIMEOUT_MS / 1000}s; killed\n--- output tail ---\n${tailOf()}`,
      });
    }, FILE_TIMEOUT_MS);
    child.stdout.on("data", relay);
    child.stderr.on("data", relay);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        file: path.basename(file),
        failed: true,
        info: `runner failed to start: ${error.message}`,
      });
    });
    // 'exit' gives the file's own status even when a leftover mongod still holds the pipes.
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code === 0) {
        resolve({ file: path.basename(file), failed: false });
        return;
      }
      const tail = out
        .split("\n")
        .map((line) => line.slice(0, 300))
        .filter((line) => line.trim().length > 0)
        .slice(-60)
        .join("\n");
      resolve({
        file: path.basename(file),
        failed: true,
        info: `exit code=${code} signal=${signal}\n--- output tail ---\n${tail}`,
      });
    });
  });

const main = async () => {
  const results = [];
  for (const file of files) {
    process.stdout.write(`\n== ${path.basename(file)} ==\n`);
    results.push(await runFile(file));
  }
  const failed = results.filter((result) => result.failed);
  if (failed.length > 0) {
    for (const result of failed) {
      annotate("error", result.file, result.info);
      appendSummary(
        `### ❌ ${result.file}\n\n\`\`\`\n${result.info.slice(0, 4000)}\n\`\`\``,
      );
    }
    annotate(
      "error",
      "summary",
      `${failed.length}/${results.length} files failed: ${failed.map((r) => r.file).join(", ")}`,
    );
    appendSummary(
      `**${failed.length}/${results.length} test files failed**: ${failed.map((r) => r.file).join(", ")}`,
    );
    writeStepOutput(
      "failed_details",
      failed.map((r) => `--- ${r.file} ---\n${r.info.slice(0, 4000)}`).join("\n\n"),
    );
    process.exit(1);
  }
  annotate("notice", "summary", `all ${results.length} test files passed`);
  process.exit(0);
};

main();
