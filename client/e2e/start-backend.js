// Starts the API for the browser suite (Requirement 18). Prepares a DISPOSABLE database first, then runs the server.
// Environment: E2E_MONGO_URI (must name an "e2e" database on a local host) and DEMO_PASSWORD (min 12 characters).
const { execFileSync, spawn } = require("node:child_process");
const path = require("node:path");

const serverDir = path.join(__dirname, "..", "..", "server");
const mongoUri = process.env.E2E_MONGO_URI || "mongodb://127.0.0.1:27017/hiresmart_e2e";
const env = {
  ...process.env,
  NODE_ENV: "development",
  PORT: "5000",
  MONGO_URI: mongoUri,
  E2E_MONGO_URI: mongoUri,
  JWT_SECRET: process.env.JWT_SECRET || "e2e_only_secret_at_least_32_characters_long_000",
  REQUIRE_EMAIL_VERIFICATION: "false",
  STORAGE_PROVIDER: "local",
  PROCESS_JOBS_INLINE: "true",
  CLIENT_URL: "http://127.0.0.1:5173",
};

execFileSync(process.execPath, [path.join("scripts", "e2e-prepare.js")], { cwd: serverDir, env, stdio: "inherit" });

const child = spawn(process.execPath, ["server.js"], { cwd: serverDir, env, stdio: "inherit" });
const stop = (signal) => child.kill(signal);
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
child.on("exit", (code) => process.exit(code ?? 0));
