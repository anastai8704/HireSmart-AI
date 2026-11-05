/**
 * Phase 4 rules for the recruitment pipeline, offers, candidate privacy and employment evidence.
 * Pure functions only: controllers load the records, call these, and then write with
 * compare-and-set. Stage transitions themselves stay in domain/stateMachines.js.
 */

// Stages from which an offer may be issued.
const OFFER_ISSUE_STAGES = Object.freeze(["interview", "offer"]);

const offerStatusOf = (application) => application?.offer?.status || "none";

const stageOf = (application) => application?.status || "";

/** A new or re-issued offer, allowed only after interview and when no open offer exists. */
const canIssueOffer = (application) => {
  if (!OFFER_ISSUE_STAGES.includes(stageOf(application))) {
    return {
      ok: false,
      code: "OFFER_STAGE_REQUIRED",
      message: "An offer can only be issued after the interview stage",
    };
  }
  const status = offerStatusOf(application);
  if (status === "issued" || status === "accepted") {
    return {
      ok: false,
      code: "OFFER_ALREADY_OPEN",
      message: status === "accepted" ? "The candidate has already accepted an offer" : "An offer is already awaiting the candidate's response",
    };
  }
  return { ok: true };
};

/** The candidate may accept or decline only an issued offer on the offer stage. */
const canRespondToOffer = (application) => {
  if (stageOf(application) !== "offer" || offerStatusOf(application) !== "issued") {
    return { ok: false, code: "OFFER_NOT_PENDING", message: "There is no offer waiting for a response" };
  }
  return { ok: true };
};

/** Hiring needs the candidate's recorded acceptance. An issued offer is not enough. */
const canHire = (application) => {
  if (stageOf(application) !== "offer") {
    return { ok: false, code: "INVALID_TRANSITION", message: "A candidate can be hired only from the offer stage" };
  }
  if (offerStatusOf(application) !== "accepted") {
    return {
      ok: false,
      code: "OFFER_NOT_ACCEPTED",
      message: "The candidate has not accepted the offer. Record the acceptance before hiring.",
    };
  }
  return { ok: true };
};

/**
 * What a recruiter in the application's company may see about the candidate. Contact details and
 * current employment appear only when the candidate allowed them. Nothing else from the profile
 * (for example private notes, documents or AI analysis) is included.
 */
const recruiterCandidateView = (user, profile) => {
  const privacy = profile?.privacy || {};
  const current = profile?.currentEmployment || {};
  const view = {
    id: user?._id ? String(user._id) : undefined,
    name: user?.name || "",
    email: user?.email || "",
    headline: user?.headline || "",
    location: user?.location || "",
    skills: Array.isArray(user?.skills) ? user.skills : [],
  };
  if (privacy.sharePhoneWithRecruiters && user?.phone) view.phone = user.phone;
  if (current.disclosed && privacy.shareCurrentEmployment) {
    view.currentEmployment = {
      employer: current.employer || "",
      designation: current.designation || "",
      startDate: current.startDate || null,
      source: "candidate_reported",
    };
  }
  return view;
};

/**
 * Employment evidence for one placement, with each fact labelled by its source. Nothing is
 * inferred: an unrecorded fact is reported as not recorded, and a company's hire decision is
 * not treated as proof of joining or of continuing employment.
 */
const employmentEvidence = (placement) => {
  const offer = placement?.offerDetails || {};
  const joining = placement?.joiningConfirmation || {};
  const verification = placement?.verification || {};
  return {
    hiredByCompany: {
      recorded: true,
      recordedAt: placement?.createdAt || null,
      source: "organization_reported",
    },
    offerAccepted: offer.acceptedAt
      ? { recorded: true, acceptedAt: offer.acceptedAt, source: "candidate_reported" }
      : { recorded: false, reason: "Not recorded before acceptance was required" },
    joiningReported: joining.confirmedByCandidate
      ? {
          recorded: true,
          joiningDate: joining.actualJoiningDate || null,
          reportedAt: joining.confirmedAt || null,
          source: "candidate_reported",
        }
      : { recorded: false },
    employmentConfirmed: verification.isVerified
      ? {
          recorded: true,
          verifiedAt: verification.verifiedAt || null,
          source: "platform_verified",
        }
      : { recorded: false, reason: "No independent verification recorded" },
  };
};

module.exports = {
  OFFER_ISSUE_STAGES,
  offerStatusOf,
  canIssueOffer,
  canRespondToOffer,
  canHire,
  recruiterCandidateView,
  employmentEvidence,
};
