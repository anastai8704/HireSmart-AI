const assert = require("node:assert/strict");
const test = require("node:test");
const { candidateInterviewView, CANDIDATE_HIDDEN_FIELDS } = require("../domain/interviewViews");

const base = () => ({
  _id: "i1",
  title: "Round 1",
  status: "invited",
  scheduledStart: new Date("2026-11-20T10:00:00Z"),
  scheduledEnd: new Date("2026-11-20T11:00:00Z"),
  meetingUrl: "https://meet.google.com/abc-defg-hij",
  meetingProvider: "google_meet",
  googleEventId: "evt_secret",
  conferenceRequestId: "req_secret",
  meetingError: "internal detail",
  remindersSent: ["7d"],
  participants: ["u-interviewer"],
  createdBy: "u-recruiter",
  feedback: [{ recommendation: "strong_no", summary: "private scorecard" }],
});

test("candidate view never includes interviewer feedback or Google identifiers", () => {
  const view = candidateInterviewView(base(), new Date("2026-11-01T00:00:00Z"));
  for (const field of CANDIDATE_HIDDEN_FIELDS) assert.equal(field in view, false, `${field} leaked`);
  assert.equal(JSON.stringify(view).includes("private scorecard"), false);
  assert.equal(JSON.stringify(view).includes("evt_secret"), false);
});

test("candidate view omits the meeting link before the recruiter starts", () => {
  const view = candidateInterviewView(base(), new Date("2026-11-20T09:50:00Z"));
  assert.equal(view.joinState.canJoin, false);
  assert.equal("meetingUrl" in view, false);
  assert.equal("meetingProvider" in view, false);
});

test("candidate view includes the link only when the interview is in progress", () => {
  const started = { ...base(), status: "in_progress" };
  const view = candidateInterviewView(started, new Date("2026-11-20T10:05:00Z"));
  assert.equal(view.joinState.canJoin, true);
  assert.equal(view.meetingUrl, "https://meet.google.com/abc-defg-hij");
});

test("candidate view never includes a link for a cancelled interview even if one was stored", () => {
  const cancelled = { ...base(), status: "cancelled" };
  const view = candidateInterviewView(cancelled, new Date("2026-11-20T10:05:00Z"));
  assert.equal(view.joinState.canJoin, false);
  assert.equal("meetingUrl" in view, false);
});
