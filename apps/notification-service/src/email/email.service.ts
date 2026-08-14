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
      subject: 'Xác minh email NexHire của bạn',
      template: 'verify-email',
      context: {
        name: payload.fullName ?? payload.email,
        token: payload.token,
        verificationLink,
        expiresAt: this.formatEmailDateTime(payload.expiresAt),
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
      subject: 'Đặt lại mật khẩu NexHire',
      template: 'password-reset',
      context: {
        name: payload.fullName ?? payload.email,
        token: payload.token,
        resetLink,
        expiresAt: this.formatEmailDateTime(payload.expiresAt),
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
        reason: payload.reason ?? 'Không có lý do cụ thể',
        changedAt: this.formatEmailDateTime(payload.changedAt ?? new Date().toISOString()),
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

  private formatEmailDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const locale = this.configService.get<string>('notificationService.email.locale', 'vi-VN');
    const timeZone = this.configService.get<string>(
      'notificationService.email.timeZone',
      'Asia/Ho_Chi_Minh',
    );

    const parts = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hourCycle: 'h23',
      timeZoneName: 'short',
    })
      .formatToParts(date)
      .reduce<Record<string, string>>((bucket, part) => {
        if (part.type !== 'literal') {
          bucket[part.type] = part.value;
        }
        return bucket;
      }, {});

    return `${parts.hour}:${parts.minute}, ${parts.day}/${parts.month}/${parts.year} (${parts.timeZoneName})`;
  }

  private userLifecycleEmailMessage(status: string): {
    subject: string;
    title: string;
    body: string;
  } {
    if (status === 'ACTIVE') {
      return {
        subject: 'Tài khoản NexHire của bạn đã được khôi phục',
        title: 'Tài khoản đã được khôi phục',
        body: 'Tài khoản NexHire của bạn đã được mở lại. Bạn có thể đăng nhập và tiếp tục sử dụng hệ thống.',
      };
    }
    if (status === 'SUSPENDED') {
      return {
        subject: 'Tài khoản NexHire của bạn đã bị tạm khóa',
        title: 'Tài khoản đã bị tạm khóa',
        body: 'Tài khoản NexHire của bạn đã bị quản trị viên tạm khóa. Một số chức năng có thể không khả dụng trong thời gian này.',
      };
    }
    if (status === 'BANNED') {
      return {
        subject: 'Tài khoản NexHire của bạn đã bị khóa',
        title: 'Tài khoản đã bị khóa',
        body: 'Tài khoản NexHire của bạn đã bị quản trị viên khóa. Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ bộ phận hỗ trợ.',
      };
    }
    if (status === 'ARCHIVED') {
      return {
        subject: 'Tài khoản NexHire của bạn đã được lưu trữ',
        title: 'Tài khoản đã được lưu trữ',
        body: 'Tài khoản NexHire của bạn đã được lưu trữ và không thể sử dụng cho đến khi quản trị viên khôi phục.',
      };
    }
    return {
      subject: 'Trạng thái tài khoản NexHire đã thay đổi',
      title: 'Trạng thái tài khoản đã thay đổi',
      body: `Trạng thái tài khoản NexHire của bạn đã được cập nhật thành ${status}.`,
    };
  }
}
