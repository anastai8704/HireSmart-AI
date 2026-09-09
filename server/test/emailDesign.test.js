process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const test = require("node:test");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const Notification = require("../models/Notification");
const JobRun = require("../models/JobRun");
const { notify } = require("../services/notificationService");
const emailService = require("../services/emailService");
const { security } = require("../services/auditService");
const {
  renderEmail,
  roleLabel,
  fmtDate,
  fmtDateTime,
} = require("../services/email/templates");
const { buildNotificationEmail } = require("../services/email/notificationEmails");

const parseJsonTransport = (result) => JSON.parse(result.message);

/* ---------------------------- template engine ---------------------------- */

test("renderEmail escapes every dynamic value", () => {
  const out = renderEmail({
    subject: "Subject <script>alert(1)</script>",
    greeting: "Hi <b>Bella</b>,",
    title: "Title & \"quotes\"",
    body: ["Body <img src=x onerror=alert(1)>"],
    details: [
      { label: "<script>", value: "value<script>" },
      { label: "Empty", value: "" },
    ],
    cta: { label: "Go <nowhere>", url: "https://x.test/?a=<b>&c=\"d\"" },
    note: { tone: "info", text: "Note <style>" },
    footerNote: "Foot <i>note</i>",
  });
  for (const snippet of ["<script>", "<b>", "<img", "<style>", "<nowhere>", "<i>"])
    assert.ok(!out.html.includes(snippet), `html must not contain raw ${snippet}`);
  assert.ok(out.html.includes("&lt;script&gt;"));
  // the text version carries the raw values (plain text — no rendering risk)
  assert.ok(out.text.includes("Hi <b>Bella</b>,"));
  assert.ok(out.text.includes("Body <img src=x onerror=alert(1)>"));
});

test("renderEmail carries the premium layout landmarks", () => {
  const out = renderEmail({
    subject: "Hello",
    title: "Hello",
    body: ["Line one."],
    cta: { label: "Continue", url: "https://x.test/next" },
  });
  assert.ok(out.html.includes('name="viewport"'));
  assert.ok(out.html.includes("HireSmart"));
  assert.ok(out.html.includes("&#9670;")); // brand mark: H + cyan match spark
  assert.ok(out.html.includes("You're receiving this email because of your HireSmart AI account."));
  assert.ok(out.html.includes('href="http://localhost:5173/privacy"'));
  assert.ok(out.html.includes("https://x.test/next"));
  assert.ok(out.html.includes("Continue"));
  assert.ok(out.text.includes("Continue:"));
  assert.ok(out.text.includes("https://x.test/next"));
  // no unresolved template placeholders may leak into the HTML
  assert.ok(!/\$\{[a-zA-Z_.]+\}/.test(out.html), "html must not contain ${...} placeholders");
});

test("renderEmail drops empty detail rows and note when unused", () => {
  const out = renderEmail({ subject: "S", title: "T", details: [{ label: "X", value: "" }] });
  assert.ok(!out.html.includes(">X</td>"));
  assert.ok(!out.html.includes("border-bottom"));
  assert.ok(!out.text.includes("X:"));
});

test("label and date helpers", () => {
  assert.equal(roleLabel("hiring_manager"), "Hiring Manager");
  assert.equal(roleLabel("owner"), "Owner");
  assert.equal(fmtDate(new Date(Date.UTC(2026, 8, 8))), "8 September 2026");
  const dt = fmtDateTime(new Date(Date.UTC(2026, 8, 8, 12, 0)), "Asia/Kolkata");
  assert.ok(dt.includes("Asia/Kolkata"));
  assert.ok(dt.includes("2026"));
  assert.ok(dt.includes("Tue"));
});

/* ------------------------------ direct emails ---------------------------- */

test("invitation email has the mandated copy and details", async () => {
  const result = await emailService.sendInviteEmail({
    to: "jane@company.com",
    orgName: "BlueOrbit Technologies",
    role: "hiring_manager",
    link: "http://localhost:5173/accept-invite?token=abc123",
    inviterName: "Priya Sharma",
    expiresAt: new Date(Date.UTC(2026, 8, 15, 10, 0)),
  });
  const msg = parseJsonTransport(result);
  assert.equal(msg.subject, "You're invited to join BlueOrbit Technologies");
  assert.ok(msg.html.includes("Priya Sharma invited you to join BlueOrbit Technologies as a Hiring Manager"));
  assert.ok(msg.html.includes(">Accept Invitation</a>"));
  assert.ok(msg.html.includes('href="http://localhost:5173/accept-invite?token=abc123"'));
  assert.ok(msg.html.includes("BlueOrbit Technologies"));
  assert.ok(msg.html.includes("Hiring Manager"));
  assert.ok(msg.html.includes("15 September 2026"));
  assert.ok(msg.html.includes("only valid for jane@company.com"));
  assert.ok(msg.text.includes("Role: Hiring Manager"));
  assert.ok(msg.text.includes("http://localhost:5173/accept-invite?token=abc123"));
  assert.ok(!/\$\{[a-zA-Z_.]+\}/.test(msg.html), "no ${...} placeholders in invitation html");
});

