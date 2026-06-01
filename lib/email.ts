// Resend wrapper. All emails go through here so we can swap providers cleanly.
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM || "Outmark <hello@outmark.ca>";

export async function sendEmail({ to, subject, html, text }: {
  to: string | string[]; subject: string; html: string; text?: string;
}) {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping send. To:", to, "Subject:", subject);
    return { skipped: true as const };
  }
  return await resend.emails.send({ from: FROM, to, subject, html, text });
}

export function inviteEmail({ businessName, link }: { businessName: string; link: string }) {
  return {
    subject: `Your Outmark portal is ready, ${businessName}`,
    html: baseTemplate(`
      <h1 style="font-size:22px;margin:0 0 12px">Welcome to Outmark</h1>
      <p>Your client portal for <strong>${escapeHtml(businessName)}</strong> is ready.</p>
      <p>Click below to set your password and start onboarding. The link expires in 7 days.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="display:inline-block;background:#FF4F00;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9999px;font-weight:600">Set up my portal</a>
      </p>
      <p style="color:#6B6B6B;font-size:13px">If the button doesn't work, paste this into your browser:<br>${link}</p>
    `),
  };
}

export function adminNotificationEmail({ subject, body }: { subject: string; body: string }) {
  return {
    subject,
    html: baseTemplate(`<p>${body}</p>`),
  };
}

function baseTemplate(inner: string) {
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;background:#FAFAF8;margin:0;padding:32px;color:#0A0A0A">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #E0E0E0;border-radius:16px;padding:32px">
      <div style="font-weight:700;letter-spacing:-0.02em;font-size:18px;margin-bottom:24px">Outmark</div>
      ${inner}
      <hr style="border:none;border-top:1px solid #E0E0E0;margin:28px 0">
      <p style="color:#999;font-size:12px;margin:0">Outmark · Collingwood, ON</p>
    </div>
  </body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
