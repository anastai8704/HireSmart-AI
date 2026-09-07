/**
 * Centralized notification event catalog.
 *
 * Single source of truth for:
 *  - the notification events the platform can emit (event `type`)
 *  - who receives each event (recipient role views)
 *  - the preference group + label a role sees for that event
 *  - the channels each event supports (in-app, email; push reserved)
 *  - which events are always on (security & account)
 *
 * Delivery (services/notificationService.js) resolves the recipient's
 * preference in this order:
 *    user.notificationPrefs.events[type]   (event level, new)
 *    user.notificationPrefs[legacyCategory] (category level, pre-existing)
 *    view.emailDefault / in-app default
 * Events without a view for the recipient role fall back to the
 * call-site category with the historical defaults.
 *
 * Push notifications: every view declares `push: false`. When a push
 * provider lands, flip the flag here and extend
 * Notification.delivery.push (same shape as delivery.email).
 */

const views = (entry) => entry;

const EVENTS = {
  /* ----------------------------- candidates ----------------------------- */
  application_acknowledged: views({
    candidate: {
      group: "applications",
      label: "Application submitted",
      description: "A confirmation when your application is received.",
      legacyCategory: "applications",
      emailDefault: true,
      push: false,
    },
  }),
  application_status_changed: views({
    candidate: {
      group: "applications",
      label: "Application status changed",
      description: "Shortlisted, rejected or any other update to your application.",
      legacyCategory: "applications",
      emailDefault: true,
      push: false,
    },
    recruiter: {
      group: "candidates",
      label: "Candidate status changed",
      description: "When a candidate moves between stages on one of your jobs.",
      legacyCategory: "candidates",
      emailDefault: false,
      push: false,
    },
  }),
  recruiter_message: views({
    candidate: {
      group: "applications",
      label: "Messages from the hiring team",
      description: "Direct messages about your application.",
      legacyCategory: "applications",
      emailDefault: true,
      push: false,
    },
  }),
  interview_invitation: views({
    candidate: {
      group: "interviews",
      label: "Interview invitation",
      description: "When you are invited to an interview.",
      legacyCategory: "interviews",
      emailDefault: true,
      push: false,
    },
  }),
  interview_rescheduled: views({
    candidate: {
      group: "interviews",
      label: "Interview rescheduled",
      description: "When the time of your interview changes.",
      legacyCategory: "interviews",
      emailDefault: true,
      push: false,
    },
  }),
  interview_cancelled: views({
    candidate: {
      group: "interviews",
      label: "Interview cancelled",
      description: "When an interview you were booked for is cancelled.",
      legacyCategory: "interviews",
      emailDefault: true,
      push: false,
    },
  }),
  job_alert: views({
    candidate: {
      group: "jobs",
      label: "Job recommendations & saved job alerts",
      description: "New roles that match your saved alerts.",
      legacyCategory: "jobs",
      emailDefault: true,
      push: false,
    },
  }),
  resume_processed: views({
    candidate: {
      group: "ai_career",
      label: "Resume & profile suggestions",
      description: "AI review results and suggestions for your resume.",
      legacyCategory: "ai_career",
      emailDefault: true,
      push: false,
    },
  }),
  resume_processing_failed: views({
    candidate: {
      group: "ai_career",
      label: "Resume processing issues",
      description: "When we could not read one of your resumes.",
      legacyCategory: "ai_career",
      emailDefault: false,
      push: false,
    },
  }),

  /* ------------------------------ recruiters ---------------------------- */
  job_submitted_for_approval: views({
    recruiter: {
      group: "jobs",
      label: "Job submitted for approval",
      description: "When one of your jobs goes in for platform review.",
      legacyCategory: "jobs",
      emailDefault: false,
      push: false,
    },
    admin: {
      group: "approvals",
      label: "New job approval",
      description: "A company submitted a job that needs review.",
      legacyCategory: "approvals",
      emailDefault: false,
      push: false,
    },
  }),
  job_moderation: views({
    recruiter: {
      group: "jobs",
      label: "Job approved or rejected",
      description: "Platform decisions on your jobs and job changes.",
      legacyCategory: "jobs",
      emailDefault: false,
      push: false,
    },
  }),
  job_changes_submitted: views({
    recruiter: {
      group: "jobs",
      label: "Job edit requires approval",
      description: "Your updated job details are waiting for platform review.",
      legacyCategory: "jobs",
      emailDefault: false,
      push: false,
    },
    admin: {
      group: "approvals",
      label: "Job modification requiring review",
      description: "A company changed a live job; review before it goes live.",
      legacyCategory: "approvals",
      emailDefault: false,
      push: false,
    },
  }),
  new_application: views({
    recruiter: {
      group: "candidates",
      label: "New application",
      description: "When a candidate applies to one of your jobs.",
      legacyCategory: "candidates",
      emailDefault: false,
      push: false,
    },
  }),
  application_withdrawn: views({
    recruiter: {
      group: "candidates",
      label: "Candidate withdrew",
      description: "When a candidate withdraws their application.",
      legacyCategory: "candidates",
      emailDefault: false,
      push: false,
    },
  }),
  interview_confirmed: views({
    recruiter: {
      group: "interviews",
      label: "Candidate confirmed interview",
      description: "When a candidate confirms their interview.",
      legacyCategory: "interviews",
      emailDefault: false,
      push: false,
    },
  }),
  interview_reschedule_requested: views({
    recruiter: {
      group: "interviews",
      label: "Candidate requested reschedule",
      description: "When a candidate asks for a new interview time.",
      legacyCategory: "interviews",
      emailDefault: false,
      push: false,
    },
  }),
  member_invited: views({
    recruiter: {
      group: "team",
      label: "Team member invited",
      description: "When someone invites a new member to the company.",
      legacyCategory: "team",
      emailDefault: false,
      push: false,
    },
  }),
  invitation_accepted: views({
    recruiter: {
      group: "team",
      label: "Invitation accepted",
      description: "When an invited member joins the company.",
      legacyCategory: "team",
      emailDefault: false,
      push: false,
    },
  }),
  member_role_changed: views({
    recruiter: {
      group: "team",
      label: "Member role changed",
      description: "When a team member's role is changed.",
      legacyCategory: "team",
      push: false,
    },
  }),
  member_removed: views({
    recruiter: {
      group: "team",
      label: "Member removed",
      description: "When a team member is removed from the company.",
      legacyCategory: "team",
      emailDefault: false,
      push: false,
    },
  }),

  /* --------------------------------- admins ----------------------------- */
  organization_registered: views({
    admin: {
      group: "companies",
      label: "New company",
      description: "A new company registered on the platform.",
      legacyCategory: "companies",
      emailDefault: false,
      push: false,
    },
  }),
  user_registered: views({
    admin: {
      group: "users",
      label: "New user",
      description: "A new account was created on the platform.",
      legacyCategory: "users",
      emailDefault: false,
      push: false,
    },
  }),
  security_alert: views({
    admin: {
      group: "security",
      label: "Security alerts",
      description: "Sign-in and account security events across the platform.",
      legacyCategory: "security",
      emailDefault: false,
      push: false,
    },
  }),

  /* ------------------- security & account (always on) ------------------- */
  password_changed: views({
    candidate: {
      group: "security",
      label: "Password changes",
      description: "Every time your password changes.",
      legacyCategory: "security",
      emailDefault: true,
      push: false,
    },
    recruiter: {
      group: "security",
      label: "Password changes",
      description: "Every time your password changes.",
      legacyCategory: "security",
      emailDefault: true,
      push: false,
    },
    admin: {
      group: "security",
      label: "Password changes",
      description: "Every time your password changes.",
      legacyCategory: "security",
      emailDefault: true,
      push: false,
    },
  }),
  password_reset: views({
    candidate: {
      group: "security",
      label: "Password resets",
      description: "When your password is reset.",
      legacyCategory: "security",
      push: false,
    },
    recruiter: {
      group: "security",
      label: "Password resets",
      description: "When your password is reset.",
      legacyCategory: "security",
      push: false,
    },
    admin: {
      group: "security",
      label: "Password resets",
      description: "When your password is reset.",
      legacyCategory: "security",
      push: false,
    },
  }),
  email_changed: views({
    candidate: {
      group: "security",
      label: "Email address changes",
      description: "When your email address is changed.",
      legacyCategory: "security",
      emailDefault: true,
      push: false,
    },
    recruiter: {
      group: "security",
      label: "Email address changes",
      description: "When your email address is changed.",
      legacyCategory: "security",
      emailDefault: true,
      push: false,
    },
    admin: {
      group: "security",
      label: "Email address changes",
      description: "When your email address is changed.",
      legacyCategory: "security",
      emailDefault: true,
      push: false,
    },
  }),
};

