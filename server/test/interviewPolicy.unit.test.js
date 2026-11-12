const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../domain/interviewPolicy");

const T = new Date("2026-11-12T10:00:00.000Z");
const at = (minutes) => new Date(T.getTime() + minutes * 60000);

test("an application for another job is rejected; the same job is accepted", () => {
  assert.equal(P.assertApplicationBelongsToJob({ applicationJobId: "a1", selectedJobId: "b2" }).code, "APPLICATION_JOB_MISMATCH");
  assert.equal(P.assertApplicationBelongsToJob({ applicationJobId: "a1", selectedJobId: "a1" }).ok, true);
  assert.equal(P.assertApplicationBelongsToJob({ applicationJobId: null, selectedJobId: "a1" }).ok, false);
});

test("a schedule in the past is rejected, a near-now or future one is accepted", () => {
  assert.equal(P.scheduleIsInFuture({ scheduledStart: at(-30), now: T }).code, "SCHEDULE_IN_PAST");
  assert.equal(P.scheduleIsInFuture({ scheduledStart: at(-2), now: T }).ok, true);
  assert.equal(P.scheduleIsInFuture({ scheduledStart: at(60), now: T }).ok, true);
});

test("the recruiter can start only inside the window, and only a scheduled interview", () => {
  const base = { status: "invited", scheduledStart: at(0), scheduledEnd: at(60), now: T };
  assert.equal(P.canStartInterview({ ...base, now: at(-20) }).code, "TOO_EARLY");
  assert.equal(P.canStartInterview({ ...base, now: at(-10) }).ok, true);
  assert.equal(P.canStartInterview({ ...base, now: at(90) }).ok, true, "late start within the window");
  assert.equal(P.canStartInterview({ ...base, now: at(200) }).code, "START_WINDOW_CLOSED");
  assert.equal(P.canStartInterview({ ...base, status: "in_progress" }).code, "ALREADY_STARTED");
  assert.equal(P.canStartInterview({ ...base, status: "cancelled" }).code, "INTERVIEW_CANCELLED");
  assert.equal(P.canStartInterview({ ...base, status: "completed" }).code, "INTERVIEW_ENDED");
  assert.equal(P.canStartInterview({ ...base, status: "draft", scheduledStart: null }).code, "NOT_SCHEDULED");
});

test("the candidate Join action stays disabled until the recruiter starts the interview", () => {
  const url = "https://meet.google.com/abc-defg-hij";
  const waiting = P.candidateJoinState({ status: "invited", meetingUrl: url, scheduledStart: at(0), now: at(-60) });
  assert.equal(waiting.canJoin, false);
  assert.equal(waiting.reason, "NOT_STARTED");
  const scheduledNow = P.candidateJoinState({ status: "invited", meetingUrl: url, scheduledStart: at(0), now: at(0) });
  assert.equal(scheduledNow.canJoin, false, "being at the scheduled time does not start the interview");
  assert.equal(scheduledNow.reason, "WAITING_FOR_RECRUITER");
  const started = P.candidateJoinState({ status: "in_progress", meetingUrl: url, now: at(5) });
  assert.equal(started.canJoin, true);
});

test("a started interview without a meeting link does not offer Join", () => {
  const state = P.candidateJoinState({ status: "in_progress", meetingUrl: "", now: T });
  assert.equal(state.canJoin, false);
  assert.equal(state.reason, "MISSING_MEETING_URL");
});

test("cancelled, rescheduled and ended interviews never offer Join", () => {
  const url = "https://meet.google.com/abc-defg-hij";
  assert.equal(P.candidateJoinState({ status: "cancelled", meetingUrl: url }).reason, "CANCELLED");
  assert.equal(P.candidateJoinState({ status: "reschedule_requested", meetingUrl: url }).reason, "RESCHEDULE_PENDING");
  assert.equal(P.candidateJoinState({ status: "completed", meetingUrl: url }).reason, "ENDED");
});
