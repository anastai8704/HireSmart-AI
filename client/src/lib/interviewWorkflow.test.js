import { describe, expect, it } from "vitest";
import {
  buildScheduleBody,
  bucketOf,
  candidateJoinInfo,
  groupRecruiterInterviews,
  historyEvents,
  meetingInfo,
  startAvailability,
  toZonedLocalInput,
  validateSchedule,
  zonedLocalToUtc,
} from "./interviewWorkflow";

const NOW = new Date("2026-11-20T04:00:00Z");
const at = (iso) => new Date(iso).toISOString();

describe("timezone conversion", () => {
  it("interprets a wall-clock time in Asia/Kolkata (UTC+05:30)", () => {
    expect(zonedLocalToUtc("2026-11-20T10:00", "Asia/Kolkata").toISOString()).toBe("2026-11-20T04:30:00.000Z");
  });

  it("interprets the same wall-clock time in UTC and in New York", () => {
    expect(zonedLocalToUtc("2026-11-20T10:00", "UTC").toISOString()).toBe("2026-11-20T10:00:00.000Z");
    expect(zonedLocalToUtc("2026-11-20T10:00", "America/New_York").toISOString()).toBe("2026-11-20T15:00:00.000Z");
  });

  it("returns null for malformed values and unknown timezones", () => {
    expect(zonedLocalToUtc("20/11/2026 10:00", "Asia/Kolkata")).toBeNull();
    expect(zonedLocalToUtc("2026-11-20T10:00", "Mars/Olympus")).toBeNull();
  });

  it("round-trips an instant through the zoned input format", () => {
    const instant = new Date("2026-11-20T04:30:00Z");
    const local = toZonedLocalInput(instant, "Asia/Kolkata");
    expect(local).toBe("2026-11-20T10:00");
    expect(zonedLocalToUtc(local, "Asia/Kolkata").toISOString()).toBe(instant.toISOString());
  });
});

describe("grouping into recruiter tabs", () => {
  const items = [
    { _id: "future", status: "invited", scheduledStart: at("2026-11-25T10:00:00Z"), scheduledEnd: at("2026-11-25T11:00:00Z") },
    { _id: "live", status: "in_progress", scheduledStart: at("2026-11-20T03:50:00Z"), scheduledEnd: at("2026-11-20T04:30:00Z") },
    { _id: "passed", status: "confirmed", scheduledStart: at("2026-11-10T10:00:00Z"), scheduledEnd: at("2026-11-10T11:00:00Z") },
    { _id: "done", status: "completed", scheduledStart: at("2026-11-01T10:00:00Z"), scheduledEnd: at("2026-11-01T11:00:00Z") },
    { _id: "void", status: "cancelled", scheduledStart: at("2026-11-30T10:00:00Z") },
  ];

  it("places each interview in exactly one tab", () => {
    const groups = groupRecruiterInterviews(items, NOW);
    expect(groups.upcoming.map((i) => i._id)).toEqual(["live", "future"]);
    expect(groups.past.map((i) => i._id)).toEqual(["passed"]);
    expect(groups.completed.map((i) => i._id)).toEqual(["done"]);
    expect(groups.cancelled.map((i) => i._id)).toEqual(["void"]);
  });

  it("treats cancelled interviews as cancelled even when their time is in the future", () => {
    expect(bucketOf(items[4], NOW)).toBe("cancelled");
  });
});

describe("start availability (mirrors server window)", () => {
  const base = {
    status: "invited",
    scheduledStart: at("2026-11-20T04:30:00Z"),
    scheduledEnd: at("2026-11-20T05:15:00Z"),
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    timezone: "Asia/Kolkata",
  };

  it("is not available more than 15 minutes early", () => {
    expect(startAvailability(base, new Date("2026-11-20T04:00:00Z")).ok).toBe(false);
  });

  it("is available 15 minutes before the start", () => {
    expect(startAvailability(base, new Date("2026-11-20T04:16:00Z")).ok).toBe(true);
  });

  it("is blocked when there is no meeting link", () => {
    const result = startAvailability({ ...base, meetingUrl: "" }, new Date("2026-11-20T04:31:00Z"));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/meeting link/i);
  });

  it("is blocked once the start window has closed", () => {
    expect(startAvailability(base, new Date("2026-11-20T06:30:00Z")).ok).toBe(false);
  });

  it("is blocked for cancelled and already started interviews", () => {
    expect(startAvailability({ ...base, status: "cancelled" }, NOW).ok).toBe(false);
    expect(startAvailability({ ...base, status: "in_progress" }, NOW).ok).toBe(false);
  });
});

