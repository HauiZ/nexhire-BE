import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendVerifyEmail(payload: {
    email: string;
    fullName: string | null;
    token: string;
    expiresAt: string;
  }): Promise<void> {
    await this.mailerService.sendMail({
      to: payload.email,
      subject: 'Verify your NexHire email',
      template: 'verify-email',
      context: {
        name: payload.fullName ?? payload.email,
        token: payload.token,
        expiresAt: payload.expiresAt,
      },
    });

    this.logger.log(`Verification email sent to ${payload.email}`);
  }
}
