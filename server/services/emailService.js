const nodemailer = require("nodemailer");
const { config } = require("../config/env");
const logger = require("../utils/logger");

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

const sendVerificationEmail = async ({ email, token }) => {
    const verifyUrl = `${config.clientUrl || "http://localhost:5173"}/verify-email?token=${token}`;
    return sendMail({
        to: email,
        subject: "Verify your HireSmart AI email address",
        text: `Please verify your email by visiting the following link: ${verifyUrl}`,
        html: `<p>Please verify your email by clicking the link below:</p><p><a href="${verifyUrl}">Verify Email</a></p><p>If you did not create an account, please ignore this message.</p>`,
    });
};

const sendPasswordResetEmail = async ({ email, token }) => {
    const resetUrl = `${config.clientUrl || "http://localhost:5173"}/reset-password?token=${token}`;
    return sendMail({
        to: email,
        subject: "Reset your HireSmart AI password",
        text: `You can reset your password by visiting the following link: ${resetUrl}`,
        html: `<p>Reset your password by clicking the link below:</p><p><a href="${resetUrl}">Reset Password</a></p><p>If you did not request a password reset, please ignore this message.</p>`,
    });
};

const sendInviteEmail = async ({ to, orgName, role, link }) => {
    const roleLabel = String(role).replace(/_/g, " ");
    return sendMail({
        to,
        subject: `You have been invited to join ${orgName}`,
        text: `You have been invited to join ${orgName} as a ${roleLabel}.\n\nOpen this link to accept (it expires in 7 days):\n${link}\n\nIf you did not expect this invitation, you can ignore this email.`,
        html: `<p>You have been invited to join <strong>${orgName}</strong> as a <strong>${roleLabel}</strong>.</p><p><a href="${link}">Open your invitation</a></p><p>The link expires in 7 days. If you did not expect this invitation, you can ignore this email.</p>`,
    });
};

module.exports = {
    sendMail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendInviteEmail,
};
