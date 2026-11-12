// Response shaping for interviews (Requirements 5 and 6). Pure functions so the privacy rules can be unit-tested
// without a database. The controller calls these; it must not hand raw interview documents to a candidate.
const Policy = require("./interviewPolicy");

/** Fields that never leave the server for a candidate. */
const CANDIDATE_HIDDEN_FIELDS = Object.freeze([
  "feedback",
  "googleEventId",
  "conferenceRequestId",
  "meetingError",
  "remindersSent",
  "createdBy",
  "participants",
]);

/**
 * The candidate view of an interview. The meeting link is included only when the recruiter has started the interview
 * and the join rule allows it. Feedback and scorecards are always removed.
 */
const candidateInterviewView = (interview, now = new Date()) => {
  const o = typeof interview.toObject === "function" ? interview.toObject() : { ...interview };
  const joinState = Policy.candidateJoinState({
    status: o.status,
    meetingUrl: o.meetingUrl,
    scheduledStart: o.scheduledStart,
    now,
  });
  for (const field of CANDIDATE_HIDDEN_FIELDS) delete o[field];
  if (!joinState.canJoin) delete o.meetingUrl;
  if (!joinState.canJoin) delete o.meetingProvider;
  return { ...o, joinState };
};

module.exports = { candidateInterviewView, CANDIDATE_HIDDEN_FIELDS };
