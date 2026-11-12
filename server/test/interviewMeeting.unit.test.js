const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../services/interviewMeetingService");
const G = require("../services/googleCalendarService");

const env = { clientId: "c", clientSecret: "s", redirectUri: "http://x/cb", encryptionKey: "k".repeat(64) };
const baseInterview = () => ({
  scheduledStart: new Date("2026-11-20T10:00:00Z"),
  scheduledEnd: new Date("2026-11-20T11:00:00Z"),
  instructions: "",
  meetingUrl: "",
  meetingProvider: "none",
  meetingStatus: "none",
  meetingError: "",
  googleEventId: "",
  conferenceRequestId: "",
});
const real = {
  isGoogleConfigured: G.isGoogleConfigured,
  readGoogleEnv: G.readGoogleEnv,
  buildEventBody: G.buildEventBody,
  resolveConference: G.resolveConference,
};
const mockGoogle = (overrides = {}) => ({
  ...real,
  createEvent: async () => ({ id: "evt_123", conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/aaa-bbbb-ccc" }] } }),
  patchEvent: async () => ({}),
  deleteEvent: async () => true,
  getEvent: async () => ({}),
  ...overrides,
});
const token = async () => "access-token";

test("without Google configuration the interview is saved as setup_required, never as a Meet link", async () => {
  const interview = baseInterview();
  const out = await M.ensureMeeting({
    interview,
    recruiterId: "u1",
    attendeeEmails: [],
    title: "R1",
    google: mockGoogle(),
    env: { ...env, clientSecret: "" },
    getAccessToken: token,
  });
  assert.equal(out.meetingStatus, "setup_required");
  assert.equal(interview.meetingUrl, "");
  assert.equal(interview.meetingProvider, "none");
});

test("with Google configured, the Meet link comes from the created event and is labelled google_meet", async () => {
  const interview = baseInterview();
  await M.ensureMeeting({ interview, recruiterId: "u1", attendeeEmails: ["c@x.com"], title: "R1", google: mockGoogle(), env, getAccessToken: token });
  assert.equal(interview.meetingStatus, "success");
  assert.equal(interview.meetingProvider, "google_meet");
  assert.equal(interview.meetingUrl, "https://meet.google.com/aaa-bbbb-ccc");
  assert.equal(interview.googleEventId, "evt_123");
  assert.ok(interview.conferenceRequestId, "a conference request id is stored");
});

test("two interviews never share a conference request id", async () => {
  const a = baseInterview();
  const b = baseInterview();
  await M.ensureMeeting({ interview: a, recruiterId: "u1", attendeeEmails: [], title: "A", google: mockGoogle(), env, getAccessToken: token });
  await M.ensureMeeting({ interview: b, recruiterId: "u1", attendeeEmails: [], title: "B", google: mockGoogle(), env, getAccessToken: token });
  assert.notEqual(a.conferenceRequestId, b.conferenceRequestId);
});

test("a recruiter who has not connected Google gets setup_required, not a fake link", async () => {
  const interview = baseInterview();
  const out = await M.ensureMeeting({
    interview,
    recruiterId: "u1",
    attendeeEmails: [],
    title: "R1",
    google: mockGoogle(),
    env,
    getAccessToken: async () => {
      throw Object.assign(new Error("recruiter_not_connected"), { code: "recruiter_not_connected" });
    },
  });
  assert.equal(out.meetingStatus, "setup_required");
  assert.equal(interview.meetingUrl, "");
});

test("a Google failure is recorded as failure with a safe code, and the interview is still saved", async () => {
  const interview = baseInterview();
  const out = await M.ensureMeeting({
    interview,
    recruiterId: "u1",
    attendeeEmails: [],
    title: "R1",
    google: mockGoogle({ createEvent: async () => { throw Object.assign(new Error("calendar_create_403"), { safe: true }); } }),
    env,
    getAccessToken: token,
  });
  assert.equal(out.meetingStatus, "failure");
  assert.equal(interview.meetingStatus, "failure");
  assert.equal(interview.meetingError, "calendar_create_403");
});

test("a pending conference is not presented as a joinable link", async () => {
  const interview = baseInterview();
  await M.ensureMeeting({
    interview,
    recruiterId: "u1",
    attendeeEmails: [],
    title: "R1",
    google: mockGoogle({ createEvent: async () => ({ id: "evt_9", conferenceData: { createRequest: { status: { statusCode: "pending" } } } }) }),
    env,
    getAccessToken: token,
  });
  assert.equal(interview.meetingStatus, "pending");
  assert.equal(interview.meetingUrl, "");
});

test("a manual link is labelled manual and no Google event is created for it", async () => {
  const interview = { ...baseInterview(), meetingUrl: "https://meet.google.com/manual-link", meetingProvider: "manual" };
  let created = false;
  await M.ensureMeeting({
    interview,
    recruiterId: "u1",
    attendeeEmails: [],
    title: "R1",
    google: mockGoogle({ createEvent: async () => { created = true; return {}; } }),
    env,
    getAccessToken: token,
  });
  assert.equal(interview.meetingStatus, "manual");
  assert.equal(created, false);
});

test("rescheduling patches the existing event instead of creating a second one", async () => {
  const interview = { ...baseInterview(), googleEventId: "evt_123", conferenceRequestId: "req-1", meetingStatus: "success", meetingUrl: "https://meet.google.com/aaa-bbbb-ccc" };
  let patched = null;
  let created = false;
  await M.syncMeetingOnReschedule({
    interview,
    recruiterId: "u1",
    attendeeEmails: [],
    title: "R1",
    google: mockGoogle({ patchEvent: async (args) => { patched = args; return {}; }, createEvent: async () => { created = true; return {}; } }),
    env,
    getAccessToken: token,
  });
  assert.equal(patched.eventId, "evt_123");
  assert.equal(patched.body.conferenceData.createRequest.requestId, "req-1", "the same conference request is kept");
  assert.equal(created, false);
});

test("cancelling deletes the event and marks the meeting cancelled", async () => {
  const interview = { ...baseInterview(), googleEventId: "evt_123", meetingStatus: "success" };
  let deleted = null;
  await M.removeMeetingOnCancel({
    interview,
    recruiterId: "u1",
    google: mockGoogle({ deleteEvent: async (args) => { deleted = args; return true; } }),
    env,
    getAccessToken: token,
  });
  assert.equal(deleted.eventId, "evt_123");
  assert.equal(interview.meetingStatus, "cancelled");
});
