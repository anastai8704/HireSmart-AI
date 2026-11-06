// Unit-level checks for the application organization gate. No database: the model methods used by
// exports.apply are replaced with stubs for the duration of each test and restored afterwards.
// The database-backed behaviour is covered by applicationOrganizationGate.test.js (CI).
const assert = require("node:assert/strict");
const { test } = require("node:test");

const Job = require("../models/Job");
const Organization = require("../models/Organization");
const { Application } = require("../models/Application");
const { ResumeVersion } = require("../models/Resume");
const controller = require("../controllers/v1RecruitmentController");

const STUBBED = [
  [Job, "findOne"],
  [Organization, "findById"],
  [ResumeVersion, "findOne"],
  [Application, "exists"],
  [Application, "create"],
];

const withStubs = async (stubs, fn) => {
  const originals = STUBBED.map(([model, name]) => [model, name, model[name]]);
  const calls = { create: 0 };
  for (const [model, name] of STUBBED) {
    model[name] = stubs[`${model.modelName || model.name}.${name}`] || (() => {
      throw new Error(`Unexpected call to ${name}`);
    });
  }
  Application.create = async () => {
    calls.create += 1;
    return stubs.createResult || { _id: "unexpected" };
  };
  try {
    await fn(calls);
  } finally {
    for (const [model, name, original] of originals) model[name] = original;
  }
};

const resolved = (value) => () => ({
  select: () => Promise.resolve(value),
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
});

const req = (jobId) => ({
  params: { jobId },
  body: { resumeVersionId: "b".repeat(24), source: "direct" },
  get: () => undefined,
  user: { _id: "c".repeat(24) },
  auth: {},
});

const run = (jobId) =>
  new Promise((resolve) => {
    controller.apply(req(jobId), {}, (err) => resolve(err || null));
  });

test("the job query excludes jobs without an organization", async () => {
  let captured = null;
  await withStubs(
    {
      "Job.findOne": (filter) => {
        captured = filter;
        return Promise.resolve(null);
      },
    },
    async () => {
      const err = await run("a".repeat(24));
      assert.equal(err?.statusCode, 404);
      assert.equal(err?.code, "RESOURCE_NOT_FOUND");
    },
  );
  assert.deepEqual(captured.organization, { $ne: null });
});

test("a job with a null organization is refused and no application is created", async () => {
  await withStubs(
    {
      "Job.findOne": resolved(null),
      "Application.exists": () => Promise.resolve(false),
    },
    async (calls) => {
      const err = await run("a".repeat(24));
      assert.equal(err?.statusCode, 404);
      assert.equal(calls.create, 0);
    },
  );
});

test("if a null organization reaches the handler, the verification check still refuses it", async () => {
  // Defence in depth: the query above excludes these jobs, but the check must not depend on it.
  const orgLookups = [];
  await withStubs(
    {
      "Job.findOne": resolved({
        _id: "a".repeat(24),
        organization: null,
        status: "published",
        version: 1,
        title: "Legacy",
      }),
      "Organization.findById": (id) => {
        orgLookups.push(id);
        return Promise.resolve(null);
      },
      "ResumeVersion.findOne": resolved({ _id: "b".repeat(24), storageKey: "k", storageProvider: "local" }),
      "Application.exists": () => Promise.resolve(false),
    },
    async (calls) => {
      const err = await run("a".repeat(24));
      assert.equal(err?.statusCode, 403);
      assert.equal(err?.code, "ORGANIZATION_NOT_VERIFIED");
      assert.equal(calls.create, 0);
    },
  );
  assert.equal(orgLookups.length, 1, "the organization check must run even when job.organization is null");
});

test("an unverified organization is refused with ORGANIZATION_NOT_VERIFIED and no application is created", async () => {
  await withStubs(
    {
      "Job.findOne": resolved({ _id: "a".repeat(24), organization: "d".repeat(24), status: "published", version: 1 }),
      "Organization.findById": () => Promise.resolve({ _id: "d".repeat(24), verificationStatus: "pending" }),
      "ResumeVersion.findOne": resolved({ _id: "b".repeat(24), storageKey: "k", storageProvider: "local" }),
      "Application.exists": () => Promise.resolve(false),
    },
    async (calls) => {
      const err = await run("a".repeat(24));
      assert.equal(err?.statusCode, 403);
      assert.equal(err?.code, "ORGANIZATION_NOT_VERIFIED");
      assert.equal(calls.create, 0);
    },
  );
});

test("a dangling organization reference is refused with ORGANIZATION_NOT_VERIFIED and no application is created", async () => {
  await withStubs(
    {
      "Job.findOne": resolved({ _id: "a".repeat(24), organization: "e".repeat(24), status: "published", version: 1 }),
      "Organization.findById": () => Promise.resolve(null),
      "ResumeVersion.findOne": resolved({ _id: "b".repeat(24), storageKey: "k", storageProvider: "local" }),
      "Application.exists": () => Promise.resolve(false),
    },
    async (calls) => {
      const err = await run("a".repeat(24));
      assert.equal(err?.statusCode, 403);
      assert.equal(err?.code, "ORGANIZATION_NOT_VERIFIED");
      assert.equal(calls.create, 0);
    },
  );
});

test("a duplicate application is refused with APPLICATION_EXISTS and no second application is created", async () => {
  await withStubs(
    {
      "Job.findOne": resolved({ _id: "a".repeat(24), organization: "d".repeat(24), status: "published", version: 1 }),
      "Organization.findById": () => Promise.resolve({ _id: "d".repeat(24), verificationStatus: "verified" }),
      "ResumeVersion.findOne": resolved({ _id: "b".repeat(24), storageKey: "k", storageProvider: "local" }),
      "Application.exists": () => Promise.resolve(true),
    },
    async (calls) => {
      const err = await run("a".repeat(24));
      assert.equal(err?.statusCode, 409);
      assert.equal(err?.code, "APPLICATION_EXISTS");
      assert.equal(calls.create, 0);
    },
  );
});
