import nodemailer from 'nodemailer';

const BRAND_NAME = 'Evenpro';
const BRAND_COLOR = '#065F46';
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const baseTemplate = (content: string, footer = true) => `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${BRAND_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <tr>
      <td style="background: linear-gradient(135deg, ${BRAND_COLOR} 0%, #047857 100%); padding: 32px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: 1px;">${BRAND_NAME}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px 24px;">
        ${content}
      </td>
    </tr>
    ${footer ? `
    <tr>
      <td style="background-color: #f1f5f9; padding: 24px; text-align: center;">
        <p style="margin: 0; color: #64748b; font-size: 12px;">
          © ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.
        </p>
        <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 11px;">
          Email ini dikirim secara otomatis. Mohon jangan membalas email ini.
        </p>
      </td>
    </tr>
    ` : ''}
  </table>
</body>
</html>
`;

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  try {
    const info = await transporter.sendMail({
      from: `"${process.env.MAIL_FROM_NAME || BRAND_NAME}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`[EMAIL] Sent to ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`[EMAIL] Failed to send to ${to}:`, error);
    throw error;
  }
}

export async function sendOtpEmail(email: string, otp: string, name: string) {
  const subject = `Kode Verifikasi Email - ${BRAND_NAME}`;
  const html = baseTemplate(`
    <h2 style="margin: 0 0 24px 0; color: #1e293b; font-size: 20px; font-weight: 600;">Verifikasi Email</h2>
    <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">
      Halo <strong>${name}</strong>,
    </p>
    <p style="margin: 0 0 24px 0; color: #334155; font-size: 15px; line-height: 1.6;">
      Berikut kode verifikasi untuk akun ${BRAND_NAME} Anda:
    </p>
    <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px dashed ${BRAND_COLOR}; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
      <span style="font-size: 32px; font-weight: 700; letter-spacing: 12px; color: ${BRAND_COLOR}; font-family: 'Courier New', monospace;">${otp}</span>
    </div>
    <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">
      Kode ini berlaku selama <strong>15 menit</strong>.
    </p>
    <p style="margin: 24px 0 0 0; padding: 16px; background-color: #fef3c7; border-radius: 8px; color: #92400e; font-size: 13px;">
      Jika Anda tidak merasa mengajukan permintaan ini, abaikan email ini. Akun Anda aman.
    </p>
  `);
  return sendEmail({ to: email, subject, html });
}

export async function sendWelcomeEmail(email: string, name: string, verificationCode: string) {
  const subject = `Selamat Datang di ${BRAND_NAME}!`;
  const html = baseTemplate(`
    <h2 style="margin: 0 0 24px 0; color: #1e293b; font-size: 20px; font-weight: 600;">Selamat Datang, ${name}!</h2>
    <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">
      Terima kasih telah bergabung dengan <strong>${BRAND_NAME}</strong>! Akun Anda telah berhasil diverifikasi.
    </p>
    <p style="margin: 0 0 24px 0; color: #334155; font-size: 15px; line-height: 1.6;">
      Anda sekarang dapat mulai menjelajahi platform kami dan membuat acara impian Anda.
    </p>
    <div style="margin-top: 24px; padding: 16px; background-color: #f0fdf4; border-radius: 8px;">
      <p style="margin: 0; color: #065F46; font-size: 13px;">
        <strong>Mari mulai:</strong> Login ke akun Anda dan buat acara pertama Anda!
      </p>
    </div>
  `);
  return sendEmail({ to: email, subject, html });
}

export async function sendResetPasswordEmail(email: string, resetToken: string) {
  const subject = `Reset Password - ${BRAND_NAME}`;
  const resetUrl = `${WEB_URL}/reset-password?token=${resetToken}`;
  const html = baseTemplate(`
    <h2 style="margin: 0 0 24px 0; color: #1e293b; font-size: 20px; font-weight: 600;">Reset Password</h2>
    <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">
      Kami menerima permintaan untuk reset password akun ${BRAND_NAME} Anda.
    </p>
    <p style="margin: 0 0 24px 0; color: #334155; font-size: 15px; line-height: 1.6;">
      Klik tombol di bawah untuk reset password Anda:
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND_COLOR} 0%, #047857 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(6, 95, 70, 0.3);">
        Reset Password
      </a>
    </div>
    <p style="margin: 0 0 16px 0; color: #64748b; font-size: 13px;">
      Link ini berlaku selama <strong>1 jam</strong>.
    </p>
    <div style="padding: 16px; background-color: #fef2f2; border-radius: 8px;">
      <p style="margin: 0; color: #dc2626; font-size: 13px;">
        Jika Anda tidak merasa mengajukan permintaan ini, abaikan email ini.Password Anda tidak akan berubah.
      </p>
    </div>
    <p style="margin: 24px 0 0 0; color: #94a3b8; font-size: 12px;">
      Setelah reset password, Anda bisa login dengan password baru Anda.
    </p>
  `);
  return sendEmail({ to: email, subject, html });
}