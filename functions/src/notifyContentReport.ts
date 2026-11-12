import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {defineSecret} from "firebase-functions/params";
import {logger} from "firebase-functions/v2";
import * as nodemailer from "nodemailer";
import {rateLimit} from "./rateLimit";

const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");

// Who gets an email for each new report (⋯ → Report post in the app). Reports must be handled within 24 hours.
const MODERATOR_EMAIL = "collegego05@gmail.com";
const PORTAL_URL = "https://collegego-faculty.web.app";

const REASONS: Record<string, string> = {
  spam: "Spam or misleading",
  harassment: "Harassment or bullying",
  hate: "Hate speech",
  sexual: "Sexual or explicit content",
  violence: "Violence or threats",
  false: "False information",
  other: "Something else",
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"}[c] as string));

export const notifyContentReport = onDocumentCreated(
  {document: "contentReports/{reportId}", region: "asia-south1", secrets: [smtpUser, smtpPass]},
  async (event) => {
    const r = event.data?.data();
    if (!r) return;
    // One person spamming the Report button: keep the report, but stop emailing after 10 an hour.
    try {
      await rateLimit(`report:${r.reporterUid}`, 10, 60 * 60 * 1000);
    } catch {
      logger.warn("Report email skipped (rate limit)", {reporter: r.reporterUid});
      return;
    }
    const reason = REASONS[r.reason] ?? r.reason;
    const what = r.kind === "event" ? "Club event" : "Notice";
    const transport = nodemailer.createTransport({service: "gmail", auth: {user: smtpUser.value(), pass: smtpPass.value()}});
    await transport.sendMail({
      from: `"CollegeGo" <${smtpUser.value()}>`,
      to: MODERATOR_EMAIL,
      subject: `Report: ${what} "${String(r.title ?? "").slice(0, 60)}" (${reason})`,
      text:
        `A ${what.toLowerCase()} was reported in CollegeGo.\n\n` +
        `Title: ${r.title}\nPosted by: ${r.authorName || "unknown"}${r.clubName ? ` (${r.clubName})` : ""}\nReason: ${reason}\n\n` +
        `Review it within 24 hours: ${PORTAL_URL} → Staff → Reported posts.`,
      html:
        `<div style="font-family:Arial,sans-serif;max-width:520px">` +
        `<h3 style="margin:0 0 8px">${esc(what)} reported</h3>` +
        `<p><b>${esc(r.title)}</b><br>Posted by ${esc(r.authorName || "unknown")}${r.clubName ? ` (${esc(r.clubName)})` : ""}</p>` +
        `<p>Reason: <b>${esc(reason)}</b></p>` +
        `<p>Review it within 24 hours: <a href="${PORTAL_URL}">faculty portal</a> → Staff → Reported posts.</p></div>`,
    });
  },
);
