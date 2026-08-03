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
      this.configService.get<string>(
        'notificationService.frontend.verifyEmailPath',
        '/verify-email',
      ),
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
      this.configService.get<string>(
        'notificationService.frontend.resetPasswordPath',
        '/reset-password',
      ),
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

  async sendUserLifecycleEmail(payload: {
    email: string;
    fullName?: string | null;
    previousStatus: string;
    status: string;
    reason?: string | null;
    changedAt?: string;
  }): Promise<void> {
    const message = this.userLifecycleEmailMessage(payload.status);

    await this.mailerService.sendMail({
      to: payload.email,
      subject: message.subject,
      template: 'user-lifecycle-changed',
      context: {
        name: payload.fullName ?? payload.email,
        title: message.title,
        body: message.body,
        previousStatus: payload.previousStatus,
        status: payload.status,
        reason: payload.reason ?? 'No reason provided',
        changedAt: payload.changedAt ?? new Date().toISOString(),
      },
    });

    this.logger.log(`User lifecycle email sent to ${payload.email} status=${payload.status}`);
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

  private userLifecycleEmailMessage(status: string): {
    subject: string;
    title: string;
    body: string;
  } {
    if (status === 'ACTIVE') {
      return {
        subject: 'Your NexHire account has been restored',
        title: 'Account restored',
        body: 'Your NexHire account has been restored. You can sign in again.',
      };
    }
    if (status === 'SUSPENDED') {
      return {
        subject: 'Your NexHire account has been suspended',
        title: 'Account suspended',
        body: 'Your NexHire account has been temporarily suspended by admin.',
      };
    }
    if (status === 'BANNED') {
      return {
        subject: 'Your NexHire account has been banned',
        title: 'Account banned',
        body: 'Your NexHire account has been banned by admin.',
      };
    }
    if (status === 'ARCHIVED') {
      return {
        subject: 'Your NexHire account has been archived',
        title: 'Account archived',
        body: 'Your NexHire account has been archived and can no longer be used unless restored by admin.',
      };
    }
    return {
      subject: 'Your NexHire account status changed',
      title: 'Account status changed',
      body: `Your NexHire account status changed to ${status}.`,
    };
  }
}