/** Preference groups shown to each recipient role, in display order. */
const GROUPS = {
  candidate: [
    ["applications", "Applications", "Submissions, updates and messages about your applications."],
    ["interviews", "Interviews", "Invitations, schedule changes and cancellations."],
    ["jobs", "Jobs", "Roles that match your saved alerts."],
    ["ai_career", "AI & Career", "AI review results and suggestions for your profile."],
    ["security", "Account & Security", "Password, email and security events."],
  ],
  recruiter: [
    ["jobs", "Jobs", "Approvals and review updates for your company's jobs."],
    ["candidates", "Candidates", "New applications and candidate updates."],
    ["interviews", "Interviews", "Confirmations, reschedules and candidate responses."],
    ["team", "Team", "Invitations, role changes and membership updates."],
    ["security", "Account & Security", "Password, email and security events."],
  ],
  admin: [
    ["approvals", "Approvals", "Jobs and job changes that need platform review."],
    ["companies", "Companies", "New companies on the platform."],
    ["users", "Users", "New accounts and account events."],
    ["security", "Account & Security", "Security alerts and your own account events."],
  ],
};

const ROLE_KEYS = Object.keys(GROUPS);

/** Security & account events are never suppressible by preferences. */
const isAlwaysOn = (type, role) => EVENTS[type]?.[role]?.group === "security";

/** The stored category for an event, per recipient role. */
const categoryFor = (type, role) => EVENTS[type]?.[role]?.group || null;

/** The view of `type` for a recipient role, or null when that role never gets it. */
const viewFor = (type, role) => EVENTS[type]?.[role] || null;

/** Every preference key the API will accept (union across roles). */
const ALL_EVENT_KEYS = new Set(Object.keys(EVENTS));

/**
 * The preference template for a recipient role: ordered groups with their
 * events, channel support and default state. The client renders the
 * notification preference UI entirely from this.
 */
const templateForRole = (role) => {
  const groups = GROUPS[role] || [];
  return groups.map(([key, label, description]) => ({
    key,
    label,
    description,
    alwaysOn: key === "security",
    events: Object.entries(EVENTS)
      .filter(([, entry]) => entry[role]?.group === key)
      .map(([type, entry]) => ({
        key: type,
        label: entry[role].label,
        description: entry[role].description,
        alwaysOn: key === "security",
        channels: { inApp: true, email: Boolean(entry[role].emailDefault), push: false },
      })),
  }));
};

module.exports = {
  EVENTS,
  GROUPS,
  ROLE_KEYS,
  ALL_EVENT_KEYS,
  isAlwaysOn,
  categoryFor,
  viewFor,
  templateForRole,
};
