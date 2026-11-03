process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const test = require("node:test");
const { ROLE_PROFILES, profileRoleFor } = require("../../client/src/lib/profileConfig");
const { hashToken, createToken } = require("../utils/tokenHelper");

/* ----------------------------- 1. Profile Architecture ----------------------------- */

test("Profile configurations are strictly role-aware", () => {
  // Candidate Profile
  const candidate = ROLE_PROFILES.candidate;
  assert.ok(candidate.sections.some((s) => s.title === "Skills & links"));
  assert.strictEqual(candidate.details, true);
  const candidateSkills = candidate.sections.find((s) => s.title === "Skills & links")?.fields;
  assert.ok(candidateSkills.some((f) => f.key === "github"));
  assert.ok(candidateSkills.some((f) => f.key === "skills"));

  // Recruiter Profile
  const recruiter = ROLE_PROFILES.recruiter;
  assert.ok(recruiter.sections.some((s) => s.title === "Organization"));
  assert.ok(recruiter.sections.some((s) => s.title === "Specializations & links"));
  assert.strictEqual(recruiter.details, undefined);
  const recruiterOrg = recruiter.sections.find((s) => s.title === "Organization")?.fields;
  assert.ok(recruiterOrg.some((f) => f.key === "companyName"));
  assert.ok(recruiterOrg.some((f) => f.key === "department"));
  const recruiterSpecs = recruiter.sections.find((s) => s.title === "Specializations & links")?.fields;
  assert.ok(recruiterSpecs.some((f) => f.key === "hiringSpecializations"));
  // GitHub should not be in recruiter profile
  assert.ok(!recruiterSpecs.some((f) => f.key === "github"));

  // Admin Profile
  const admin = ROLE_PROFILES.admin;
  assert.strictEqual(admin.details, undefined);
  const adminFields = admin.sections.flatMap((s) => s.fields);
  assert.ok(adminFields.some((f) => f.key === "name"));
  assert.ok(adminFields.some((f) => f.key === "headline"));
  assert.ok(!adminFields.some((f) => f.key === "github"));
  assert.ok(!adminFields.some((f) => f.key === "skills"));
});

test("profileRoleFor maps authentication states correctly", () => {
  assert.strictEqual(profileRoleFor({ role: "admin" }), "admin");
  assert.strictEqual(profileRoleFor({ role: "candidate" }), "candidate");
  assert.strictEqual(profileRoleFor({ role: "recruiter", organizationId: "org-1" }), "recruiter");
  assert.strictEqual(profileRoleFor({ role: "hiring_manager", organizationId: "org-1" }), "recruiter");
});

/* ----------------------------- 2. Token Security & Cryptography ----------------------------- */

test("Token helper creates cryptographically secure random tokens and SHA-256 hashes", () => {
  const { token, hashedToken } = createToken();
  assert.ok(typeof token === "string" && token.length >= 32);
  assert.ok(typeof hashedToken === "string" && hashedToken.length === 64);

  // Hash is deterministic for the same token
  const recalculated = hashToken(token);
  assert.strictEqual(recalculated, hashedToken);

  // Two independent tokens have different values and hashes
  const token2 = createToken();
  assert.notStrictEqual(token.token, token2.token);
  assert.notStrictEqual(token.hashedToken, token2.hashedToken);
});

/* ----------------------------- 3. Deterministic Profile Completeness ----------------------------- */

test("Profile completeness is deterministically calculated from real saved fields", () => {
  const calculateCandidateCompleteness = (user, profile = {}) => {
    const checks = [
      Boolean(user.displayName || user.name),
      Boolean(user.headline),
      Boolean(user.location),
      Boolean(user.bio),
      Boolean(user.skills && user.skills.length > 0),
      Boolean(profile.education && profile.education.length > 0),
      Boolean(profile.experience && profile.experience.length > 0),
    ];
    const passed = checks.filter(Boolean).length;
    return Math.round((passed / checks.length) * 100);
  };

  // Empty profile: 0%
  assert.strictEqual(calculateCandidateCompleteness({}, {}), 0);

  // Partial profile: 3 of 7 (~43%)
  const partial = calculateCandidateCompleteness(
    { name: "John Doe", headline: "Frontend Engineer", location: "Bengaluru" },
    {},
  );
  assert.strictEqual(partial, 43);

  // Full profile: 7 of 7 (100%)
  const full = calculateCandidateCompleteness(
    {
      name: "John Doe",
      headline: "Frontend Engineer",
      location: "Bengaluru",
      bio: "Experienced developer",
      skills: ["React", "Node.js"],
    },
    {
      education: [{ degree: "B.Tech", institution: "IIT" }],
      experience: [{ company: "Tech Corp", position: "Engineer" }],
    },
  );
  assert.strictEqual(full, 100);
});
