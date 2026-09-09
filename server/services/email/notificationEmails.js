/**
 * Renders notification emails from the structured context passed by the
 * business code. The in-app notification keeps its short title/message;
 * the email gets the full picture — company, role, job, candidate,
 * interview time — so the recipient never gets a generic email when the
 * system knows the details.
 *
 * Builders live in one registry; unknown event types fall back to a
 * clean generic render of the notification's title/message.
 */

const { config } = require("../../config/env");
const { renderEmail, roleLabel, fmtDate, fmtDateTime } = require("./templates");

const appUrl = (path) => `${config.clientUrl}${path}`;

const interviewFormat = (type) => {
  const map = { online: "Video call", in_person: "In person", phone: "Phone call" };
  return map[String(type || "").toLowerCase()] || (type ? roleLabel(type) : "");
};

const interviewDetails = ({
  jobTitle,
  company,
  scheduledStart,
  timezone,
  type,
  location,
  dateLabel = "Date & time",
}) => {
  const rows = [];
  if (jobTitle) rows.push({ label: "Role", value: jobTitle });
  if (company) rows.push({ label: "Company", value: company });
  if (scheduledStart) rows.push({ label: dateLabel, value: fmtDateTime(scheduledStart, timezone) });
  const format = interviewFormat(type);
  if (format) rows.push({ label: "Format", value: format });
  if (location && String(type || "").toLowerCase() === "in_person")
    rows.push({ label: "Location", value: location });
  return rows;
};

