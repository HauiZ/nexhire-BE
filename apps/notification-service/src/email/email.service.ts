import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendVerifyEmail(payload: {
    email: string;
    fullName: string | null;
    token: string;
    expiresAt: string;
  }): Promise<void> {
    const verificationLink = this.buildFrontendUrl(
      this.configService.get<string>('notificationService.frontend.verifyEmailPath', '/verify-email'),
      {
        email: payload.email,
        token: payload.token,
      },
    );

    await this.mailerService.sendMail({
      to: payload.email,
      subject: 'Verify your NexHire email',
      template: 'verify-email',
      context: {
        name: payload.fullName ?? payload.email,
        token: payload.token,
        verificationLink,
        expiresAt: payload.expiresAt,
      },
    });

    this.logger.log(`Verification email sent to ${payload.email}`);
  }

  async sendPasswordResetEmail(payload: {
    email: string;
    fullName: string | null;
    token: string;
    expiresAt: string;
  }): Promise<void> {
    const resetLink = this.buildFrontendUrl(
      this.configService.get<string>('notificationService.frontend.resetPasswordPath', '/reset-password'),
      {
        email: payload.email,
        token: payload.token,
      },
    );

    await this.mailerService.sendMail({
      to: payload.email,
      subject: 'Reset your NexHire password',
      template: 'password-reset',
      context: {
        name: payload.fullName ?? payload.email,
        token: payload.token,
        resetLink,
        expiresAt: payload.expiresAt,
      },
    });

    this.logger.log(`Password reset email sent to ${payload.email}`);
  }

  private buildFrontendUrl(path: string, query: Record<string, string>): string {
    const frontendUrl = this.configService.get<string>(
      'notificationService.frontend.url',
      'http://localhost:5173',
    );
    const url = new URL(path, frontendUrl.endsWith('/') ? frontendUrl : `${frontendUrl}/`);

    Object.entries(query).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    return url.toString();
  }
}
