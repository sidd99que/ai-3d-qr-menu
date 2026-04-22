import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: {
        user: 'resend',
        pass: this.config.getOrThrow<string>('RESEND_API_KEY'),
      },
    });
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const resetUrl    = `${frontendUrl}/auth/reset-password?token=${resetToken}`;
    const from        = this.config.getOrThrow<string>('RESEND_FROM_EMAIL');

    try {
      await this.transporter.sendMail({
        from,
        to:      email,
        subject: 'Reset your Tripo 3D password',
        html: `
          <!DOCTYPE html>
          <html>
            <body style="margin:0;padding:0;background:#080c14;font-family:'Segoe UI',sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
                <tr>
                  <td align="center">
                    <table width="480" cellpadding="0" cellspacing="0"
                      style="background:#0d1117;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:48px 40px;">
                      <tr>
                        <td align="center" style="padding-bottom:32px;">
                          <div style="width:56px;height:56px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;">
                            <span style="font-size:24px;">🔐</span>
                          </div>
                          <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;">
                            Reset your password
                          </h1>
                          <p style="color:#71717a;font-size:14px;margin:0;">
                            We received a request to reset your Tripo 3D password.
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding-bottom:32px;">
                          <a href="${resetUrl}"
                            style="display:inline-block;background:#06b6d4;color:#000000;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">
                            Reset Password
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:24px;">
                          <p style="color:#52525b;font-size:12px;text-align:center;margin:0;">
                            This link expires in <strong style="color:#71717a;">1 hour</strong>.
                            If you didn't request this, you can safely ignore this email.
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="border-top:1px solid rgba(255,255,255,0.06);padding-top:24px;">
                          <p style="color:#3f3f46;font-size:11px;text-align:center;margin:0;">
                            © ${new Date().getFullYear()} Tripo 3D — All rights reserved
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
          </html>
        `,
      });

      this.logger.log(`Password reset email sent to: ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send reset email to ${email}`, error);
      throw error;
    }
  }
}