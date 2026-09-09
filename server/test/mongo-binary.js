/**
 * Locates a mongod binary for mongodb-memory-server.
 *
 * mongodb-memory-server normally downloads mongod from fastdl.mongodb.org the
 * first time you run the tests. On machines / CI runners where that domain is
 * unreachable (offline, corporate proxy, restricted sandbox) the download fails
 * and every database test errors out.
 *
 * To stay robust we look for an already-present binary in a few well-known
 * places and, if we find one, tell mongodb-memory-server to reuse it via the
 * MONGOMS_SYSTEM_BINARY environment variable.
 *
 * You can always override everything yourself:
 *   MONGOMS_SYSTEM_BINARY=/path/to/mongod npm test
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CACHE_ROOT = path.join(os.homedir(), ".cache", "mongodb-binaries");

const candidatePaths = () => {
  const paths = [];

  // 1. Explicit opt-in always wins.
  if (process.env.MONGOMS_SYSTEM_BINARY) {
    paths.push(process.env.MONGOMS_SYSTEM_BINARY);
  }

  // 2. Anything previously downloaded/placed in the shared cache directory.
  try {
    for (const entry of fs.readdirSync(CACHE_ROOT)) {
      paths.push(path.join(CACHE_ROOT, entry, "mongod"));
      paths.push(path.join(CACHE_ROOT, entry));
    }
  } catch {
    // The cache directory simply does not exist yet - not an error.
  }

  // 3. A mongod installed system-wide.
  paths.push("/usr/bin/mongod", "/usr/local/bin/mongod", "/opt/homebrew/bin/mongod");

  return paths;
};

const isExecutableFile = (candidate) => {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
};

/**
 * Configures MONGOMS_SYSTEM_BINARY when a usable local mongod exists.
 * Returns the resolved path, or null when we should let the library download.
 */
const useLocalMongodIfAvailable = () => {
  const found = candidatePaths().find(isExecutableFile);

  if (!found) {
    return null;
  }

  process.env.MONGOMS_SYSTEM_BINARY = found;

  // Older mongod builds link against OpenSSL 1.1. If matching libraries were
  // vendored next to the binary, put them on the loader path.
  const vendoredLibs = path.join(os.homedir(), ".local", "lib", "mongo");

  if (fs.existsSync(vendoredLibs)) {
    process.env.LD_LIBRARY_PATH = [process.env.LD_LIBRARY_PATH, vendoredLibs]
      .filter(Boolean)
      .join(":");
  }

  return found;
};

module.exports = { useLocalMongodIfAvailable };
