process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EVENTS,
  isAlwaysOn,
  templateForRole,
} = require("../config/notificationTypes");
const { resolveChannels } = require("../services/notificationService");
const {
  renderEmail,
} = require("../services/email/templates");
const { buildNotificationEmail } = require("../services/email/notificationEmails");

/* ----------------------------- 1. Catalog & Role Matrix ----------------------------- */

test("Notification event catalog contains comprehensive events for all roles", () => {
  const candidateEvents = [
    "application_acknowledged",
    "application_status_changed",
    "recruiter_message",
    "interview_invitation",
    "interview_rescheduled",
    "interview_cancelled",
    "job_alert",
    "resume_processed",
    "resume_processing_failed",
    "password_changed",
    "password_reset",
    "email_changed",
    "security_alert",
  ];

  const recruiterEvents = [
    "new_application",
    "application_withdrawn",
    "interview_confirmed",
    "interview_reschedule_requested",
    "job_submitted_for_approval",
    "job_moderation",
    "job_changes_submitted",
    "member_invited",
    "invitation_accepted",
    "member_role_changed",
    "member_removed",
    "password_changed",
    "security_alert",
  ];

  const adminEvents = [
    "job_submitted_for_approval",
    "job_changes_submitted",
    "organization_registered",
    "user_registered",
    "security_alert",
  ];

  for (const evt of candidateEvents) {
    assert.ok(EVENTS[evt]?.candidate, `Candidate should have view for ${evt}`);
  }
  for (const evt of recruiterEvents) {
    assert.ok(EVENTS[evt]?.recruiter, `Recruiter should have view for ${evt}`);
  }
  for (const evt of adminEvents) {
    assert.ok(EVENTS[evt]?.admin, `Admin should have view for ${evt}`);
  }
});

test("Role template generator correctly builds distinct role preference views", () => {
  const candidateTpl = templateForRole("candidate");
  const candidateGroups = candidateTpl.map((g) => g.key);
  assert.ok(candidateGroups.includes("applications"));
  assert.ok(candidateGroups.includes("interviews"));
  assert.ok(candidateGroups.includes("jobs"));
  assert.ok(candidateGroups.includes("ai_career"));
  assert.ok(candidateGroups.includes("security"));
  assert.ok(!candidateGroups.includes("approvals"));
  assert.ok(!candidateGroups.includes("team"));

  const recruiterTpl = templateForRole("recruiter");
  const recruiterGroups = recruiterTpl.map((g) => g.key);
  assert.ok(recruiterGroups.includes("jobs"));
  assert.ok(recruiterGroups.includes("candidates"));
  assert.ok(recruiterGroups.includes("interviews"));
  assert.ok(recruiterGroups.includes("team"));
  assert.ok(recruiterGroups.includes("security"));
  assert.ok(!recruiterGroups.includes("approvals"));

  const adminTpl = templateForRole("admin");
  const adminGroups = adminTpl.map((g) => g.key);
  assert.ok(adminGroups.includes("approvals"));
  assert.ok(adminGroups.includes("companies"));
  assert.ok(adminGroups.includes("users"));
  assert.ok(adminGroups.includes("security"));
  assert.ok(!adminGroups.includes("applications"));
});

test("Security and account events are always on across all roles", () => {
  assert.strictEqual(isAlwaysOn("password_changed", "candidate"), true);
  assert.strictEqual(isAlwaysOn("password_changed", "recruiter"), true);
  assert.strictEqual(isAlwaysOn("password_changed", "admin"), true);
  assert.strictEqual(isAlwaysOn("email_changed", "candidate"), true);
  assert.strictEqual(isAlwaysOn("security_alert", "recruiter"), true);

  // Non-security events are not always-on
  assert.strictEqual(isAlwaysOn("application_acknowledged", "candidate"), false);
  assert.strictEqual(isAlwaysOn("new_application", "recruiter"), false);
});

/* ----------------------------- 2. Preference Resolution ----------------------------- */

test("resolveChannels honors user event preferences, category fallbacks, and security overrides", () => {
  // 1. Security is always on even if user tried to disable it
  const secChannels = resolveChannels("password_changed", "candidate", {
    events: { password_changed: { inApp: false, email: false } },
  });
  assert.deepStrictEqual(secChannels, { inApp: true, email: true });

  // 2. User explicit event preference overrides default
  const disabledApp = resolveChannels("application_acknowledged", "candidate", {
    events: { application_acknowledged: { inApp: false, email: false } },
  });
  assert.deepStrictEqual(disabledApp, { inApp: false, email: false });

  // 3. User explicit enabled preference
  const enabledEmail = resolveChannels("new_application", "recruiter", {
    events: { new_application: { inApp: true, email: true } },
  });
  assert.deepStrictEqual(enabledEmail, { inApp: true, email: true });

  // 4. Default catalog behavior when no user preference is set
  const defaultCandidateApp = resolveChannels("application_acknowledged", "candidate", {});
  assert.deepStrictEqual(defaultCandidateApp, { inApp: true, email: true });

  const defaultRecruiterApp = resolveChannels("new_application", "recruiter", {});
  assert.deepStrictEqual(defaultRecruiterApp, { inApp: true, email: false });
});

/* ----------------------------- 3. Email Template Safety & Rendering ----------------------------- */

