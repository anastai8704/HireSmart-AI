/**
 * HireSmart AI transactional email design system.
 *
 * One reusable layout (white content card, brand header, CTA, detail
 * table, note box, footer) rendered with table-based markup and inline
 * CSS so it survives Gmail, Outlook and mobile email clients. No external
 * assets: the logo is drawn with HTML/CSS so the email renders even when
 * images are blocked.
 *
 * Every renderer returns { subject, preheader, html, text } — the text
 * version is a faithful plain-text mirror of the same content.
 */

const { config } = require("../../config/env");

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** "hiring_manager" -> "Hiring Manager" (display label only). */
const roleLabel = (role) =>
  String(role || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** 14 September 2026 */
const fmtDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

/** "Tue, 15 Sep 2026, 3:30 pm" + the zone it was shown in. */
const fmtDateTime = (value, timezone) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const options = {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  let label;
  try {
    label = timezone
      ? date.toLocaleString("en-GB", { ...options, timeZone: timezone })
      : date.toLocaleString("en-GB", { ...options, timeZone: "UTC" });
  } catch (_error) {
    label = date.toUTCString();
  }
  return `${label} (${timezone || "UTC"})`;
};

const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

const palette = {
  brand600: "#5c50d4",
  brand700: "#4d42b2",
  brand50: "#f0effe",
  brand200: "#cbc8fb",
  ink50: "#f5f6fa",
  ink100: "#ecedf4",
  ink200: "#dde0ec",
  ink400: "#939bb6",
  ink500: "#6c7492",
  ink600: "#535b7a",
  ink700: "#3e455f",
  ink900: "#171c30",
  white: "#ffffff",
  spark: "#f5a524", // brand "match" accent (the amber spark in the logo mark)
};

const NOTE_TONES = {
  info: { bg: palette.ink50, border: palette.ink200, text: palette.ink600 },
  brand: { bg: palette.brand50, border: palette.brand200, text: palette.brand700 },
  warning: { bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
  danger: { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c" },
};

const style = (extra = "") => `${FONT};${extra}`;

/**
 * Brand lockup, drawn with pure HTML/CSS so it renders even when images are
 * blocked. Mirrors the app mark: a brand tile carrying the "H" (the two
 * people + the bridge of hiring) with the amber "match" spark beside it.
 */
const logo = () => `
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
              <tr>
                <td style="width:40px;height:40px;background-color:${palette.brand600};border-radius:10px;text-align:center;${style("font-size:18px;font-weight:bold;line-height:40px;color:#ffffff;letter-spacing:0;")}">H<span style="color:${palette.spark};font-size:11px;line-height:40px;">&#9670;</span></td>
                <td style="padding-left:10px;${style(`font-size:19px;font-weight:bold;line-height:40px;color:${palette.ink900};`)}">HireSmart&nbsp;<span style="color:${palette.brand600};">AI</span></td>
              </tr>
            </table>`;

const ctaButton = (label, url) => `
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin-top:4px;">
        <tr>
          <td style="border-radius:8px;background-color:${palette.brand600};">
            <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:13px 30px;${style("font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;")}">${escapeHtml(label)}</a>
          </td>
        </tr>
      </table>`;

const detailsTable = (rows = []) => {
  const visible = rows.filter((row) => row && row.label && row.value !== undefined && row.value !== null && row.value !== "");
  if (!visible.length) return "";
  const trs = visible
    .map((row, index) => {
      const last = index === visible.length - 1;
      const border = last ? "none" : `1px solid ${palette.ink100}`;
      return `
          <tr>
            <td width="38%" style="padding:12px 16px;border-bottom:${border};${style(`font-size:13px;color:${palette.ink500};`)}">${escapeHtml(row.label)}</td>
            <td style="padding:12px 16px;border-bottom:${border};${style(`font-size:14px;font-weight:bold;color:${palette.ink900};`)}">${escapeHtml(row.value)}</td>
          </tr>`;
    })
    .join("");
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border:1px solid ${palette.ink200};border-radius:10px;margin-top:16px;">${trs}
      </table>`;
};

const noteBox = ({ tone = "info", text }) => {
  if (!text) return "";
  const colors = NOTE_TONES[tone] || NOTE_TONES.info;
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border:1px solid ${colors.border};border-radius:10px;margin-top:16px;">
        <tr>
          <td style="padding:13px 16px;background-color:${colors.bg};border-radius:10px;${style(`font-size:13px;line-height:1.55;color:${colors.text};`)}">${escapeHtml(text)}</td>
        </tr>
      </table>`;
};

const paragraphs = (body = []) =>
  body
    .filter((line) => line !== undefined && line !== null && String(line).trim() !== "")
    .map((line) => `
        <p style="margin:0 0 14px 0;${style(`font-size:15px;line-height:1.6;color:${palette.ink700};`)}">${escapeHtml(line)}</p>`)
    .join("");

const header = () => `
        <tr>
          <td class="hs-pad" style="padding:26px 36px 0 36px;">${logo()}
          </td>
        </tr>`;

const footer = (footerNote) => `
        <tr>
          <td class="hs-pad" style="padding:24px 36px 26px 36px;border-top:1px solid ${palette.ink100};background-color:#fafbfd;">
            <p style="margin:0 0 4px 0;${style(`font-size:12px;line-height:1.5;color:${palette.ink400};`)}">You're receiving this email because of your HireSmart AI account.</p>
            ${footerNote ? `<p style="margin:0 0 4px 0;${style(`font-size:12px;line-height:1.5;color:${palette.ink400};`)}">${escapeHtml(footerNote)}</p>` : ""}
            <p style="margin:8px 0 0 0;${style(`font-size:12px;color:${palette.ink400};`)}">
              <a href="${config.clientUrl}/privacy" style="${style(`color:${palette.ink500};text-decoration:none;`)}">Privacy</a>
              &nbsp;·&nbsp;
              <a href="${config.clientUrl}/terms" style="${style(`color:${palette.ink500};text-decoration:none;`)}">Terms</a>
              &nbsp;·&nbsp; HireSmart AI
            </p>
          </td>
        </tr>`;

/**
 * Renders the full email from structured content.
 *
 * @param {object} input
 * @param {string} input.subject   Inbox subject line.
 * @param {string} [input.preheader] Hidden inbox-preview text.
 * @param {string} [input.greeting] "Hi Priya,"
 * @param {string} input.title     Main heading.
 * @param {string[]} [input.body]  Paragraphs (plain text, auto-escaped).
 * @param {{label:string,value:string}[]} [input.details] Fact rows.
 * @param {{label:string,url:string}|null} [input.cta] Primary button.
 * @param {{tone:string,text:string}|null} [input.note] Security / notice box.
 * @param {string} [input.footerNote] Extra footer line.
 */
const renderEmail = ({
  subject,
  preheader,
  greeting = "Hi there,",
  title,
  body = [],
  details = [],
  cta = null,
  note = null,
  footerNote = "",
}) => {
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(title || subject)}</title>
    <!--[if mso]>
    <xml>
      <w:WordDocument><w:ViewScale>100</w:ViewScale></w:WordDocument>
    </xml>
    <![endif]-->
    <style type="text/css">
      @media only screen and (max-width: 620px) {
        .hs-pad { padding-left: 20px !important; padding-right: 20px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${palette.ink50};-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;">${escapeHtml(preheader || subject)}&zwnj;&nbsp;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${palette.ink50};padding:28px 12px;border-collapse:separate;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:${palette.white};border:1px solid ${palette.ink200};border-radius:12px;overflow:hidden;border-collapse:separate;">
            <tr>
              <td style="height:4px;background-color:${palette.brand600};font-size:4px;line-height:4px;">&nbsp;</td>
            </tr>
            ${header()}
            <tr>
              <td class="hs-pad" style="padding:26px 36px 4px 36px;">
                <p style="margin:0 0 10px 0;${style(`font-size:15px;color:${palette.ink600};`)}">${escapeHtml(greeting)}</p>
                <h1 style="margin:0 0 16px 0;${style(`font-size:22px;font-weight:bold;line-height:1.3;color:${palette.ink900};`)}">${escapeHtml(title)}</h1>
                ${paragraphs(body)}
              </td>
            </tr>
            <tr>
              <td class="hs-pad" style="padding:0 36px 8px 36px;">${detailsTable(details)}
              </td>
            </tr>
            <tr>
              <td class="hs-pad" style="padding:8px 36px 4px 36px;">${cta ? ctaButton(cta.label, cta.url) : ""}
              </td>
            </tr>
            <tr>
              <td class="hs-pad" style="padding:4px 36px 24px 36px;">${note ? noteBox(note) : ""}
              </td>
            </tr>
            ${footer(footerNote)}
          </table>
          <p style="margin:16px 0 0 0;${style(`font-size:11px;color:${palette.ink400};text-align:center;`)}">HireSmart AI &mdash; intelligent hiring, explained.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const lines = [];
  lines.push(greeting, "", title, "");
  for (const line of body) if (line) lines.push(String(line), "");
  for (const row of details)
    if (row && row.label && row.value) lines.push(`${row.label}: ${row.value}`);
  if (details.length) lines.push("");
  if (cta) lines.push(`${cta.label}:`, String(cta.url), "");
  if (note && note.text) lines.push(note.text, "");
  lines.push("----------------------------------------");
  lines.push("You're receiving this email because of your HireSmart AI account.");
  if (footerNote) lines.push(footerNote);
  lines.push("HireSmart AI");

  return {
    subject,
    preheader: preheader || subject,
    html,
    text: lines.join("\n").trim() + "\n",
  };
};

module.exports = {
  renderEmail,
  escapeHtml,
  roleLabel,
  fmtDate,
  fmtDateTime,
};