test("password reset email has CTA, expiry, security note and ignore message", async () => {
  const result = await emailService.sendPasswordResetEmail({
    email: "jane@company.com",
    token: "reset-token",
    name: "Jane",
  });
  const msg = parseJsonTransport(result);
  assert.equal(msg.subject, "Reset your HireSmart AI password");
  assert.ok(msg.html.includes("We received a request to reset your password."));
  assert.ok(msg.html.includes(">Reset Password</a>"));
  assert.ok(msg.html.includes('href="http://localhost:5173/auth/reset-password?token=reset-token"'));
  assert.ok(msg.html.includes("1 hour"));
  assert.ok(msg.html.includes("If you did not request a password reset, ignore this email."));
  assert.ok(msg.html.includes("Hi Jane,"));
  assert.ok(msg.text.includes("Link expires in: 1 hour"));
});

test("verification and email-change emails render through the layout", async () => {
  const verify = parseJsonTransport(
    await emailService.sendVerificationEmail({ email: "j@x.com", token: "v1", name: "Jo" }),
  );
  assert.ok(verify.html.includes(">Verify Email</a>"));
  assert.ok(verify.html.includes("http://localhost:5173/verify-email?token=v1"));
  assert.ok(verify.html.includes("Hi Jo,"));

  const change = parseJsonTransport(
    await emailService.sendEmailChangeEmail({ email: "new@x.com", token: "c1", name: "Jo" }),
  );
  assert.ok(change.html.includes(">Confirm New Email</a>"));
  assert.ok(change.html.includes("http://localhost:5173/change-email?token=c1"));
  assert.ok(change.html.includes("new@x.com"));
});

/* -------------------------- notification builders ------------------------ */

const interviewContext = {
  jobTitle: "Frontend Engineer",
  company: "BlueOrbit Technologies",
  scheduledStart: new Date(Date.UTC(2026, 8, 15, 9, 30)),
  timezone: "Asia/Kolkata",
  type: "online",
  interviewId: "interview-1",
};

test("job approval email uses the mandated copy and dynamic data", () => {
  const out = buildNotificationEmail({
    type: "job_moderation",
    subject: "Job approved: Frontend Engineer",
    message: "approved",
    context: {
      jobTitle: "Frontend Engineer",
      company: "BlueOrbit Technologies",
      location: "Bengaluru",
      organizationId: "org-1",
      jobId: "job-1",
      approved: true,
    },
  });
  assert.equal(out.subject, "Job approved: Frontend Engineer");
  assert.ok(
    out.text.includes(
      "Your job \"Frontend Engineer\" has been approved and is now available according to the platform's approval rules.",
    ),
  );
  assert.ok(out.html.includes("has been approved and is now available"));
  assert.ok(out.html.includes(">View Job</a>"));
  assert.ok(out.html.includes("http://localhost:5173/app/o/org-1/jobs/job-1/applications"));
  assert.ok(out.html.includes("BlueOrbit Technologies"));
});

test("job rejection email carries the reason and a warning note", () => {
  const out = buildNotificationEmail({
    type: "job_moderation",
    subject: "Job rejected: Frontend Engineer",
    message: "rejected",
    context: {
      jobTitle: "Frontend Engineer",
      company: "BlueOrbit Technologies",
      approved: false,
      reason: "Duplicate posting",
      organizationId: "org-1",
      jobId: "job-1",
    },
  });
  assert.equal(out.subject, "Job rejected: Frontend Engineer");
  assert.ok(out.html.includes("Reason: Duplicate posting"));
  assert.ok(out.html.includes("not visible to candidates"));
  assert.ok(!out.html.includes("has been approved"));
});

