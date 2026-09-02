import nodemailer from "nodemailer";
import { useMock } from "./sheets-core";

/**
 * Server-only email sender — same SMTP setup as the Aligned KPIs app, so login
 * mail comes from a real 1 to 100 Advisors mailbox.
 *
 * Env (server-side only): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM.
 * RESEND_API_KEY is preferred when present.
 *
 * When no mailer is configured the magic-link URL is logged to the server
 * console instead of sent, so the whole sign-in flow runs locally with no mail
 * provider at all.
 */

const FROM = process.env.MAIL_FROM ?? "ITA Directory <notifications@1to100advisors.com>";

function smtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function mailerReady(): boolean {
  return !useMock() && (!!process.env.RESEND_API_KEY || smtpConfigured());
}

async function deliver(to: string, subject: string, text: string, html?: string): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, text, ...(html ? { html } : {}) }),
    });
    if (!resp.ok) throw new Error(`Resend ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    return;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit SSL; 587 = STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      // App passwords display as "abcd efgh ijkl mnop" — strip any spaces.
      pass: (process.env.SMTP_PASS ?? "").replace(/\s+/g, ""),
    },
  });
  await transporter.sendMail({ from: FROM, to, subject, text, ...(html ? { html } : {}) });
}

/** Send the passwordless sign-in link to `email`. */
export async function sendMagicLink(email: string, url: string): Promise<void> {
  if (!mailerReady()) {
    console.log(`\n[ITA Directory] Magic link for ${email}:\n${url}\n`);
    return;
  }
  await deliver(email, "Your ITA Directory sign-in link", linkText(url), linkHtml(url));
}

function linkText(url: string): string {
  return [
    "Sign in to the ITA Member Directory",
    "",
    "Click the link below to sign in. It expires in 10 minutes.",
    "",
    url,
    "",
    "If you didn't request this, you can safely ignore this email.",
  ].join("\n");
}

function linkHtml(url: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d1d1f;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #e3e6ea;border-radius:16px;padding:32px;">
          <tr><td>
            <p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#2178c4;font-weight:700;">ITA</p>
            <h1 style="margin:0 0 16px;font-size:22px;color:#1d1d1f;">Sign in to the Member Directory</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#424245;">
              Click the button below to sign in. This link expires in 10&nbsp;minutes.
            </p>
            <a href="${url}" style="display:inline-block;background:#2178c4;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:12px;">Sign in</a>
            <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6e6e73;">
              If the button doesn't work, paste this link into your browser:<br>
              <span style="color:#2178c4;word-break:break-all;">${url}</span>
            </p>
            <p style="margin:24px 0 0;font-size:13px;color:#6e6e73;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
