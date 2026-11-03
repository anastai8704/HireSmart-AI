process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const dns = require("node:dns");
const test = require("node:test");

const {
  isSrvUri,
  parseSrvUri,
  parseSrvRecords,
  buildDirectSrvUri,
  installLookupOverrides,
} = require("../utils/srvFallback");
const { isSrvDnsFailure } = require("../config/db");

test("isSrvUri recognises only mongodb+srv URIs", () => {
  assert.equal(isSrvUri("mongodb+srv://cluster.klvtcut.mongodb.net/db"), true);
  assert.equal(isSrvUri("mongodb://localhost:27017/db"), false);
  assert.equal(isSrvUri(undefined), false);
});

test("parseSrvUri splits credentials, host, database and options", () => {
  const parsed = parseSrvUri(
    "mongodb+srv://user:p%40ss@cluster.klvtcut.mongodb.net/hiresmart?retryWrites=false&tls=true",
  );

  assert.deepEqual(parsed, {
    auth: "user:p%40ss",
    srvHost: "cluster.klvtcut.mongodb.net",
    db: "hiresmart",
    query: "retryWrites=false&tls=true",
  });
});

test("parseSrvUri handles a bare SRV URI and rejects plain URIs", () => {
  assert.deepEqual(parseSrvUri("mongodb+srv://cluster.klvtcut.mongodb.net"), {
    auth: undefined,
    srvHost: "cluster.klvtcut.mongodb.net",
    db: "",
    query: "",
  });

  assert.equal(parseSrvUri("mongodb://localhost:27017/db"), null);
});

test("parseSrvRecords deduplicates and orders by priority then weight", () => {
  const records = parseSrvRecords([
    "0 0 27017 b.mongodb.net",
    "0 0 27017 a.mongodb.net",
    "0 10 27017 c.mongodb.net",
    "0 0 27017 b.mongodb.net",
    "1 0 27018 d.mongodb.net",
  ]);

  // Ties (same priority and weight) keep their first-seen order, which is
  // fine: equal-ranked shards are interchangeable peers for the driver.
  assert.deepEqual(records, [
    { target: "b.mongodb.net", port: 27017 },
    { target: "a.mongodb.net", port: 27017 },
    { target: "c.mongodb.net", port: 27017 },
    { target: "d.mongodb.net", port: 27018 },
  ]);
});

test("parseSrvRecords ignores malformed entries", () => {
  assert.deepEqual(
    parseSrvRecords(["", "0 0", "no-port b.mongodb.net", "0 0 27017 ok.mongodb.net"]),
    [{ target: "ok.mongodb.net", port: 27017 }],
  );
});

test("buildDirectSrvUri joins the shards and appends TLS by default", () => {
  const parsed = parseSrvUri(
    "mongodb+srv://u:s@cluster.klvtcut.mongodb.net/hiresmart?retryWrites=false",
  );
  const records = [
    { target: "a.mongodb.net", port: 27017 },
    { target: "b.mongodb.net", port: 27017 },
  ];

  assert.equal(
    buildDirectSrvUri(parsed, records),
    "mongodb://u:s@a.mongodb.net:27017,b.mongodb.net:27017/hiresmart?retryWrites=false&tls=true",
  );
});

test("buildDirectSrvUri keeps user-configured TLS options untouched", () => {
  const parsed = parseSrvUri("mongodb+srv://cluster.mongodb.net/db?tls=false");

  assert.equal(
    buildDirectSrvUri(parsed, [{ target: "a.mongodb.net", port: 27017 }]),
    "mongodb://a.mongodb.net:27017/db?tls=false",
  );
});

test("buildDirectSrvUri tolerates an empty database name and returns null without records", () => {
  const parsed = parseSrvUri("mongodb+srv://cluster.mongodb.net");

  assert.equal(
    buildDirectSrvUri(parsed, [{ target: "a.mongodb.net", port: 27017 }]),
    "mongodb://a.mongodb.net:27017?tls=true",
  );
  assert.equal(buildDirectSrvUri(parsed, []), null);
  assert.equal(buildDirectSrvUri(null, [{ target: "a.mongodb.net", port: 27017 }]), null);
});

test("isSrvDnsFailure triggers only on SRV-URI DNS layer failures", () => {
  const srvUri = "mongodb+srv://cluster.klvtcut.mongodb.net/db";
  const plainUri = "mongodb://localhost:27017/db";

  // The exact shape of the failure that motivated this fallback.
  assert.equal(
    isSrvDnsFailure(
      srvUri,
      new Error("querySrv ECONNREFUSED _mongodb._tcp.cluster.klvtcut.mongodb.net"),
    ),
    true,
  );

  // Driver errors nest the underlying failure under reason.
  const nested = new Error("Server selection timed out after 10000 ms");
  nested.reason = new Error("querySrv ETIMEDOUT _mongodb._tcp.cluster.klvtcut.mongodb.net");
  assert.equal(isSrvDnsFailure(srvUri, nested), true);

  assert.equal(
    isSrvDnsFailure(
      srvUri,
      Object.assign(new Error("getaddrinfo EAI_AGAIN cluster.mongodb.net"), { errno: "EAI_AGAIN" }),
    ),
    true,
  );
  assert.equal(isSrvDnsFailure(srvUri, new Error("connect ECONNREFUSED 127.0.0.1:27017")), false);
  assert.equal(
    isSrvDnsFailure(
      plainUri,
      new Error("querySrv ECONNREFUSED _mongodb._tcp.cluster.klvtcut.mongodb.net"),
    ),
    false,
  );
  assert.equal(isSrvDnsFailure(srvUri, null), false);
});

test("installLookupOverrides answers mapped hosts and delegates the rest", async () => {
  const restore = installLookupOverrides(
    new Map([["locked.example.test", [{ address: "203.0.113.7", family: 4 }]]]),
  );

  try {
    const mapped = await dns.promises.lookup("locked.example.test");
    assert.deepEqual(mapped, { address: "203.0.113.7", family: 4 });

    const all = await dns.promises.lookup("locked.example.test", { all: true });
    assert.deepEqual(all, [{ address: "203.0.113.7", family: 4 }]);

    // Unmapped names keep going through the real resolver. An IP literal
    // needs no network at all and must be delegated untouched.
    const delegated = await new Promise((resolve, reject) => {
      dns.lookup("127.0.0.1", (error, address, family) =>
        error ? reject(error) : resolve({ address, family }),
      );
    });
    assert.equal(delegated.address, "127.0.0.1");
  } finally {
    restore();
  }

  // After restoring, the injected address must no longer be returned.
  const afterRestore = await dns.promises.lookup("locked.example.test").then(
    (result) => result.address,
    () => null,
  );
  assert.notEqual(afterRestore, "203.0.113.7");
});