test("renderEmail sanitizes untrusted input, produces valid HTML and matching text", () => {
  const result = renderEmail({
    subject: "Test <script>alert('xss')</script>",
    preheader: "Preview & check",
    greeting: "Hi Candidate,",
    title: "Application Received",
    body: ["Your application for <script>alert(1)</script> Senior Lead was submitted."],
    details: [
      { label: "Role", value: "Senior Lead & Architect" },
      { label: "Company", value: "Acme Corp <marquee>" },
    ],
    cta: { label: "View Application", url: "https://example.com/apps/1" },
    note: { tone: "brand", text: "Decision support notice" },
  });

  assert.ok(!result.html.includes("<script>"));
  assert.ok(result.html.includes("&lt;script&gt;"));
  assert.ok(!result.html.includes("<marquee>"));
  assert.ok(result.html.includes("&lt;marquee&gt;"));

  assert.ok(result.html.includes("Senior Lead &amp; Architect"));
  assert.ok(result.html.includes("View Application"));
  assert.ok(result.html.includes("https://example.com/apps/1"));
  assert.ok(result.html.includes("HireSmart"));

  // Plain text mirror
  assert.ok(result.text.includes("Hi Candidate,"));
  assert.ok(result.text.includes("Senior Lead & Architect"));
  assert.ok(result.text.includes("https://example.com/apps/1"));
});

/* ----------------------------- 4. Specialized Email Builders ----------------------------- */

test("Candidate email builders render complete role context and CTAs", () => {
  // Application acknowledged
  const ack = buildNotificationEmail({
    type: "application_acknowledged",
    subject: "Application received: Full Stack",
    message: "Application confirmed",
    context: {
      name: "Alice",
      jobTitle: "Full Stack Engineer",
      company: "HireCorp",
      applicationId: "app-101",
      appliedAt: new Date("2026-09-09T10:00:00Z"),
    },
  });
  assert.ok(ack.html.includes("Full Stack Engineer"));
  assert.ok(ack.html.includes("HireCorp"));
  assert.ok(ack.html.includes("/app/candidate/applications/app-101"));

  // Interview invitation
  const invite = buildNotificationEmail({
    type: "interview_invitation",
    subject: "Interview invitation",
    message: "You are invited to an interview",
    context: {
      name: "Alice",
      jobTitle: "Full Stack Engineer",
      company: "HireCorp",
      scheduledStart: new Date("2026-09-15T14:00:00Z"),
      timezone: "UTC",
      type: "online",
      interviewId: "int-202",
    },
  });
  assert.ok(invite.html.includes("Video call"));
  assert.ok(invite.html.includes("Interview invitation"));
  assert.ok(invite.html.includes("/app/candidate/interviews/int-202"));

  // Resume processed
  const resume = buildNotificationEmail({
    type: "resume_processed",
    subject: "Resume processed",
    message: "Analysis ready",
    context: {
      name: "Alice",
      fileName: "Alice_Resume_2026.pdf",
      skillsCount: 14,
      versionId: "ver-303",
    },
  });
  assert.ok(resume.html.includes("Alice_Resume_2026.pdf"));
  assert.ok(resume.html.includes("14 skills"));
  assert.ok(resume.html.includes("/app/candidate/resumes/ver-303"));
});

test("Recruiter email builders render hiring team updates and candidate signals", () => {
  // New application
  const newApp = buildNotificationEmail({
    type: "new_application",
    subject: "New application",
    message: "New application received",
    context: {
      jobTitle: "Lead Architect",
      applicantName: "Bob Smith",
      organizationId: "org-1",
      applicationId: "app-404",
    },
  });
  assert.ok(newApp.html.includes("Lead Architect"));
  assert.ok(newApp.html.includes("Bob Smith"));
  assert.ok(newApp.html.includes("/app/o/org-1/applications/app-404"));

  // Job moderation approved
  const jobApproved = buildNotificationEmail({
    type: "job_moderation",
    subject: "Job approved",
    message: "approved",
    context: {
      jobTitle: "Lead Architect",
      company: "Tech Org",
      location: "Bengaluru",
      approved: true,
      organizationId: "org-1",
      jobId: "job-505",
    },
  });
  assert.ok(jobApproved.html.includes("Job approved"));
  assert.ok(jobApproved.html.includes("Tech Org"));

  // Team member invited
  const memberInvited = buildNotificationEmail({
    type: "member_invited",
    subject: "Member invited",
    message: "Team invite sent",
    context: {
      orgName: "Tech Org",
      email: "colleague@example.com",
      role: "recruiter",
      inviterName: "Alice Admin",
      organizationId: "org-1",
    },
  });
  assert.ok(memberInvited.html.includes("colleague@example.com"));
  assert.ok(memberInvited.html.includes("Recruiter"));
  assert.ok(memberInvited.html.includes("/app/o/org-1/team"));
});

test("Admin and security email builders format security events and alerts", () => {
  // Security alert
  const alert = buildNotificationEmail({
    type: "security_alert",
    subject: "Important security alert",
    message: "Security alert",
    context: {
      name: "Alice",
      event: "session.refresh_token_reuse",
      at: new Date("2026-09-09T10:30:00Z"),
    },
  });
  assert.ok(alert.html.includes("Possible session takeover"));
  assert.ok(alert.html.includes("/auth/forgot-password"));

  // Company registration
  const orgReg = buildNotificationEmail({
    type: "organization_registered",
    subject: "New company registered",
    message: "New company",
    context: {
      orgName: "Acme Cloud",
      industry: "Software",
      creatorName: "John Founder",
      orgId: "org-999",
    },
  });
  assert.ok(orgReg.html.includes("Acme Cloud"));
  assert.ok(orgReg.html.includes("Software"));
  assert.ok(orgReg.html.includes("/app/admin/organizations/org-999"));
});

test("Push notification support status is explicitly verifiable", () => {
  // Verify that push notification support is explicitly declared as not enabled
  for (const [eventName, views] of Object.entries(EVENTS)) {
    for (const [role, view] of Object.entries(views)) {
      assert.strictEqual(
        view.push,
        false,
        `Event ${eventName} for ${role} should have push: false until push provider is connected`,
      );
    }
  }
});
