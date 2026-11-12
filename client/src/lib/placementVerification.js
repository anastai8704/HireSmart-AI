// Mirrors server/domain/placementVerification.js: a placement is verified only after the joining is confirmed.
const VERIFIABLE_STATUSES = ["joining_confirmed", "currently_working", "employment_ended"];

export const verificationBlockFor = (placement) => {
  if (placement?.verification?.isVerified) return "This placement is already verified.";
  if (!VERIFIABLE_STATUSES.includes(placement?.status)) {
    return "Verify after the joining is confirmed. Pre-joining placements cannot be verified yet.";
  }
  return null;
};
