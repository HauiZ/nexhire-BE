import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email.service';

describe('EmailService', () => {
  const mailerService = {
    sendMail: jest.fn(),
  } as unknown as jest.Mocked<MailerService>;

  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      const values: Record<string, string> = {
        'notificationService.frontend.url': 'http://localhost:5173',
        'notificationService.frontend.verifyEmailPath': '/verify-email',
        'notificationService.frontend.resetPasswordPath': '/reset-password',
        'notificationService.email.locale': 'vi-VN',
        'notificationService.email.timeZone': 'Asia/Ho_Chi_Minh',
      };

      return values[key] ?? fallback;
    }),
  } as unknown as jest.Mocked<ConfigService>;

  let service: EmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmailService(mailerService, configService);
  });

  it('sends verification email with link and otp', async () => {
    await service.sendVerifyEmail({
      email: 'candidate@nexhire.vn',
      fullName: 'Candidate',
      token: '123456',
      expiresAt: '2026-07-11T10:00:00.000Z',
    });

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'candidate@nexhire.vn',
        template: 'verify-email',
        context: expect.objectContaining({
          token: '123456',
          verificationLink:
            'http://localhost:5173/verify-email?email=candidate%40nexhire.vn&token=123456',
          expiresAt: '17:00, 11/07/2026 (GMT+7)',
        }),
      }),
    );
  });

  it('sends password reset email with link and otp', async () => {
    await service.sendPasswordResetEmail({
      email: 'candidate@nexhire.vn',
      fullName: null,
      token: '654321',
      expiresAt: '2026-07-11T10:00:00.000Z',
    });

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'candidate@nexhire.vn',
        template: 'password-reset',
        context: expect.objectContaining({
          token: '654321',
          resetLink:
            'http://localhost:5173/reset-password?email=candidate%40nexhire.vn&token=654321',
          expiresAt: '17:00, 11/07/2026 (GMT+7)',
        }),
      }),
    );
  });

  it('sends user lifecycle status email', async () => {
    await service.sendUserLifecycleEmail({
      email: 'candidate@nexhire.vn',
      fullName: 'Candidate',
      previousStatus: 'ACTIVE',
      status: 'BANNED',
      reason: 'Policy violation',
      changedAt: '2026-08-03T10:00:00.000Z',
    });

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'candidate@nexhire.vn',
        subject: 'Tài khoản NexHire của bạn đã bị khóa',
        template: 'user-lifecycle-changed',
        context: expect.objectContaining({
          name: 'Candidate',
          previousStatus: 'ACTIVE',
          status: 'BANNED',
          reason: 'Policy violation',
          changedAt: '17:00, 03/08/2026 (GMT+7)',
        }),
      }),
    );
  });
});