describe("candidate join state", () => {
  it("is disabled when the server sent no state", () => {
    const info = candidateJoinInfo({});
    expect(info.canJoin).toBe(false);
    expect(info.message).toMatch(/waiting for the recruiter/i);
  });

  it("uses the server's joinState verbatim", () => {
    const server = { canJoin: true, message: "The recruiter has started the interview." };
    expect(candidateJoinInfo({ joinState: server })).toBe(server);
  });
});

describe("meeting labels", () => {
  it("names Google Meet only when the record says Google created it", () => {
    expect(meetingInfo({ meetingProvider: "google_meet", meetingUrl: "https://meet.google.com/x" }).kind).toBe(
      "google_meet",
    );
  });

  it("labels a manual link as manual", () => {
    const info = meetingInfo({ meetingProvider: "manual", meetingUrl: "https://zoom.us/j/1" });
    expect(info.kind).toBe("manual");
    expect(info.label).toBe("Manual link");
  });

  it("does not claim Google Meet for an unrecorded link", () => {
    const info = meetingInfo({ meetingProvider: "none", meetingUrl: "https://meet.google.com/x" });
    expect(info.kind).toBe("unknown");
    expect(info.label).not.toMatch(/Google Meet/);
  });

  it("reports setup_required, pending and failure honestly", () => {
    expect(meetingInfo({ meetingStatus: "setup_required" }).kind).toBe("setup_required");
    expect(meetingInfo({ meetingStatus: "pending" }).kind).toBe("pending");
    expect(meetingInfo({ meetingStatus: "failure", meetingError: "quota" }).description).toBe("quota");
  });
});

describe("scheduling form", () => {
  const form = {
    jobId: "job1",
    applicationId: "app1",
    title: "Technical round",
    type: "video",
    start: "2026-11-25T10:00",
    end: "2026-11-25T11:00",
    timezone: "Asia/Kolkata",
    location: "",
    meetingUrl: "",
    participantIds: [],
  };

  it("accepts a complete future schedule", () => {
    expect(validateSchedule(form, NOW)).toEqual({});
  });

  it("requires a job before a candidate", () => {
    const errors = validateSchedule({ ...form, jobId: "", applicationId: "" }, NOW);
    expect(errors.jobId).toMatch(/job/i);
    expect(errors.applicationId).toMatch(/candidate/i);
  });

  it("rejects an end time before the start time", () => {
    expect(validateSchedule({ ...form, end: "2026-11-25T09:00" }, NOW).end).toMatch(/after/i);
  });

  it("rejects a start time in the past", () => {
    expect(validateSchedule({ ...form, start: "2026-11-01T10:00", end: "2026-11-01T11:00" }, NOW).start).toMatch(
      /past/i,
    );
  });

  it("rejects a non-http meeting link", () => {
    expect(validateSchedule({ ...form, meetingUrl: "javascript:alert(1)" }, NOW).meetingUrl).toBeTruthy();
  });

  it("builds the POST body with UTC instants, the job and the application", () => {
    const body = buildScheduleBody({ ...form, meetingUrl: " https://zoom.us/j/1 " });
    expect(body.jobId).toBe("job1");
    expect(body.applicationId).toBe("app1");
    expect(body.scheduledStart).toBe("2026-11-25T04:30:00.000Z");
    expect(body.meetingUrl).toBe("https://zoom.us/j/1");
    expect(body).not.toHaveProperty("location");
  });
});

describe("history", () => {
  it("derives an ordered timeline from record timestamps", () => {
    const events = historyEvents({
      createdAt: "2026-11-01T00:00:00Z",
      candidateConfirmedAt: "2026-11-02T00:00:00Z",
      startedAt: "2026-11-20T04:31:00Z",
      feedback: [{ submittedAt: "2026-11-20T05:00:00Z", recommendation: "strong_yes" }],
    });
    expect(events.map((e) => e.label)).toEqual([
      "Interview scheduled",
      "Candidate confirmed attendance",
      "Recruiter started the interview",
      "Scorecard submitted",
    ]);
    expect(events[3].detail).toBe("Recommendation: strong yes");
  });
});
