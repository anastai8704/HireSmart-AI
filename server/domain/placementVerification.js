// Platform verification of a placement (Requirement 9). A placement is verified only after the joining is
// confirmed: verifying a placement that is still "selected" or "hired" would certify a job that never started.
const VERIFIABLE_STATUSES = Object.freeze(["joining_confirmed", "currently_working", "employment_ended"]);

/**
 * @returns {null | {code: string, message: string}} the reason verification is refused, or null when allowed.
 */
const verificationBlockFor = (placement) => {
  if (placement?.verification?.isVerified) {
    return { code: "ALREADY_VERIFIED", message: "This placement is already verified" };
  }
  if (!VERIFIABLE_STATUSES.includes(placement?.status)) {
    return {
      code: "NOT_VERIFIABLE_YET",
      message: "A placement can be verified only after the joining is confirmed",
    };
  }
  return null;
};

module.exports = { VERIFIABLE_STATUSES, verificationBlockFor };
