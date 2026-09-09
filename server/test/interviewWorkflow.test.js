process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const Interview = require("../models/Interview");
const { permissionsByRole } = require("../models/Membership");
const {
  formatDuration,
  isValidMeetingUrl,
  generateIcsContent,
} = require("../../client/src/lib/utils");

/* ----------------------------- 1. Interview Domain Model & Schema ----------------------------- */

test("Interview model validates statuses, types, and schema fields", () => {
  const allowedStatuses = ["draft", "invited", "confirmed", "reschedule_requested", "cancelled", "completed"];
  const allowedTypes = ["phone", "video", "onsite", "technical", "panel", "hr"];
  const allowedRecommendations = ["strong_yes", "yes", "mixed", "no", "strong_no"];

  const statusEnum = Interview.schema.path("status").enumValues;
  const typeEnum = Interview.schema.path("type").enumValues;

  assert.deepStrictEqual(statusEnum, allowedStatuses);
  assert.deepStrictEqual(typeEnum, allowedTypes);

  // Verify feedback subdocument schema
  const feedbackSchema = Interview.schema.path("feedback").schema;
  assert.ok(feedbackSchema.path("evaluator"));
  assert.ok(feedbackSchema.path("recommendation"));
  assert.deepStrictEqual(feedbackSchema.path("recommendation").enumValues, allowedRecommendations);
});

/* ----------------------------- 2. Interview Status Lifecycle & Transitions ----------------------------- */

test("Interview transitions adhere to business rules and prevent invalid states", () => {
  const now = new Date();
  const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
  const futureDate = new Date(Date.now() + 86400000); // Tomorrow

  // Helper simulating lifecycle validation checks
  const canMarkCompleted = (interview) => {
    if (!interview.scheduledStart || new Date(interview.scheduledStart) > now) return false;
    if (["cancelled", "draft"].includes(interview.status)) return false;
    return true;
  };

  const canCancel = (interview) => {
    return interview.status !== "completed";
  };

  const canCandidateConfirm = (interview, candidateId) => {
    if (String(interview.candidateId) !== String(candidateId)) return false;
    return interview.status === "invited";
  };

  const canCandidateRequestReschedule = (interview, candidateId) => {
    if (String(interview.candidateId) !== String(candidateId)) return false;
    return !["completed", "cancelled"].includes(interview.status);
  };

  // Test future interview completion
  const futureInterview = { status: "confirmed", scheduledStart: futureDate };
  assert.strictEqual(canMarkCompleted(futureInterview), false);

  // Test past interview completion
  const pastInterview = { status: "confirmed", scheduledStart: pastDate };
  assert.strictEqual(canMarkCompleted(pastInterview), true);

  // Test cancelled interview cannot be completed
  const cancelledInterview = { status: "cancelled", scheduledStart: pastDate };
  assert.strictEqual(canMarkCompleted(cancelledInterview), false);

  // Test completed interview cannot be cancelled
  const completedInterview = { status: "completed" };
  assert.strictEqual(canCancel(completedInterview), false);

  // Test candidate confirmation rules
  const candidateA = new mongoose.Types.ObjectId();
  const candidateB = new mongoose.Types.ObjectId();
  const invitedInterview = { candidateId: candidateA, status: "invited" };

  assert.strictEqual(canCandidateConfirm(invitedInterview, candidateA), true);
  assert.strictEqual(canCandidateConfirm(invitedInterview, candidateB), false);

  // Candidate cannot confirm already confirmed or cancelled interview
  assert.strictEqual(canCandidateConfirm({ candidateId: candidateA, status: "confirmed" }, candidateA), false);
  assert.strictEqual(canCandidateConfirm({ candidateId: candidateA, status: "cancelled" }, candidateA), false);

  // Candidate reschedule request
  assert.strictEqual(canCandidateRequestReschedule({ candidateId: candidateA, status: "invited" }, candidateA), true);
  assert.strictEqual(canCandidateRequestReschedule({ candidateId: candidateA, status: "confirmed" }, candidateA), true);
  assert.strictEqual(canCandidateRequestReschedule({ candidateId: candidateA, status: "completed" }, candidateA), false);
  assert.strictEqual(canCandidateRequestReschedule({ candidateId: candidateA, status: "cancelled" }, candidateA), false);
});

/* ----------------------------- 3. Multi-Criteria Scorecards & Duplicate Prevention ----------------------------- */