const builders = {
  /* ------------------------------ jobs ------------------------------ */
  job_submitted_for_approval: ({ context: c }) =>
    renderEmail({
      subject: `Job submitted for approval: ${c.jobTitle}`,
      preheader: "Your job is waiting for platform review.",
      title: "Job submitted for approval",
      body: [
        `Your job "${c.jobTitle}" has been submitted for admin approval. It will be visible to candidates once approved.`,
      ],
      details: [
        { label: "Role", value: c.jobTitle },
        { label: "Company", value: c.company },
        { label: "Location", value: c.location },
        { label: "Status", value: "Pending approval" },
      ],
      cta: c.organizationId
        ? { label: "View Job", url: appUrl(`/app/o/${c.organizationId}/jobs`) }
        : null,
      note: {
        tone: "brand",
        text: "Most reviews complete quickly. You'll get an email as soon as a decision is made.",
      },
    }),

  job_changes_submitted: ({ context: c }) =>
    renderEmail({
      subject: `Job changes submitted for review: ${c.jobTitle}`,
      preheader: "Your updated job details are waiting for review.",
      title: "Job changes submitted",
      body: [
        `Updated details for "${c.jobTitle}" have been submitted for review. The current approved version remains visible until changes are approved.`,
      ],
      details: [
        { label: "Role", value: c.jobTitle },
        { label: "Company", value: c.company },
        { label: "Location", value: c.location },
        { label: "Status", value: "Review pending" },
      ],
      cta: c.organizationId && c.jobId
        ? { label: "View Job", url: appUrl(`/app/o/${c.organizationId}/jobs/${c.jobId}/edit`) }
        : null,
      note: {
        tone: "info",
        text: "You will receive an update once the platform moderation team reviews your changes.",
      },
    }),

  job_moderation: ({ context: c }) => {
    const approved = Boolean(c.approved);
    const isChangeReview = Boolean(c.isChangeReview);
    const what = isChangeReview ? "changes" : "job";
    const rows = [
      { label: "Role", value: c.jobTitle },
      { label: "Company", value: c.company },
      { label: "Location", value: c.location },
    ];
    if (!approved && c.reason) rows.push({ label: "Reason", value: c.reason });
    return renderEmail({
      subject: `${approved ? "Job approved" : "Job rejected"}: ${c.jobTitle}`,
      preheader: approved
        ? `Your ${what} is approved.`
        : `Your ${what} was not approved.`,
      title: approved ? "Job approved" : "Job not approved",
      body: [
        approved
          ? isChangeReview
            ? `Your changes for "${c.jobTitle}" were approved and are now live.`
            : `Your job "${c.jobTitle}" has been approved and is now available according to the platform's approval rules.`
          : isChangeReview
            ? `Your job changes for "${c.jobTitle}" were rejected${c.reason ? `. Reason: ${c.reason}` : ""}. The previously approved version remains visible; edit and resubmit to try again.`
            : `Your job "${c.jobTitle}" was not approved${c.reason ? `. Reason: ${c.reason}` : ""}. You can edit it and republish when you're ready.`,
      ],
      details: rows,
      cta: c.organizationId && c.jobId
        ? { label: "View Job", url: appUrl(`/app/o/${c.organizationId}/jobs/${c.jobId}/applications`) }
        : null,
      note: approved
        ? { tone: "brand", text: "The job is now visible to candidates on HireSmart AI." }
        : {
            tone: "warning",
            text: "The job is not visible to candidates. You can edit and republish it to request another review.",
          },
    });
  },

  /* -------------------------- applications -------------------------- */
  application_acknowledged: ({ context: c, greeting }) =>
    renderEmail({
      subject: `Application received: ${c.jobTitle}`,
      preheader: "Thanks for applying — your application is in.",
      greeting,
      title: "Application received",
      body: [
        `Thanks for applying. Your application for the ${c.jobTitle} role${c.company ? ` at ${c.company}` : ""} was received. The hiring team will review it and keep you posted.`,
      ],
      details: [
        { label: "Role", value: c.jobTitle },
        { label: "Company", value: c.company },
        { label: "Applied", value: c.appliedAt ? fmtDate(c.appliedAt) : "" },
      ],
      cta: c.applicationId
        ? { label: "View Application", url: appUrl(`/app/candidate/applications/${c.applicationId}`) }
        : null,
      note: {
        tone: "brand",
        text: "You'll get an email whenever your application status changes.",
      },
    }),

  new_application: ({ context: c }) =>
    renderEmail({
      subject: `New application: ${c.jobTitle}`,
      preheader: `${c.applicantName || "A candidate"} applied for ${c.jobTitle}.`,
      title: "New application received",
      body: [
        `A new candidate application was submitted for the ${c.jobTitle} position.`,
      ],
      details: [
        { label: "Role", value: c.jobTitle },
        { label: "Candidate", value: c.applicantName || "Candidate" },
        { label: "Applied", value: c.appliedAt ? fmtDate(c.appliedAt) : fmtDate(new Date()) },
      ],
      cta: c.organizationId && c.applicationId
        ? { label: "Review Application", url: appUrl(`/app/o/${c.organizationId}/applications/${c.applicationId}`) }
        : null,
      note: {
        tone: "brand",
        text: "Review candidate qualifications, hybrid match breakdown, and resume details in your hiring workspace.",
      },
    }),

  application_status_changed: ({ context: c, greeting }) => {
    const toStatus = String(c.toStatus || "");
    const shortlisted = toStatus === "shortlisted";
    const rejected = toStatus === "rejected";
    const title = shortlisted
      ? "You've been shortlisted"
      : "Update on your application";
    return renderEmail({
      subject: `${shortlisted ? "You've been shortlisted" : "Application update"}: ${c.jobTitle}`,
      preheader: `Your application for ${c.jobTitle} was ${c.statusLabel || toStatus}.`,
      greeting,
      title,
      body: [
        `Your application for the ${c.jobTitle} role${c.company ? ` at ${c.company}` : ""} has been ${c.statusLabel || toStatus}.`,
      ],
      details: [
        { label: "Role", value: c.jobTitle },
        { label: "Company", value: c.company },
        { label: "Status", value: c.statusLabel || toStatus },
      ],
      cta: c.applicationId
        ? { label: "View Application", url: appUrl(`/app/candidate/applications/${c.applicationId}`) }
        : null,
      note: shortlisted
        ? { tone: "brand", text: "The hiring team will be in touch about next steps." }
        : rejected
          ? {
              tone: "info",
              text: "This decision only applies to this role — your profile stays active on HireSmart AI, so keep applying to roles that fit.",
            }
          : null,
    });
  },

  application_withdrawn: ({ context: c }) =>
    renderEmail({
      subject: `Application withdrawn: ${c.jobTitle}`,
      preheader: `${c.candidateName || "A candidate"} withdrew their application.`,
      title: "Application withdrawn",
      body: [
        `${c.candidateName || "A candidate"} withdrew their application for the ${c.jobTitle} role.`,
      ],
      details: [
        { label: "Role", value: c.jobTitle },
        { label: "Candidate", value: c.candidateName || "" },
      ],
      cta: c.organizationId
        ? { label: "View Applications", url: appUrl(`/app/o/${c.organizationId}/jobs`) }
        : null,
    }),

  recruiter_message: ({ context: c, greeting, message }) =>
    renderEmail({
      subject: `Message from hiring team: ${c.jobTitle || "Application"}`,
      preheader: "A message was sent regarding your application.",
      greeting,
      title: "Message from hiring team",
      body: [
        message || "You have received a direct message from the hiring team regarding your application.",
      ],
      details: [
        { label: "Role", value: c.jobTitle },
        { label: "Company", value: c.company },
      ],
      cta: c.applicationId
        ? { label: "View Application", url: appUrl(`/app/candidate/applications/${c.applicationId}`) }
        : null,
    }),

  /* ---------------------------- interviews ---------------------------- */
  interview_invitation: ({ context: c, greeting }) =>
    renderEmail({
      subject: `Interview invitation: ${c.jobTitle}`,
      preheader: `${c.company || "A company"} proposed an interview for the ${c.jobTitle} role.`,
      greeting,
      title: "Interview invitation",
      body: [
        `${c.company || "The hiring team"} has proposed an interview for the ${c.jobTitle} role. Review the details and confirm your attendance.`,
      ],
      details: interviewDetails(c),
      cta: c.interviewId
        ? { label: "Review Interview", url: appUrl(`/app/candidate/interviews/${c.interviewId}`) }
        : null,
      note: {
        tone: "brand",
        text: "If the time doesn't work for you, you can request a new time from the interview page.",
      },
    }),

  interview_rescheduled: ({ context: c, greeting }) =>
    renderEmail({
      subject: `Interview rescheduled: ${c.jobTitle}`,
      preheader: `Your ${c.jobTitle} interview has moved — confirm the new time.`,
      greeting,
      title: "Interview rescheduled",
      body: [
        `Your interview for the ${c.jobTitle} role has been moved. Please review the new time and confirm so the team knows you're still on board.`,
      ],
      details: interviewDetails({ ...c, dateLabel: "New date & time" }),
      cta: c.interviewId
        ? { label: "Review Interview", url: appUrl(`/app/candidate/interviews/${c.interviewId}`) }
        : null,
    }),

  interview_confirmed: ({ context: c }) =>
    renderEmail({
      subject: `Interview confirmed: ${c.jobTitle}`,
      preheader: `${c.candidateName || "The candidate"} confirmed the ${c.jobTitle} interview.`,
      title: "Interview confirmed",
      body: [
        `${c.candidateName || "The candidate"} confirmed the ${c.jobTitle} interview${
          c.scheduledStart ? ` scheduled for ${fmtDateTime(c.scheduledStart, c.timezone)}` : ""
        }.`,
      ],
      details: [
        { label: "Candidate", value: c.candidateName || "" },
        { label: "Role", value: c.jobTitle },
        { label: "Date & time", value: c.scheduledStart ? fmtDateTime(c.scheduledStart, c.timezone) : "" },
      ],
      cta: c.organizationId && c.interviewId
        ? { label: "View Interview", url: appUrl(`/app/o/${c.organizationId}/interviews/${c.interviewId}`) }
        : null,
    }),

  interview_reschedule_requested: ({ context: c }) =>
    renderEmail({
      subject: `Interview reschedule requested: ${c.jobTitle || "Interview"}`,
      preheader: `${c.candidateName || "A candidate"} requested a new interview time.`,
      title: "Reschedule requested",
      body: [
        `${c.candidateName || "The candidate"} requested a new interview time${c.reason ? `: "${c.reason}"` : ""}.`,
      ],
      details: [
        { label: "Candidate", value: c.candidateName || "" },
        { label: "Role", value: c.jobTitle || "" },
        { label: "Reason", value: c.reason || "Candidate requested alternative time" },
      ],
      cta: c.organizationId && c.interviewId
        ? { label: "Reschedule Interview", url: appUrl(`/app/o/${c.organizationId}/interviews/${c.interviewId}`) }
        : null,
    }),

  interview_cancelled: ({ context: c, greeting }) =>
    renderEmail({
      subject: `Interview cancelled: ${c.jobTitle}`,
      preheader: `The ${c.jobTitle} interview was cancelled.`,
      greeting,
      title: "Interview cancelled",
      body: [
        `Your interview for the ${c.jobTitle} role has been cancelled${c.reason ? `. Reason: ${c.reason}` : ""}.`,
      ],
      details: [
        { label: "Role", value: c.jobTitle },
        { label: "Date & time", value: c.scheduledStart ? fmtDateTime(c.scheduledStart, c.timezone) : "" },
      ],
      cta: c.interviewId
        ? { label: "Review Interview", url: appUrl(`/app/candidate/interviews/${c.interviewId}`) }
        : null,
    }),

  /* ----------------------------- team ----------------------------- */
  member_invited: ({ context: c }) =>
    renderEmail({
      subject: `Team member invited to ${c.orgName || "Company"}`,
      preheader: `${c.email} was invited as a ${roleLabel(c.role)}.`,
      title: "Team invitation sent",
      body: [
        `An invitation to join ${c.orgName || "your company"} as a ${roleLabel(c.role)} was sent to ${c.email}.`,
      ],
      details: [
        { label: "Invited Email", value: c.email },
        { label: "Assigned Role", value: roleLabel(c.role) },
        { label: "Invited By", value: c.inviterName || "" },
      ],
      cta: c.organizationId
        ? { label: "View Team", url: appUrl(`/app/o/${c.organizationId}/team`) }
        : null,
    }),

  invitation_accepted: ({ context: c }) =>
    renderEmail({
      subject: `Invitation accepted: ${c.memberName || "New teammate"} joined`,
      preheader: `${c.memberName || "A new member"} joined ${c.orgName || "your company"}.`,
      title: "New member joined your team",
      body: [
        `${c.memberName || "A team member"} accepted the invitation and joined ${c.orgName || "your company"} as a ${roleLabel(c.role)}.`,
      ],
      details: [
        { label: "Member Name", value: c.memberName || "" },
        { label: "Email", value: c.email || "" },
        { label: "Role", value: roleLabel(c.role) },
      ],
      cta: c.organizationId
        ? { label: "View Team", url: appUrl(`/app/o/${c.organizationId}/team`) }
        : null,
    }),

  member_role_changed: ({ context: c }) =>
    renderEmail({
      subject: `Role updated for ${c.memberName || "team member"}`,
      preheader: `Role updated to ${roleLabel(c.role)}.`,
      title: "Team member role changed",
      body: [
        `The organization role for ${c.memberName || "a team member"} was updated to ${roleLabel(c.role)}.`,
      ],
      details: [
        { label: "Member", value: c.memberName || "" },
        { label: "New Role", value: roleLabel(c.role) },
      ],
      cta: c.organizationId
        ? { label: "View Team", url: appUrl(`/app/o/${c.organizationId}/team`) }
        : null,
    }),

  member_removed: ({ context: c }) =>
    renderEmail({
      subject: `Member removed from ${c.orgName || "team"}`,
      preheader: `${c.memberName || "A member"} was removed from the organization.`,
      title: "Team member removed",
      body: [
        `${c.memberName || "A team member"} was removed from ${c.orgName || "the organization"}.`,
      ],
      details: [
        { label: "Member", value: c.memberName || "" },
        { label: "Organization", value: c.orgName || "" },
      ],
    }),

  /* ----------------------------- AI & resume ----------------------------- */
  resume_processed: ({ context: c, greeting }) =>
    renderEmail({
      subject: "Your resume is processed and ready",
      preheader: "AI analysis and ATS readiness scores are available.",
      greeting,
      title: "Resume processed successfully",
      body: [
        "Your resume has been processed. We extracted your skill evidence and calculated ATS readiness scores to help optimize your job applications.",
      ],
      details: [
        { label: "Resume File", value: c.fileName || "Uploaded resume" },
        { label: "Skills Detected", value: c.skillsCount ? `${c.skillsCount} skills` : "Extracted" },
      ],
      cta: c.versionId
        ? { label: "View Resume Analysis", url: appUrl(`/app/candidate/resumes/${c.versionId}`) }
        : { label: "View Resumes", url: appUrl("/app/candidate/resumes") },
      note: {
        tone: "brand",
        text: "Review extracted skills and ATS suggestions to ensure your profile highlights your verified achievements.",
      },
    }),

  resume_processing_failed: ({ context: c, greeting }) =>
    renderEmail({
      subject: "Resume processing issue",
      preheader: "We could not read your uploaded resume.",
      greeting,
      title: "Resume processing problem",
      body: [
        "There was a problem reading your resume file. Please ensure it is a valid PDF or DOCX file under 10MB.",
      ],
      details: [
        { label: "Resume File", value: c.fileName || "Uploaded resume" },
        { label: "Issue", value: c.reason || "File formatting could not be parsed" },
      ],
      cta: { label: "Upload New Resume", url: appUrl("/app/candidate/resumes") },
      note: {
        tone: "warning",
        text: "You can re-upload your resume at any time from your resume management dashboard.",
      },
    }),

  job_alert: ({ context: c, greeting }) =>
    renderEmail({
      subject: `New job matches: ${c.alertName || "Saved Alert"}`,
      preheader: "New roles matching your search criteria are available.",
      greeting,
      title: "New job opportunities",
      body: [
        `New job postings matching your saved criteria "${c.alertName || "job alert"}" have been published on HireSmart AI.`,
      ],
      details: [
        { label: "Alert", value: c.alertName || "Job Search" },
        { label: "Matching Jobs", value: c.count ? `${c.count} new roles` : "New openings" },
      ],
      cta: { label: "View Matches", url: appUrl("/app/candidate/jobs") },
    }),

  /* ----------------------------- platform & admin ----------------------------- */
  organization_registered: ({ context: c }) =>
    renderEmail({
      subject: `New company registered: ${c.orgName}`,
      preheader: `${c.orgName} registered on HireSmart AI.`,
      title: "New company registered",
      body: [
        `A new employer organization "${c.orgName}" was registered on the platform.`,
      ],
      details: [
        { label: "Company", value: c.orgName },
        { label: "Industry", value: c.industry || "General" },
        { label: "Created By", value: c.creatorName || c.email || "Employer" },
      ],
      cta: c.orgId
        ? { label: "View Company", url: appUrl(`/app/admin/organizations/${c.orgId}`) }
        : null,
    }),

  user_registered: ({ context: c }) =>
    renderEmail({
      subject: `New user registration: ${c.userName || c.email}`,
      preheader: `New ${roleLabel(c.role || "user")} registered.`,
      title: "New user account created",
      body: [
        `A new user account was registered on HireSmart AI.`,
      ],
      details: [
        { label: "Name", value: c.userName || "User" },
        { label: "Email", value: c.email || "" },
        { label: "Account Type", value: roleLabel(c.role || "candidate") },
      ],
      cta: { label: "Admin Users", url: appUrl("/app/admin/users") },
    }),

  /* ----------------------------- security ----------------------------- */
  password_changed: ({ context: c, greeting }) =>
    renderEmail({
      subject: "Your HireSmart AI password was changed",
      preheader: "A password change was made on your account.",
      greeting,
      title: "Password changed",
      body: [
        "Your HireSmart AI password was changed successfully. Your other sessions were signed out as a precaution.",
      ],
      details: [
        { label: "When", value: c.at ? fmtDateTime(c.at) : "" },
      ],
      cta: { label: "Go to Sign In", url: appUrl("/auth/login") },
      note: {
        tone: "warning",
        text: "If this wasn't you, sign in immediately and change your password again, then review your security activity.",
      },
    }),

  email_changed: ({ context: c, greeting }) =>
    renderEmail({
      subject: "Your HireSmart AI email address was updated",
      preheader: "Your account email address changed.",
      greeting,
      title: "Email address updated",
      body: [
        "The email address on your HireSmart AI account was updated. You'll need to verify the new address from the email we just sent to it.",
      ],
      details: [{ label: "New email address", value: c.email || "" }],
      cta: { label: "Go to Sign In", url: appUrl("/auth/login") },
      note: {
        tone: "warning",
        text: "If you did not make this change, sign in immediately and set your email back to the address you use.",
      },
    }),

  security_alert: ({ context: c, greeting }) => {
    const eventLabels = {
      "session.refresh_token_reuse": "Possible session takeover",
      "suspicious_login": "Unusual login activity",
      "privilege_escalation": "Unauthorized permission attempt",
    };
    const label = eventLabels[c.event] || roleLabel(String(c.event || "security event"));
    return renderEmail({
      subject: "Important security alert",
      preheader: "We secured your account after unusual activity.",
      greeting,
      title: "We secured your account",
      body: [
        `We detected ${label.toLowerCase()} on your HireSmart AI account. As a precaution, we signed you out of all devices.`,
        "If you recognize this activity, simply sign in again. If this wasn't you, reset your password now — anyone with your password could try to access your account.",
      ],
      details: [
        { label: "What happened", value: label },
        { label: "When", value: c.at ? fmtDateTime(c.at) : "" },
      ],
      cta: { label: "Reset your password", url: appUrl("/auth/forgot-password") },
      note: {
        tone: "danger",
        text: "If this wasn't you, change your password immediately and review your recent security activity.",
      },
    });
  },
};

/**
 * Builds the premium email for a queued notification. Falls back to a
 * clean generic render (title + message) for events without a dedicated
 * builder so every email still carries the full HireSmart layout.
 */
const buildNotificationEmail = ({ type, subject, message, context = {} }) => {
  const builder = builders[type];
  const name = context.name || "";
  const greeting = name ? `Hi ${String(name).split(" ")[0]},` : "Hi there,";
  if (!builder)
    return renderEmail({
      subject,
      preheader: message || subject,
      greeting,
      title: subject,
      body: [message],
      cta: context.cta || null,
      note: context.note || null,
    });
  return builder({ context, subject, message, greeting });
};

module.exports = { buildNotificationEmail, builders };