test("job submitted email is dynamic and links to the org jobs", () => {
  const out = buildNotificationEmail({
    type: "job_submitted_for_approval",
    subject: "Job submitted: Data Engineer",
    message: "submitted",
    context: {
      jobTitle: "Data Engineer",
      company: "BlueOrbit Technologies",
      location: "Remote",
      organizationId: "org-1",
    },
  });
  assert.ok(out.html.includes("Data Engineer"));
  assert.ok(out.html.includes("Pending approval"));
  assert.ok(out.html.includes("http://localhost:5173/app/o/org-1/jobs"));
});

test("application emails are personalised with the candidate and job", () => {
  const ack = buildNotificationEmail({
    type: "application_acknowledged",
    subject: "Application received",
    message: "received",
    context: {
      name: "Jane Doe",
      jobTitle: "Frontend Engineer",
      company: "BlueOrbit Technologies",
      applicationId: "app-1",
      appliedAt: new Date(Date.UTC(2026, 8, 8)),
    },
  });
  assert.ok(ack.html.includes("Hi Jane,"));
  assert.ok(ack.html.includes("Frontend Engineer"));
  assert.ok(ack.html.includes("BlueOrbit Technologies"));
  assert.ok(ack.html.includes("8 September 2026"));
  assert.ok(ack.html.includes("http://localhost:5173/app/candidate/applications/app-1"));

  const shortlisted = buildNotificationEmail({
    type: "application_status_changed",
    subject: "You've been shortlisted",
    message: "shortlisted",
    context: {
      name: "Jane",
      jobTitle: "Frontend Engineer",
      company: "BlueOrbit Technologies",
      statusLabel: "shortlisted",
      toStatus: "shortlisted",
      applicationId: "app-1",
    },
  });
  assert.ok(shortlisted.text.includes("You've been shortlisted"));
  assert.ok(shortlisted.text.includes("Status: shortlisted"));
  assert.ok(shortlisted.html.includes("Status"));
});

test("interview emails include time, format and the right CTAs", () => {
  const invite = buildNotificationEmail({
    type: "interview_invitation",
    subject: "Interview invitation: Frontend Engineer",
    message: "invited",
    context: { ...interviewContext, name: "Jane" },
  });
  assert.ok(invite.html.includes("Hi Jane,"));
  assert.ok(invite.html.includes("Video call"));
  assert.ok(invite.html.includes("Asia/Kolkata"));
  assert.ok(invite.html.includes("2026"));
  assert.ok(invite.html.includes("http://localhost:5173/app/candidate/interviews/interview-1"));

  const rescheduled = buildNotificationEmail({
    type: "interview_rescheduled",
    subject: "Interview rescheduled: Frontend Engineer",
    message: "rescheduled",
    context: { ...interviewContext, name: "Jane" },
  });
  assert.ok(rescheduled.html.includes("New date &amp; time"));

  const confirmed = buildNotificationEmail({
    type: "interview_confirmed",
    subject: "Interview confirmed: Frontend Engineer",
    message: "confirmed",
    context: {
      ...interviewContext,
      candidateName: "Jane Doe",
      organizationId: "org-1",
    },
  });
  assert.ok(confirmed.html.includes("Jane Doe confirmed"));
  assert.ok(confirmed.html.includes("http://localhost:5173/app/o/org-1/interviews/interview-1"));
});

test("security alert email explains the event and offers recovery", () => {
  const out = buildNotificationEmail({
    type: "security_alert",
    subject: "Important security alert",
    message: "alert",
    context: {
      name: "Jane",
      event: "session.refresh_token_reuse",
      at: new Date(Date.UTC(2026, 8, 8, 14, 30)),
    },
  });
  assert.equal(out.subject, "Important security alert");
  assert.ok(out.html.includes("Possible session takeover"));
  assert.ok(out.html.includes(">Reset your password</a>"));
  assert.ok(out.html.includes("http://localhost:5173/auth/forgot-password"));
  assert.ok(out.text.includes("If this wasn't you"));
});

test("account security emails (password changed / email changed) are premium", () => {
  const pw = buildNotificationEmail({
    type: "password_changed",
    subject: "Password changed",
    message: "changed",
    context: { name: "Jane", at: new Date(Date.UTC(2026, 8, 8)) },
  });
  assert.ok(pw.html.includes("Hi Jane,"));
  assert.ok(pw.text.includes("If this wasn't you"));
  assert.ok(pw.html.includes("http://localhost:5173/auth/login"));

  const emailChanged = buildNotificationEmail({
    type: "email_changed",
    subject: "Email address updated",
    message: "updated",
    context: { name: "Jane", email: "new@x.com" },
  });
  assert.ok(emailChanged.html.includes("new@x.com"));
});

