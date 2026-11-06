// Phase 2 pure policy tests. No database, no network: runnable locally and in CI.
process.env.NODE_ENV = "test";
delete process.env.COMPANY_REGISTRY_URL;
const assert = require("node:assert/strict");
const test = require("node:test");
const policy = require("../domain/companyVerificationPolicy");
const rules = require("../domain/verificationRules");
const registry = require("../services/registryProvider");

const at = (minute) => new Date(Date.UTC(2026, 10, 4, 10, minute));
const match = (type, method = "manual_review", minute = 1) => ({ type, result: "match", method, recordedAt: at(minute) });

const cleanFacts = (overrides = {}) => ({
  businessEmail: "hr@acme.example",
  emailDomain: "acme.example",
  isWebmail: false,
  businessEmailVerified: true,
  websiteHost: "acme.example",
  websiteEmailMismatch: false,
  gstin: "29ABCDE1234F1Z5",
  gstinValid: true,
  registrationNumber: "",
  documentCount: 2,
  duplicates: { registration: 0, profile: 0 },
  previousEnforcementCount: 0,
  recruiterEmailVerified: true,
  registrationMismatch: false,
  rejectedJobCount: 0,
  paymentDemandKeyword: "",
  duplicateJobTitles: false,
  unrealisticSalary: false,
  recentJobCount: 0,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

test("registration numbers and GSTINs are normalised before comparison", () => {
  assert.equal(policy.normalizeRegistrationNumber(" u72900-mh-2020 "), "U72900MH2020");
  assert.equal(policy.normalizeGstin(" 29abcde1234f1z5 "), "29ABCDE1234F1Z5");
  assert.equal(policy.isValidGstin("29ABCDE1234F1Z5"), true);
  assert.equal(policy.isValidGstin("NOT-A-GSTIN"), false);
});

test("company names match across punctuation and legal suffixes only", () => {
  assert.equal(policy.namesMatch("Acme Technologies Pvt. Ltd.", "ACME TECHNOLOGIES PRIVATE LIMITED"), true);
  assert.equal(policy.namesMatch("Acme Technologies", "Acme Logistics"), false);
  assert.equal(policy.namesMatch("", ""), false, "an empty name never matches");
});

test("website hosts are reduced to the bare domain and invalid URLs are rejected", () => {
  assert.equal(policy.normalizeWebsiteHost("https://www.Acme.example/careers"), "acme.example");
  assert.equal(policy.normalizeWebsiteHost("acme.example"), "acme.example");
  assert.equal(policy.normalizeWebsiteHost("javascript:alert(1)"), "");
  assert.equal(policy.normalizeWebsiteHost(""), "");
});

test("file names: normal names are kept, including their extension", () => {
  assert.equal(policy.sanitizeFileName("cv.pdf"), "cv.pdf");
  assert.equal(policy.sanitizeFileName("Jane Doe - Resume (2026).docx"), "Jane Doe - Resume (2026).docx");
  assert.equal(policy.sanitizeFileName("archive.tar.gz"), "archive.tar.gz");
  assert.equal(policy.sanitizeFileName("  spaced   out.pdf  "), "spaced out.pdf");
});

test("file names: Unix and Windows paths reduce to the final file name on every platform", () => {
  assert.equal(policy.sanitizeFileName("../../etc/passwd"), "passwd");
  assert.equal(policy.sanitizeFileName("/etc/passwd"), "passwd");
  assert.equal(policy.sanitizeFileName("C:\\Users\\me\\cv.pdf"), "cv.pdf");
  assert.equal(policy.sanitizeFileName("..\\..\\secret\\cv.pdf"), "cv.pdf");
  assert.equal(policy.sanitizeFileName("folder/sub\\file.pdf"), "file.pdf");
  assert.equal(policy.sanitizeFileName("folder/"), "document", "a trailing separator leaves no file name");
});

test("file names: unsafe characters are removed from the name, which is kept", () => {
  assert.equal(policy.sanitizeFileName('bad"name.pdf'), "badname.pdf");
  assert.equal(policy.sanitizeFileName("semi;colon.pdf"), "semicolon.pdf");
  assert.equal(policy.sanitizeFileName("tab\tname.pdf"), "tabname.pdf");
  assert.equal(policy.sanitizeFileName("nul\u0000name.pdf"), "nulname.pdf");
  assert.equal(policy.sanitizeFileName("del\u007fname.pdf"), "delname.pdf");
  assert.equal(policy.sanitizeFileName('bad"name\\.pdf'), "document", "the segment after the backslash is only an extension, so it falls back");
});

test("file names: Windows-invalid characters (: * ? < > |) are removed and the extension is kept", () => {
  assert.equal(policy.sanitizeFileName("cv:name.pdf"), "cvname.pdf");
  assert.equal(policy.sanitizeFileName("cv*name.pdf"), "cvname.pdf");
  assert.equal(policy.sanitizeFileName("cv?name.pdf"), "cvname.pdf");
  assert.equal(policy.sanitizeFileName("cv<name>.pdf"), "cvname.pdf");
  assert.equal(policy.sanitizeFileName("cv|name.pdf"), "cvname.pdf");
  assert.equal(policy.sanitizeFileName("cv:*?<>|name.docx"), "cvname.docx");
  assert.equal(policy.sanitizeFileName("report: final.pdf"), "report final.pdf", "spaces around the removed character are kept");
  assert.equal(policy.sanitizeFileName("C:\\cv.pdf"), "cv.pdf", "a drive prefix is a path, not part of the name");
  assert.equal(policy.sanitizeFileName("cv?.pdf"), "cv.pdf");
});

test("file names: a leading drive prefix is path syntax, even without a separator", () => {
  assert.equal(policy.sanitizeFileName("C:cv.pdf"), "cv.pdf");
  assert.equal(policy.sanitizeFileName("D:folder\\cv.pdf"), "cv.pdf");
  assert.equal(policy.sanitizeFileName("z:cv.pdf"), "cv.pdf", "any drive letter is recognised");
  assert.equal(policy.sanitizeFileName("C:"), "document", "a bare drive leaves no name");
  assert.equal(policy.sanitizeFileName("cv:name.pdf"), "cvname.pdf", "a colon that is not a drive prefix is removed");
  assert.equal(policy.sanitizeFileName("1:cv.pdf"), "1cv.pdf", "a digit before the colon is not a drive");
  assert.equal(policy.sanitizeFileName("my:C:cv.pdf"), "myCcv.pdf", "only a leading prefix is treated as a drive");
});

test("file names: a name made only of Windows-invalid characters falls back to 'document'", () => {
  assert.equal(policy.sanitizeFileName("::"), "document");
  assert.equal(policy.sanitizeFileName("*?"), "document");
  assert.equal(policy.sanitizeFileName("<>|"), "document");
  assert.equal(policy.sanitizeFileName("?.pdf"), "document", "removing the ? leaves only an extension");
});

test("file names: Windows-invalid characters count toward the limit and the extension survives truncation", () => {
  const max = rules.DOCUMENT_LIMITS.maxFileNameLength;
  const out = policy.sanitizeFileName(`${"x?".repeat(300)}.pdf`);
  assert.equal(out.length, max);
  assert.ok(out.endsWith(".pdf"));
  assert.doesNotMatch(out, /[:*?<>|]/);
});

test("file names: a segment with no base name falls back to 'document', never to a bare extension", () => {
  assert.equal(policy.sanitizeFileName(".pdf"), "document");
  assert.equal(policy.sanitizeFileName("  .pdf  "), "document");
  assert.equal(policy.sanitizeFileName(".hidden"), "document");
  assert.equal(policy.sanitizeFileName("C:\\temp\\.pdf"), "document");
  assert.equal(policy.sanitizeFileName("..."), "document");
  assert.equal(policy.sanitizeFileName('"""'), "document", "only unsafe characters remain");
  assert.equal(policy.sanitizeFileName("\u0000.pdf"), "document");
  assert.equal(policy.sanitizeFileName("a.pdf"), "a.pdf", "a one-character base name is still a base name");
});

test("file names: empty, blank and dot-only names fall back to 'document'", () => {
  assert.equal(policy.sanitizeFileName(""), "document");
  assert.equal(policy.sanitizeFileName(undefined), "document");
  assert.equal(policy.sanitizeFileName(null), "document");
  assert.equal(policy.sanitizeFileName("   "), "document");
  assert.equal(policy.sanitizeFileName("."), "document");
  assert.equal(policy.sanitizeFileName(".."), "document");
  assert.equal(policy.sanitizeFileName("../"), "document");
  assert.equal(policy.sanitizeFileName("\\"), "document");
});

test("file names: the result never contains a separator, a control character, a quote or a Windows-invalid character", () => {
  const hostile = [
    "../../../../etc/passwd",
    "..\\..\\..\\windows\\system32\\cv.pdf",
    'a"b;c\\d/e.pdf',
    "x\u0000\u0001\u001f.pdf",
    "C:\\temp\\file\u0007.pdf",
    "cv:*?<>|name.pdf",
  ];
  for (const input of hostile) {
    const out = policy.sanitizeFileName(input);
    assert.ok(out.length > 0, `non-empty for ${JSON.stringify(input)}`);
    assert.doesNotMatch(out, /[\\/\u0000-\u001f\u007f";:*?<>|]/, `clean for ${JSON.stringify(input)}`);
    assert.notEqual(out, ".");
    assert.notEqual(out, "..");
  }
});

test("file names: long names are cut to the maximum length", () => {
  const out = policy.sanitizeFileName("x".repeat(500));
  assert.equal(out.length, rules.DOCUMENT_LIMITS.maxFileNameLength);
});

test("file names: truncation keeps a valid extension such as .pdf", () => {
  const max = rules.DOCUMENT_LIMITS.maxFileNameLength;
  const long = policy.sanitizeFileName(`${"x".repeat(300)}.pdf`);
  assert.equal(long.length, max);
  assert.ok(long.endsWith(".pdf"), `expected .pdf to survive, got ...${long.slice(-12)}`);
  assert.equal(long, `${"x".repeat(max - 4)}.pdf`);

  const fromWindowsPath = policy.sanitizeFileName(`C:\\Users\\me\\${"y".repeat(300)}.docx`);
  assert.equal(fromWindowsPath.length, max);
  assert.ok(fromWindowsPath.endsWith(".docx"));
  assert.ok(!fromWindowsPath.includes("C:"), "the folder part is removed before truncation");
});

test("file names: truncation without a valid extension cuts the name and never leaves a bare extension", () => {
  const max = rules.DOCUMENT_LIMITS.maxFileNameLength;
  const noExtension = policy.sanitizeFileName("z".repeat(300));
  assert.equal(noExtension.length, max);
  // An extension longer than 10 characters is not treated as one.
  const longExtension = policy.sanitizeFileName(`${"w".repeat(300)}.abcdefghijklmnop`);
  assert.equal(longExtension.length, max);
  assert.ok(!longExtension.endsWith(".abcdefghijklmnop"));
  // Spaces before the extension are trimmed; the result still ends with the extension.
  const spaced = policy.sanitizeFileName(`${"s ".repeat(100)}.pdf`);
  assert.ok(spaced.length <= max && spaced.endsWith(".pdf") && !spaced.includes("  "));
});

// ---------------------------------------------------------------------------
// Checklist and assessment
// ---------------------------------------------------------------------------

test("every required checklist item passing gives verified_evidence", () => {
  const checklist = policy.summarizeChecklist({
    records: [match("business_registration"), match("business_email", "email_token"), match("recruiter_identity", "system_rule"), match("duplicate_review", "system_rule")],
  });
  assert.deepEqual(checklist.missing, []);
  assert.deepEqual(checklist.blockers, []);
  assert.equal(checklist.assessment, "verified_evidence");
});

test("a registration mismatch blocks and yields mismatch, never verified", () => {
  const checklist = policy.summarizeChecklist({
    records: [
      { type: "business_registration", result: "mismatch", method: "external_registry", recordedAt: at(1) },
      match("business_email", "email_token"),
      match("recruiter_identity", "system_rule"),
      match("duplicate_review", "system_rule"),
    ],
  });
  assert.equal(checklist.assessment, "mismatch");
  assert.deepEqual(checklist.blockers, ["business_registration"]);
  assert.ok(checklist.missing.includes("business_registration"));
});

test("an unavailable registry leaves the case awaiting manual verification", () => {
  const checklist = policy.summarizeChecklist({
    records: [
      { type: "business_registration", result: "unavailable", method: "system_rule", recordedAt: at(1) },
      match("business_email", "email_token"),
      match("recruiter_identity", "system_rule"),
      match("duplicate_review", "system_rule"),
    ],
  });
  assert.equal(checklist.assessment, "unavailable_evidence");
  assert.deepEqual(checklist.blockers, [], "unavailable is not a blocker, it is missing evidence");
});

test("missing evidence is reported as missing, not as a finding against the company", () => {
  const checklist = policy.summarizeChecklist({ records: [] });
  assert.equal(checklist.assessment, "manual_review");
  assert.deepEqual(checklist.blockers, []);
  assert.deepEqual(checklist.missing.sort(), [...rules.REQUIRED_CHECKS].sort());
});

test("system defaults fill unrecorded checks but never override a recorded result", () => {
  const defaults = {
    business_email: { result: "match", method: "email_token" },
    recruiter_identity: { result: "match", method: "system_rule" },
    duplicate_review: { result: "match", method: "system_rule" },
  };
  const withoutRecord = policy.summarizeChecklist({ records: [], defaults });
  assert.equal(withoutRecord.current.business_email.source, "system");
  assert.deepEqual(withoutRecord.missing, ["business_registration"]);

  const overridden = policy.summarizeChecklist({
    records: [{ type: "business_email", result: "concern", method: "manual_review", recordedAt: at(5) }],
    defaults,
  });
  assert.equal(overridden.current.business_email.result, "concern", "a recorded concern wins over the default");
  assert.ok(overridden.blockers.includes("business_email"));
});

test("the most recent record for a check decides, regardless of array order", () => {
  const checklist = policy.summarizeChecklist({
    records: [
      { type: "business_registration", result: "match", method: "manual_review", recordedAt: at(10) },
      { type: "business_registration", result: "mismatch", method: "manual_review", recordedAt: at(2) },
    ],
  });
  assert.equal(checklist.current.business_registration.result, "match");
});

// ---------------------------------------------------------------------------
// Risk indicators
// ---------------------------------------------------------------------------

test("a clean profile has no manual-review trigger", () => {
  const risk = policy.computeRisk(cleanFacts());
  assert.equal(risk.level, "low");
  assert.equal(risk.requiresManualReview, false);
});

test("a webmail address alone is an indicator, never proof, and stays below the medium band", () => {
  const risk = policy.computeRisk(cleanFacts({ isWebmail: true, emailDomain: "gmail.com" }));
  const codes = risk.indicators.map((i) => i.code);
  assert.ok(codes.includes("FREE_WEBMAIL_DOMAIN"));
  assert.equal(risk.score, rules.RISK_RULES.FREE_WEBMAIL_DOMAIN.weight);
  assert.equal(risk.level, "low");
  assert.match(risk.indicators[0].explanation, /not proof/);
});

test("missing identifiers and websites are informational and carry no weight", () => {
  const risk = policy.computeRisk(cleanFacts({ gstin: "", websiteHost: "", registrationNumber: "" }));
  const info = risk.indicators.filter((i) => ["MISSING_WEBSITE", "MISSING_REGISTRATION_IDENTIFIER"].includes(i.code));
  assert.equal(info.length, 2);
  assert.ok(info.every((i) => i.weight === 0));
  assert.equal(risk.score, 0);
});

test("a duplicate registration is high severity: it requires manual review but never restricts", () => {
  const risk = policy.computeRisk(cleanFacts({ duplicates: { registration: 1, profile: 0 } }));
  const duplicate = risk.indicators.find((i) => i.code === "DUPLICATE_REGISTRATION");
  assert.equal(duplicate.severity, "high");
  assert.equal(risk.requiresManualReview, true);
  assert.equal(risk.disclaimer, rules.RISK_DISCLAIMER);
  assert.match(risk.disclaimer, /not proof of fraud/);
});

test("the score is capped at 100 and bands follow the configured thresholds", () => {
  const heavy = policy.computeRisk(
    cleanFacts({
      duplicates: { registration: 1, profile: 1 },
      registrationMismatch: true,
      previousEnforcementCount: 2,
      paymentDemandKeyword: "registration fee",
      gstin: "BADGSTIN",
      gstinValid: false,
      recentJobCount: 99,
    }),
  );
  assert.equal(heavy.score, 100);
  assert.equal(heavy.level, "high");
  assert.equal(policy.scoreToLevel(24), "low");
  assert.equal(policy.scoreToLevel(25), "medium");
  assert.equal(policy.scoreToLevel(59), "medium");
  assert.equal(policy.scoreToLevel(60), "high");
});

test("every indicator carries a code, severity, weight and a non-empty explanation", () => {
  const risk = policy.computeRisk(
    cleanFacts({ gstin: "", websiteHost: "", businessEmail: "", emailDomain: "", documentCount: 0, recruiterEmailVerified: false, rejectedJobCount: 3, duplicateJobTitles: true, unrealisticSalary: true, recentJobCount: 11 }),
  );
  for (const indicator of risk.indicators) {
    assert.ok(indicator.code && indicator.severity && typeof indicator.weight === "number", indicator.code);
    assert.ok(indicator.explanation.length > 10, indicator.code);
  }
});

// ---------------------------------------------------------------------------
// Next action and documents
// ---------------------------------------------------------------------------

test("the recommended next action follows blockers, then missing checks, then risk", () => {
  const ready = { blockers: [], missing: [] };
  const calm = { requiresManualReview: false };
  assert.match(policy.recommendNextAction({ caseStatus: "under_review", checklist: ready, risk: calm }), /may approve/);
  assert.match(
    policy.recommendNextAction({ caseStatus: "under_review", checklist: { blockers: ["business_registration"], missing: [] }, risk: calm }),
    /Resolve blocking checks/,
  );
  const missing = policy.recommendNextAction({
    caseStatus: "under_review",
    checklist: { blockers: [], missing: ["business_email"] },
    risk: calm,
  });
  assert.match(missing, /Manual verification required/);
  assert.match(
    policy.recommendNextAction({ caseStatus: "under_review", checklist: ready, risk: { requiresManualReview: true } }),
    /elevated-risk/,
  );
});

const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(64, 0x20)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);

test("documents are accepted only when their bytes match the declared type", () => {
  assert.deepEqual(policy.validateDocumentContent(pdf, "application/pdf"), { mime: "application/pdf", extension: ".pdf" });
  assert.equal(policy.validateDocumentContent(png, "image/png").mime, "image/png");
  assert.equal(policy.validateDocumentContent(jpg, "image/jpeg").mime, "image/jpeg");
});

test("a file whose bytes disagree with its declared type is refused", () => {
  assert.throws(() => policy.validateDocumentContent(pdf, "image/png"), (e) => e.code === "FILE_TYPE_MISMATCH");
});

test("an unrecognised file (for example a script) is refused by content, not by extension", () => {
  const script = Buffer.from("<script>alert(1)</script>");
  assert.throws(() => policy.validateDocumentContent(script, "application/pdf"), (e) => e.code === "UNSUPPORTED_FILE_TYPE");
});

test("PDFs with active-content markers are refused", () => {
  const active = Buffer.concat([pdf, Buffer.from("\n/OpenAction << /S /JavaScript >>")]);
  assert.throws(() => policy.validateDocumentContent(active, "application/pdf"), (e) => e.code === "ACTIVE_CONTENT_DETECTED");
});

test("empty and oversized files are refused", () => {
  assert.throws(() => policy.validateDocumentContent(Buffer.alloc(0), "application/pdf"), (e) => e.code === "EMPTY_FILE");
  const big = Buffer.alloc(rules.DOCUMENT_LIMITS.maxBytes + 1);
  big.write("%PDF-", 0, "latin1");
  assert.throws(() => policy.validateDocumentContent(big, "application/pdf"), (e) => e.code === "FILE_TOO_LARGE");
});

// ---------------------------------------------------------------------------
// Rules and registry integration point
// ---------------------------------------------------------------------------

test("the checklist covers every item the Master Prompt lists (Requirement 1, section B)", () => {
  for (const type of [
    "business_registration",
    "business_identity",
    "recruiter_identity",
    "business_email",
    "website_consistency",
    "address_consistency",
    "duplicate_review",
    "job_policy_review",
    "enforcement_history",
    "document_review",
  ]) {
    assert.ok(rules.CHECK_TYPES.includes(type), type);
  }
  for (const required of rules.REQUIRED_CHECKS) assert.ok(rules.CHECK_TYPES.includes(required));
});

test("without a configured registry, every lookup is honestly unavailable", async () => {
  registry.setRegistryProvider(null);
  const answer = await registry.lookupRegistry({ registrationNumber: "U72900MH2020PTC000001", legalName: "Acme" });
  assert.equal(answer.status, "unavailable");
  assert.match(answer.reason, /No company registry integration/);
});

test("a configured registry must use HTTPS; a plain HTTP URL is refused without a request", async () => {
  registry.setRegistryProvider(null);
  process.env.COMPANY_REGISTRY_URL = "http://registry.example/lookup";
  try {
    const answer = await registry.lookupRegistry({ registrationNumber: "X", legalName: "Acme" });
    assert.equal(answer.status, "unavailable");
    assert.match(answer.reason, /HTTPS/);
  } finally {
    delete process.env.COMPANY_REGISTRY_URL;
  }
});

test("an injected provider answers in tests; the default is restored when cleared", async () => {
  registry.setRegistryProvider(async () => ({ status: "found", legalName: "Acme Ltd" }));
  assert.equal((await registry.lookupRegistry({ legalName: "x" })).status, "found");
  registry.setRegistryProvider(null);
  assert.equal((await registry.lookupRegistry({ legalName: "x" })).status, "unavailable");
});
