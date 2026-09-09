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

module.exports = { buildNotificationEmail };
