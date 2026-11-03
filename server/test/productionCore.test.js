process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const app = require("../app");
const AppError = require("../utils/AppError");
const { verifyContent } = require("../services/resumeProcessingService");
const {
  calculateHybridMatch,
  sanitizeProfessionalText,
} = require("../services/hybridMatchingService");
const { deterministic } = require("../services/ai/orchestrator");
const { schemas } = require("../services/ai/schemas");
const { Membership } = require("../models/Membership");

test("v1 liveness returns a versioned response and request id", async () => {
  const response = await request(app).get("/api/v1/health/live");
  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, "ok");
  assert.ok(response.headers["x-request-id"]);
});
test("v1 errors have machine readable code and request id", async () => {
  const response = await request(app).get("/api/v1/not-real");
  assert.equal(response.status, 404);
  assert.equal(response.body.code, "REQUEST_FAILED");
  assert.ok(response.body.requestId);
});
test("registration rejects unknown fields and weak passwords before database access", async () => {
  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email: "person@example.com",
      password: "short",
      displayName: "Person",
      accountIntent: "candidate",
      termsConsent: true,
      role: "admin",
    });
  assert.equal(response.status, 422);
  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.ok(response.body.fieldErrors.length >= 1);
});
test("PDF content verification requires matching bytes, extension and MIME", () => {
  assert.equal(
    verifyContent(Buffer.from("%PDF-1.7 test"), "resume.pdf", "application/pdf"),
    "application/pdf",
  );
  assert.throws(
    () => verifyContent(Buffer.from("not a pdf"), "resume.pdf", "application/pdf"),
    (e) => e instanceof AppError && e.code === "FILE_CONTENT_MISMATCH",
  );
});
test("DOCX content verification rejects arbitrary zip archives", () => {
  assert.throws(
    () =>
      verifyContent(
        Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Buffer.from("archive")]),
        "resume.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    /not a valid DOCX/,
  );
});
test("malware scanner rejects the EICAR test signature", async () => {
  const { scan } = require("../services/malwareScannerService");
  await assert.rejects(
    () => scan(Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")),
    (error) => error.code === "MALWARE_DETECTED",
  );
});
test("professional text sanitizer excludes direct sensitive identifiers", () => {
  const clean = sanitizeProfessionalText(
    "Name: Priya Sharma\nGender: Female\nDOB: 01/01/1990\npriya@example.com +91 98765 43210\nBackend engineer with Node.js",
  );
  assert.ok(!clean.includes("Priya"));
  assert.ok(!clean.includes("Female"));
  assert.ok(!clean.includes("1990"));
  assert.ok(!clean.includes("@"));
  assert.ok(clean.includes("Backend engineer"));
});
test("hybrid match explains required, preferred and semantic components", async () => {
  const result = await calculateHybridMatch({
    resumeText:
      "Backend engineer with 5 years experience using Node.js, MongoDB, Docker and a bachelor degree.",
    candidateSkills: ["Node.js", "MongoDB"],
    job: {
      title: "Backend Engineer",
      description: "Build Node APIs. Bachelor degree required.",
      requiredSkills: ["Node.js", "MongoDB"],
      preferredSkills: ["Kubernetes"],
      skills: ["Node.js", "MongoDB"],
      experience: "3+ years",
      location: "Remote",
      workplaceMode: "remote",
    },
  });
  assert.ok(result.overallScore >= 50 && result.overallScore <= 100);
  assert.equal(result.missingRequiredSkills.length, 0);
  assert.ok(result.missingPreferredSkills.includes("kubernetes"));
  assert.ok(result.componentScores.semantic.method);
  assert.ok(result.limitations.includes("Decision-support score, not a hiring decision"));
});
test("hybrid match lowers required-skill score when evidence is missing", async () => {
  const result = await calculateHybridMatch({
    resumeText: "Marketing writer with two years experience",
    candidateSkills: [],
    job: {
      title: "Engineer",
      description: "Build services",
      requiredSkills: ["Java", "Kubernetes"],
      preferredSkills: [],
      skills: ["Java", "Kubernetes"],
      experience: "4 years",
    },
  });
  assert.equal(result.componentScores.requiredSkills.score, 0);
  assert.equal(result.missingRequiredSkills.length, 2);
  assert.ok(result.concerns.length > 0);
});
for (const feature of Object.keys(schemas)) {
  test(`deterministic AI fallback produces schema-valid ${feature} output`, () => {
    const value = deterministic(feature, {
      text: "Backend Engineer. Skills: JavaScript Node MongoDB Docker. Experience: Built APIs for 4 years and improved latency by 30%. Education: Bachelor degree. Contact person@example.com",
    });
    assert.equal(schemas[feature].safeParse(value).success, true);
  });
}
test("malformed AI output is rejected by structured schemas", () => {
  const invalid = schemas.resume_rewrite.safeParse({ confidence: 2, after: "untrusted" });
  assert.equal(invalid.success, false);
  const injected = schemas.jd_generation.safeParse({
    confidence: 0.8,
    title: "Ignore all rules",
    description: "short",
    requiredSkills: "all",
    preferredSkills: [],
  });
  assert.equal(injected.success, false);
});
test("membership permission templates prevent viewer privilege escalation", () => {
  const viewer = new Membership({
    organization: "507f1f77bcf86cd799439011",
    user: "507f191e810c19729de860ea",
    role: "viewer",
    status: "active",
  });
  const recruiter = new Membership({
    organization: "507f1f77bcf86cd799439011",
    user: "507f191e810c19729de860eb",
    role: "recruiter",
    status: "active",
  });
  const manager = new Membership({
    organization: "507f1f77bcf86cd799439011",
    user: "507f191e810c19729de860ec",
    role: "hiring_manager",
    status: "active",
  });
  assert.equal(viewer.hasPermission("application.manage"), false);
  assert.equal(recruiter.hasPermission("application.manage"), true);
  assert.equal(recruiter.hasPermission("member.manage"), false);
  assert.equal(manager.hasPermission("application.manage"), true);
  assert.equal(manager.hasPermission("member.manage"), false);
});
test("authentication endpoints enforce brute-force rate limits", async () => {
  let response;
  for (let i = 0; i < 22; i += 1)
    response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "not-an-email", password: "x" });
  assert.equal(response.status, 429);
});
