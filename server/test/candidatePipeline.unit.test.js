// Phase 4 pure rules: offers, hiring gate, candidate privacy projection and employment evidence.
const test = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../domain/candidatePipeline");

const app = (status, offer = {}) => ({ status, offer: { status: "none", ...offer } });

test("an offer can be issued only from the interview stage, and not while one is open", () => {
  assert.equal(rules.canIssueOffer(app("interview")).ok, true);
  assert.equal(rules.canIssueOffer(app("offer")).ok, true, "a declined or unset offer on the offer stage may be replaced");
  assert.equal(rules.canIssueOffer(app("offer", { status: "declined" })).ok, true);
  assert.equal(rules.canIssueOffer(app("submitted")).code, "OFFER_STAGE_REQUIRED");
  assert.equal(rules.canIssueOffer(app("shortlisted")).code, "OFFER_STAGE_REQUIRED");
  assert.equal(rules.canIssueOffer(app("interview", { status: "issued" })).code, "OFFER_ALREADY_OPEN");
  assert.equal(rules.canIssueOffer(app("offer", { status: "accepted" })).code, "OFFER_ALREADY_OPEN");
});

test("only an issued offer on the offer stage can be answered", () => {
  assert.equal(rules.canRespondToOffer(app("offer", { status: "issued" })).ok, true);
  assert.equal(rules.canRespondToOffer(app("offer", { status: "declined" })).code, "OFFER_NOT_PENDING");
  assert.equal(rules.canRespondToOffer(app("interview", { status: "issued" })).code, "OFFER_NOT_PENDING");
});

test("hiring requires the candidate's recorded acceptance; an issued offer is not enough", () => {
  assert.equal(rules.canHire(app("offer", { status: "accepted" })).ok, true);
  assert.equal(rules.canHire(app("offer", { status: "issued" })).code, "OFFER_NOT_ACCEPTED");
  assert.equal(rules.canHire(app("offer", { status: "none" })).code, "OFFER_NOT_ACCEPTED");
  assert.equal(rules.canHire(app("interview", { status: "accepted" })).code, "INVALID_TRANSITION");
});

test("recruiter view: phone and current employment are hidden unless the candidate shared them", () => {
  const user = { _id: "u1", name: "Asha", email: "a@x.test", phone: "+91 98765 43210", skills: ["Go"], location: "Pune" };
  const closed = rules.recruiterCandidateView(user, null);
  assert.equal(closed.phone, undefined);
  assert.equal(closed.currentEmployment, undefined);
  assert.equal(closed.email, "a@x.test", "the contact used for an application stays available");

  const phoneOnly = rules.recruiterCandidateView(user, { privacy: { sharePhoneWithRecruiters: true }, currentEmployment: { disclosed: true, employer: "Acme" } });
  assert.equal(phoneOnly.phone, "+91 98765 43210");
  assert.equal(phoneOnly.currentEmployment, undefined, "employment needs its own consent");

  const employmentOnly = rules.recruiterCandidateView(user, {
    privacy: { shareCurrentEmployment: true },
    currentEmployment: { disclosed: true, employer: "Acme", designation: "Engineer", startDate: null },
  });
  assert.equal(employmentOnly.phone, undefined);
  assert.deepEqual(employmentOnly.currentEmployment, { employer: "Acme", designation: "Engineer", startDate: null, source: "candidate_reported" });

  const undisclosed = rules.recruiterCandidateView(user, { privacy: { shareCurrentEmployment: true }, currentEmployment: { disclosed: false, employer: "Acme" } });
  assert.equal(undisclosed.currentEmployment, undefined, "nothing is shown if the candidate has not disclosed it");
});

test("employment evidence: each fact keeps its source, and nothing is inferred", () => {
  const hiredOnly = rules.employmentEvidence({ createdAt: new Date("2026-01-01"), offerDetails: {}, joiningConfirmation: {}, verification: {} });
  assert.equal(hiredOnly.hiredByCompany.source, "organization_reported");
  assert.equal(hiredOnly.offerAccepted.recorded, false, "an old hire without an acceptance record is not treated as accepted");
  assert.equal(hiredOnly.joiningReported.recorded, false);
  assert.equal(hiredOnly.employmentConfirmed.recorded, false, "a hire is not proof of employment");

  const joined = rules.employmentEvidence({
    offerDetails: { acceptedAt: new Date("2026-02-01") },
    joiningConfirmation: { confirmedByCandidate: true, actualJoiningDate: new Date("2026-02-15"), confirmedAt: new Date("2026-02-16") },
    verification: { isVerified: false },
  });
  assert.equal(joined.offerAccepted.source, "candidate_reported");
  assert.equal(joined.joiningReported.source, "candidate_reported");
  assert.equal(joined.employmentConfirmed.recorded, false, "joining reported is not employment confirmed");

  const verified = rules.employmentEvidence({ verification: { isVerified: true, verifiedAt: new Date("2026-03-01") } });
  assert.equal(verified.employmentConfirmed.recorded, true);
  assert.equal(verified.employmentConfirmed.source, "platform_verified");
});
