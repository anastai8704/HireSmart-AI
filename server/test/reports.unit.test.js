// Phase 10 unit tests: CSV safety, report audiences, and the personal-data rule. No database needed.
process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const test = require("node:test");
const { REPORTS, REPORT_TYPES, reportFor, toCsv, csvCell } = require("../services/reportService");

test("CSV: formula-looking text is neutralised so spreadsheets cannot run it", () => {
  for (const dangerous of ["=HYPERLINK(\"http://x\")", "+SUM(1)", "-2+3", "@cmd", "\tcmd", "\rcmd"]) {
    const cell = csvCell(dangerous);
    const unquoted = cell.replace(/^"|"$/g, "").replace(/""/g, '"');
    assert.ok(unquoted.startsWith("'"), `not neutralised: ${JSON.stringify(dangerous)} -> ${cell}`);
  }
});

test("CSV: commas, quotes and line breaks are quoted; numbers stay numeric", () => {
  assert.equal(csvCell("a,b"), "\"a,b\"");
  assert.equal(csvCell("say \"hi\""), "\"say \"\"hi\"\"\"");
  assert.equal(csvCell("line\nbreak"), "\"line\nbreak\"");
  assert.equal(csvCell(-3), "-3");
  assert.equal(csvCell(12.5), "12.5");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(false), "FALSE");
});

test("CSV: header row and CRLF line endings", () => {
  const csv = toCsv([{ key: "a", label: "A" }, { key: "b", label: "B" }], [{ a: "x", b: 1 }]);
  assert.equal(csv, "A,B\r\nx,1\r\n");
});

test("audiences: platform-only reports are refused to organisation members", () => {
  for (const type of ["candidate_registrations", "company_verification", "job_moderation", "revenue", "platform_activity"]) {
    assert.equal(reportFor(type, "organization"), null, type);
    assert.ok(reportFor(type, "admin"), type);
  }
  for (const type of ["job_postings", "applications", "hiring_pipeline", "employment_records", "subscriptions", "payments"]) {
    assert.ok(reportFor(type, "organization"), type);
  }
  assert.equal(reportFor("does_not_exist", "admin"), null);
});

test("personal data: no report exposes names, e-mail, phone, address or resume columns", () => {
  const forbidden = /email|phone|address|resume|displayName|firstName|lastName|fullName|name$|signature|secret/i;
  for (const type of REPORT_TYPES) {
    for (const column of REPORTS[type].columns) {
      if (column.key === "company") continue; // company (business) name is part of the employer record, not a person
      assert.ok(!forbidden.test(column.key), `${type}.${column.key} may carry personal or secret data`);
    }
  }
});

test("every report declares a valid audience and at least one column", () => {
  for (const type of REPORT_TYPES) {
    const report = REPORTS[type];
    assert.ok(report.audience.length >= 1 && report.audience.every((a) => ["admin", "organization"].includes(a)), type);
    assert.ok(report.columns.length >= 1, type);
    assert.equal(typeof report.build, "function", type);
  }
});
