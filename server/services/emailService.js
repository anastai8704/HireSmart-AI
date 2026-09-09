const nodemailer = require("nodemailer");
const { config } = require("../config/env");
const logger = require("../utils/logger");
const { renderEmail, roleLabel, fmtDate, escapeHtml } = require("./email/templates");

const createTransporter = () => {
  if (config.smtpHost && config.smtpUser && config.smtpPass) {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    });
  }

  if (config.isTest) {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
    buffer: true,
  });
};

const transporter = createTransporter();

const sendMail = async ({ to, subject, text, html }) => {
  const message = {
    from: config.emailFrom,
    to,
    subject,
    text,
    html,
  };

  const result = await transporter.sendMail(message);

  if (!config.smtpHost) {
    logger.info(`Email delivery simulated for ${to}: ${subject}`);
  }

  return result;
};

/** Sends a transactional email rendered through the shared design system. */
const sendTemplated = async (to, email) => sendMail({ to, ...email });

const sendVerificationEmail = async ({ email, token, name }) => {
  const verifyUrl = `${config.clientUrl}/verify-email?token=${token}`;
  const rendered = renderEmail({
    subject: "Verify your HireSmart AI email address",
    preheader: "One click and your email is verified.",
    greeting: name ? `Hi ${String(name).split(" ")[0]},` : "Hi there,",
    title: "Verify your email address",
    body: [
      "Confirm your email address to activate your HireSmart AI account.",
      `This link expires in ${Math.round(config.emailVerificationTokenExpiresIn / 3600000)} hours.`,
    ],
    cta: { label: "Verify Email", url: verifyUrl },
    note: {
      tone: "info",
      text: "If you did not create an account, you can safely ignore this message.",
    },
  });
  return sendTemplated(email, rendered);
};

const sendEmailChangeEmail = async ({ email, token, name }) => {
  const changeUrl = `${config.clientUrl}/change-email?token=${token}`;
  const rendered = renderEmail({
    subject: "Confirm your new HireSmart AI email address",
    preheader: "Confirm to switch your account to this address.",
    greeting: name ? `Hi ${String(name).split(" ")[0]},` : "Hi there,",
    title: "Confirm your new email address",
    body: [
      `You requested to use ${email} for your HireSmart AI account. Confirm below to make it your sign-in address.`,
      "Your current address stays active until you confirm the change.",
    ],
    cta: { label: "Confirm New Email", url: changeUrl },
    note: {
      tone: "info",
      text: "If you did not request this change, you can ignore this message — your account is unchanged.",
    },
  });
  return sendTemplated(email, rendered);
};

const sendPasswordResetEmail = async ({ email, token, name }) => {
  const resetUrl = `${config.clientUrl}/auth/reset-password?token=${token}`;
  const hours = Math.round(config.passwordResetTokenExpiresIn / 3600000);
  const rendered = renderEmail({
    subject: "Reset your HireSmart AI password",
    preheader: `Your reset link expires in ${hours} hour${hours === 1 ? "" : "s"}.`,
    greeting: name ? `Hi ${String(name).split(" ")[0]},` : "Hi there,",
    title: "Reset your password",
    body: [
      "We received a request to reset your password.",
      `For your security, the link below expires in ${hours} hour${hours === 1 ? "" : "s"}.`,
    ],
    details: [{ label: "Link expires in", value: `${hours} hour${hours === 1 ? "" : "s"}` }],
    cta: { label: "Reset Password", url: resetUrl },
    note: {
      tone: "warning",
      text: "If you did not request a password reset, ignore this email. Your password will not change until you complete the reset.",
    },
  });
  return sendTemplated(email, rendered);
};

const sendInviteEmail = async ({ to, orgName, role, link, inviterName, expiresAt }) => {
  const label = roleLabel(role);
  const rendered = renderEmail({
    subject: `You're invited to join ${orgName}`,
    preheader: `${inviterName || "A team member"} invited you to join ${orgName} as a ${label}.`,
    title: `You're invited to join ${orgName}`,
    body: [
      `${inviterName || "A team member"} invited you to join ${orgName} as a ${label}. Accept the invitation to create your account — the role is set by the invitation, so there is nothing to configure.`,
    ],
    details: [
      { label: "Company", value: orgName },
      { label: "Role", value: label },
      { label: "Invited by", value: inviterName || "" },
      { label: "Invitation expires", value: expiresAt ? fmtDate(expiresAt) : "in 7 days" },
    ],
    cta: { label: "Accept Invitation", url: link },
    note: {
      tone: "info",
      text: `This invitation is only valid for ${to} and can be used once. If you did not expect it, you can ignore this email.`,
    },
  });
  return sendTemplated(to, rendered);
};

module.exports = {
  sendMail,
  sendTemplated,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendInviteEmail,
  sendEmailChangeEmail,
  renderEmail,
  roleLabel,
  fmtDate,
  escapeHtml,
};
