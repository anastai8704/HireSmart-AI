const test = require("node:test");
const assert = require("node:assert/strict");
const { verificationBlockFor } = require("../domain/placementVerification");

test("a placement is verifiable once the joining is confirmed or employment is recorded", () => {
  for (const status of ["joining_confirmed", "currently_working", "employment_ended"]) {
    assert.equal(verificationBlockFor({ status, verification: { isVerified: false } }), null, status);
  }
});

test("a selected or hired placement cannot be verified before the joining", () => {
  for (const status of ["selected", "hired"]) {
    assert.equal(verificationBlockFor({ status, verification: { isVerified: false } }).code, "NOT_VERIFIABLE_YET", status);
  }
});

test("an already verified placement is not verified twice", () => {
  assert.equal(
    verificationBlockFor({ status: "joining_confirmed", verification: { isVerified: true } }).code,
    "ALREADY_VERIFIED",
  );
});
