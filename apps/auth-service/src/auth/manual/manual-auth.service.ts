import { createHash, randomInt } from 'crypto';
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ERROR_CODES } from '@nexhire/shared';
import { DataSource, Repository } from 'typeorm';
import {
  ManualEmailVerificationDto,
  ManualEmailVerificationResponseDto,
} from './dto/manual-email-verification.dto';
import { EmailVerification } from '../entities/email-verification.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class ManualAuthService {
  private readonly logger = new Logger(ManualAuthService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async createEmailVerification(
    dto: ManualEmailVerificationDto,
  ): Promise<ManualEmailVerificationResponseDto> {
    this.assertManualEndpointAllowed();
    const email = this.normalizeEmailInput(dto.email);
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.AUTH.USER_NOT_FOUND,
        message: 'User was not found',
      });
    }

    const token = this.generateVerificationToken();
    const expiresAt = this.buildVerificationExpiry();
    const verification = await this.dataSource.transaction(async (manager) => {
      return manager.save(
        EmailVerification,
        manager.create(EmailVerification, {
          userId: user.id,
          email,
          tokenHash: this.hashToken(token),
          expiresAt,
          verifiedAt: null,
          lastSentAt: new Date(),
          resendCount: 0,
        }),
      );
    });

    this.logger.warn(`Manual email verification created userId=${user.id}`);
    return {
      message: 'Manual verification token created',
      verificationId: verification.id,
      email,
      token,
      expiresAt,
    };
  }

  private assertManualEndpointAllowed(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException({
        code: ERROR_CODES.COMMON.FORBIDDEN,
        message: 'Manual auth endpoint is disabled in production',
      });
    }
  }

  private normalizeEmailInput(email: string): string {
    return email.trim();
  }

  private hashToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private generateVerificationToken(): string {
    const tokenLength = this.configService.get<number>(
      'authService.verification.tokenLength',
      6,
    );
    const min = 10 ** (tokenLength - 1);
    const max = 10 ** tokenLength;
    return `${randomInt(min, max)}`;
  }

  private buildVerificationExpiry(): Date {
    const tokenTtlMinutes = this.configService.get<number>(
      'authService.verification.tokenTtlMinutes',
      15,
    );
    return new Date(Date.now() + tokenTtlMinutes * 60 * 1000);
  }
}