test("unknown event types fall back to a clean generic render", () => {
  const out = buildNotificationEmail({
    type: "something_new",
    subject: "Heads up",
    message: "A new thing happened.",
  });
  assert.equal(out.subject, "Heads up");
  assert.ok(out.html.includes("A new thing happened."));
  assert.ok(out.html.includes("HireSmart"));
  assert.ok(out.html.includes("&#9670;")); // brand mark: H + cyan match spark
});

/* ------------------------------- integration ----------------------------- */

const createUser = async (overrides = {}) =>
  User.create({
    name: "Email Test User",
    email: `email-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`,
    password: "StrongPassword123!",
    ...overrides,
  });

const waitFor = async (fn, ms = 4000) => {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

test("notify() with emailContext delivers a premium email through the queue", async () => {
  await startDatabase();
  await clearDatabase();
  try {
    const user = await createUser({ name: "Jane Doe" });
    const notification = await notify({
      user: user._id,
      organization: null,
      type: "application_acknowledged",
      category: "applications",
      title: "Application received",
      message: "Your application for Frontend Engineer was received.",
      resourceType: "application",
      resourceId: "app-1",
      email: user.email,
      recipientName: user.name,
      emailContext: {
        jobTitle: "Frontend Engineer",
        company: "BlueOrbit Technologies",
        applicationId: "app-1",
      },
      idempotencyKey: `email-design:${user._id}:ack`,
    });
    assert.ok(notification, "notification should be created");
    const job = await JobRun.findOne({ type: "notification.email" }).select("+payload");
    assert.ok(job, "an email job should be enqueued");
    assert.equal(job.payload.context.jobTitle, "Frontend Engineer");
    assert.equal(job.payload.context.name, "Jane Doe");
    // processJobsInline is true in tests — the email already went through jsonTransport
    const fresh = await Notification.findById(notification._id);
    assert.equal(fresh.delivery.email, "sent");
    assert.equal(job.status, "completed");
  } finally {
    await stopDatabase();
  }
});

test("recipient email preferences still win over defaults", async () => {
  await startDatabase();
  await clearDatabase();
  try {
    const user = await createUser({
      notificationPrefs: {
        events: { application_acknowledged: { inApp: true, email: false } },
      },
    });
    const notification = await notify({
      user: user._id,
      type: "application_acknowledged",
      category: "applications",
      title: "Application received",
      message: "received",
      resourceType: "application",
      resourceId: "app-2",
      email: user.email,
      emailContext: { jobTitle: "Role", applicationId: "app-2" },
      idempotencyKey: `email-design:${user._id}:pref`,
    });
    assert.ok(notification, "in-app notification should still be created");
    const jobs = await JobRun.find({ type: "notification.email" });
    assert.equal(jobs.length, 0, "no email job when the recipient opted out of email");
    const fresh = await Notification.findById(notification._id);
    assert.equal(fresh.delivery.email, "not_requested");
  } finally {
    await stopDatabase();
  }
});

test("high-severity security events email the affected user", async () => {
  await startDatabase();
  await clearDatabase();
  try {
    const user = await createUser({ name: "Jane Doe" });
    await security({
      user: user._id,
      type: "session.refresh_token_reuse",
      severity: "high",
    });
    const notification = await waitFor(
      async () =>
        Notification.findOne({
          user: user._id,
          type: "security_alert",
        }),
    );
    assert.ok(notification, "the user should receive a security_alert notification");
    // the inline job (processJobsInline in tests) may already have flipped
    // the delivery state before this snapshot was read
    assert.ok(["queued", "sent"].includes(notification.delivery.email));
    // wait for the job to be completed — the handler saves the delivery
    // state before execute() marks the job completed, so this is deterministic
    const job = await waitFor(async () => {
      const jobs = await JobRun.find({ type: "notification.email", status: "completed" }).select(
        "+payload",
      );
      return jobs.find((j) => String(j.payload.notificationId) === String(notification._id)) || null;
    });
    assert.ok(job, "a security alert email job should be completed");
    assert.equal(job.payload.context.event, "session.refresh_token_reuse");
    const fresh = await Notification.findById(notification._id);
    assert.equal(fresh.delivery.email, "sent");
  } finally {
    await stopDatabase();
  }
});