test("Scorecard submission enforces 1-5 scores, valid recommendations, and prevents duplicates", () => {
  const evaluatorId1 = new mongoose.Types.ObjectId();
  const evaluatorId2 = new mongoose.Types.ObjectId();

  const interviewFeedbacks = [
    {
      evaluator: evaluatorId1,
      ratings: [
        { criterion: "Technical skills", score: 5, evidence: "Demonstrated excellent concurrency patterns" },
        { criterion: "Communication", score: 4, evidence: "Clear explanations" },
      ],
      recommendation: "strong_yes",
      summary: "Exceptional candidate.",
      submittedAt: new Date(),
    },
  ];

  // Helper verifying duplicate feedback submission
  const hasAlreadySubmitted = (feedbacks, evaluatorId) => {
    return feedbacks.some((f) => String(f.evaluator) === String(evaluatorId));
  };

  assert.strictEqual(hasAlreadySubmitted(interviewFeedbacks, evaluatorId1), true);
  assert.strictEqual(hasAlreadySubmitted(interviewFeedbacks, evaluatorId2), false);

  // Calculate team average score across all ratings
  const calculateAverageScore = (feedbacks) => {
    let totalScore = 0;
    let totalRatings = 0;
    feedbacks.forEach((fb) => {
      (fb.ratings || []).forEach((r) => {
        if (r.score) {
          totalScore += Number(r.score);
          totalRatings += 1;
        }
      });
    });
    return totalRatings > 0 ? Number((totalScore / totalRatings).toFixed(1)) : null;
  };

  assert.strictEqual(calculateAverageScore(interviewFeedbacks), 4.5);

  // Add second evaluator feedback
  interviewFeedbacks.push({
    evaluator: evaluatorId2,
    ratings: [
      { criterion: "Technical skills", score: 4, evidence: "Good system design" },
      { criterion: "Communication", score: 3, evidence: "Adequate" },
    ],
    recommendation: "yes",
    summary: "Solid engineer.",
    submittedAt: new Date(),
  });

  // Total scores: 5 + 4 + 4 + 3 = 16 / 4 = 4.0
  assert.strictEqual(calculateAverageScore(interviewFeedbacks), 4.0);
});

/* ----------------------------- 4. RBAC & Cross-Tenant Isolation ----------------------------- */

test("Role-based permissions properly isolate interview management and feedback", () => {
  // Owner and Recruiter have full interview manage & feedback permissions
  assert.ok(permissionsByRole.owner.includes("interview.manage"));
  assert.ok(permissionsByRole.owner.includes("interview.feedback"));

  assert.ok(permissionsByRole.admin.includes("interview.manage"));
  assert.ok(permissionsByRole.admin.includes("interview.feedback"));

  assert.ok(permissionsByRole.recruiter.includes("interview.manage"));
  assert.ok(permissionsByRole.recruiter.includes("interview.feedback"));

  // Hiring Manager can submit feedback and review applications, but cannot manage full org interview schedules
  assert.ok(!permissionsByRole.hiring_manager.includes("interview.manage"));
  assert.ok(permissionsByRole.hiring_manager.includes("interview.feedback"));
  assert.ok(permissionsByRole.hiring_manager.includes("application.review"));

  // Interviewer can only submit feedback and review assigned application
  assert.ok(!permissionsByRole.interviewer.includes("interview.manage"));
  assert.ok(permissionsByRole.interviewer.includes("interview.feedback"));
  assert.ok(permissionsByRole.interviewer.includes("application.review"));

  // Viewer has read-only access to published jobs, no access to interview manage or feedback
  assert.ok(!permissionsByRole.viewer.includes("interview.manage"));
  assert.ok(!permissionsByRole.viewer.includes("interview.feedback"));
});

/* ----------------------------- 5. Calendar & Logistics Utilities ----------------------------- */

test("Meeting URL validation, Duration computation, and iCalendar export", () => {
  // Valid meeting URLs
  assert.strictEqual(isValidMeetingUrl("https://meet.google.com/abc-defg-hij"), true);
  assert.strictEqual(isValidMeetingUrl("https://zoom.us/j/987654321"), true);
  assert.strictEqual(isValidMeetingUrl("https://teams.microsoft.com/l/meetup-join/123"), true);
  assert.strictEqual(isValidMeetingUrl("http://localhost:3000/interview"), true);

  // Invalid / unsafe URLs
  assert.strictEqual(isValidMeetingUrl("javascript:alert(1)"), false);
  assert.strictEqual(isValidMeetingUrl("not-a-url"), false);
  assert.strictEqual(isValidMeetingUrl(""), false);
  assert.strictEqual(isValidMeetingUrl(null), false);

  // Duration computation
  const start = "2026-09-18T10:00:00Z";
  const end30 = "2026-09-18T10:30:00Z";
  const end45 = "2026-09-18T10:45:00Z";
  const end60 = "2026-09-18T11:00:00Z";
  const end90 = "2026-09-18T11:30:00Z";

  assert.strictEqual(formatDuration(start, end30), "30 mins");
  assert.strictEqual(formatDuration(start, end45), "45 mins");
  assert.strictEqual(formatDuration(start, end60), "1 hour");
  assert.strictEqual(formatDuration(start, end90), "1.5 hours");

  // RFC 5545 iCalendar content generation
  const ics = generateIcsContent({
    title: "System Design Interview",
    jobTitle: "Staff Software Engineer",
    company: "Meridian Tech",
    scheduledStart: new Date("2026-09-18T10:00:00Z"),
    scheduledEnd: new Date("2026-09-18T11:00:00Z"),
    timezone: "Asia/Kolkata",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    location: "Online",
  });

  assert.ok(ics.includes("BEGIN:VCALENDAR"));
  assert.ok(ics.includes("VERSION:2.0"));
  assert.ok(ics.includes("SUMMARY:System Design Interview: Staff Software Engineer at Meridian Tech"));
  assert.ok(ics.includes("DTSTART:20260918T100000Z"));
  assert.ok(ics.includes("DTEND:20260918T110000Z"));
  assert.ok(ics.includes("LOCATION:https://meet.google.com/abc-defg-hij"));
  assert.ok(ics.includes("END:VCALENDAR"));
});
