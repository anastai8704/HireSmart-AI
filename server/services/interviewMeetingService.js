// Calendar events and Meet links for interviews (Requirement 4).
// Honesty rules:
//  - meetingProvider "google_meet" and meetingStatus "success" are set only when Google returned a video entry point.
//  - A manual link is labelled "manual". It is never presented as an automatic Google Meet.
//  - If Google or the recruiter's connection is unavailable, the interview is saved with an explicit setup_required or
//    failure state. The request is not failed because of an external service.
// The Google module is injected so the real decision logic is unit-tested against a mock.
const crypto = require("node:crypto");
const GoogleModule = require("./googleCalendarService");
const GoogleConnection = require("../models/GoogleCalendarConnection");
const { decryptSecret } = require("./tokenCrypto");
const logger = require("../utils/logger");

const SAFE = /^[a-z0-9_]{1,80}$/;
const safeCode = (code) => (SAFE.test(String(code || "")) ? String(code) : "unknown_error");

/** Returns a fresh access token for the recruiter, or throws { revoked } if the connection must be re-authorised. */
const getRecruiterAccessToken = async (userId, { google = GoogleModule, env = google.readGoogleEnv() } = {}) => {
  const connection = await GoogleConnection.findOne({ user: userId }).select("+encryptedRefreshToken");
  if (!connection || connection.status !== "connected") {
    throw Object.assign(new Error("recruiter_not_connected"), { safe: true, code: "recruiter_not_connected" });
  }
  let refreshToken;
  try {
    refreshToken = decryptSecret(connection.encryptedRefreshToken, env.encryptionKey);
  } catch {
    throw Object.assign(new Error("token_unreadable"), { safe: true, code: "token_unreadable" });
  }
  try {
    const { accessToken } = await google.refreshAccessToken({ refreshToken, env });
    return accessToken;
  } catch (error) {
    if (error.revoked) {
      await GoogleConnection.updateOne({ _id: connection._id }, { $set: { status: "revoked", lastErrorCode: "oauth_revoked" } });
      throw Object.assign(new Error("recruiter_reconnect_required"), { safe: true, code: "recruiter_reconnect_required" });
    }
    throw error;
  }
};

const setMeeting = (interview, fields) => Object.assign(interview, fields);

/**
 * Creates the Calendar event with a Meet conference for an interview. Mutates `interview` (caller saves).
 * Returns the resulting meeting state for the audit trail.
 */
const ensureMeeting = async ({ interview, recruiterId, attendeeEmails, title, google = GoogleModule, env = google.readGoogleEnv(), getAccessToken = null }) => {
  if (interview.meetingProvider === "manual" && interview.meetingUrl) {
    setMeeting(interview, { meetingStatus: "manual" });
    return { meetingStatus: "manual", provider: "manual" };
  }
  if (!interview.scheduledStart || !interview.scheduledEnd) {
    setMeeting(interview, { meetingProvider: "none", meetingStatus: "none", meetingError: "" });
    return { meetingStatus: "none" };
  }
  if (!google.isGoogleConfigured(env)) {
    setMeeting(interview, {
      meetingProvider: "none",
      meetingStatus: "setup_required",
      meetingError: "google_not_configured",
    });
    return { meetingStatus: "setup_required", reason: "google_not_configured" };
  }

  let accessToken;
  try {
    accessToken = getAccessToken ? await getAccessToken(recruiterId) : await getRecruiterAccessToken(recruiterId, { google, env });
  } catch (error) {
    const code = safeCode(error.code);
    const status = code === "recruiter_not_connected" ? "setup_required" : "failure";
    setMeeting(interview, { meetingProvider: "none", meetingStatus: status, meetingError: code });
    return { meetingStatus: status, reason: code };
  }

  // A new conference request id per interview (and per creation attempt): a Meet link is never reused.
  const requestId = crypto.randomUUID();
  try {
    const body = google.buildEventBody({ interview, title, attendeeEmails, requestId });
    const event = await google.createEvent({ accessToken, body });
    const resolved = google.resolveConference(event);
    setMeeting(interview, {
      googleEventId: resolved.eventId || event.id || "",
      conferenceRequestId: requestId,
      meetingUrl: resolved.url || "",
      meetingProvider: resolved.status === "success" ? "google_meet" : "none",
      meetingStatus: resolved.status,
      meetingError: resolved.status === "failure" ? "conference_failed" : "",
    });
    return { meetingStatus: resolved.status };
  } catch (error) {
    logger.error(`Google Calendar event creation failed: ${safeCode(error.message)}`);
    setMeeting(interview, { meetingProvider: "none", meetingStatus: "failure", meetingError: safeCode(error.message) });
    return { meetingStatus: "failure", reason: safeCode(error.message) };
  }
};

/** Moves the existing Calendar event when the interview is rescheduled. Falls back to creating one. */
const syncMeetingOnReschedule = async (args) => {
  const { interview, recruiterId, title, attendeeEmails, google = GoogleModule, env = google.readGoogleEnv(), getAccessToken = null } = args;
  if (!interview.googleEventId) return ensureMeeting(args);
  try {
    const accessToken = getAccessToken ? await getAccessToken(recruiterId) : await getRecruiterAccessToken(recruiterId, { google, env });
    const body = google.buildEventBody({
      interview,
      title,
      attendeeEmails,
      requestId: interview.conferenceRequestId || crypto.randomUUID(),
    });
    await google.patchEvent({ accessToken, eventId: interview.googleEventId, body });
    setMeeting(interview, { meetingError: "" });
    return { meetingStatus: interview.meetingStatus };
  } catch (error) {
    setMeeting(interview, { meetingStatus: "failure", meetingError: safeCode(error.code || error.message) });
    return { meetingStatus: "failure", reason: safeCode(error.code || error.message) };
  }
};

/** Deletes the Calendar event when the interview is cancelled. The link is kept for the record but no longer joinable. */
const removeMeetingOnCancel = async ({ interview, recruiterId, google = GoogleModule, env = google.readGoogleEnv(), getAccessToken = null }) => {
  if (!interview.googleEventId) return { meetingStatus: interview.meetingStatus };
  try {
    const accessToken = getAccessToken ? await getAccessToken(recruiterId) : await getRecruiterAccessToken(recruiterId, { google, env });
    await google.deleteEvent({ accessToken, eventId: interview.googleEventId });
  } catch (error) {
    logger.error(`Google Calendar event deletion failed: ${safeCode(error.code || error.message)}`);
  }
  setMeeting(interview, { meetingStatus: "cancelled" });
  return { meetingStatus: "cancelled" };
};

/** Re-reads a pending conference from Google. Used by the retry action and by the worker. */
const refreshPendingMeeting = async ({ interview, recruiterId, google = GoogleModule, env = google.readGoogleEnv() }) => {
  if (!interview.googleEventId || interview.meetingStatus !== "pending") return { meetingStatus: interview.meetingStatus };
  const accessToken = await getRecruiterAccessToken(recruiterId, { google, env });
  const event = await google.getEvent({ accessToken, eventId: interview.googleEventId });
  const resolved = google.resolveConference(event);
  setMeeting(interview, {
    meetingUrl: resolved.url || interview.meetingUrl,
    meetingProvider: resolved.status === "success" ? "google_meet" : interview.meetingProvider,
    meetingStatus: resolved.status,
    meetingError: resolved.status === "failure" ? "conference_failed" : "",
  });
  return { meetingStatus: resolved.status };
};

module.exports = {
  getRecruiterAccessToken,
  ensureMeeting,
  syncMeetingOnReschedule,
  removeMeetingOnCancel,
  refreshPendingMeeting,
};
