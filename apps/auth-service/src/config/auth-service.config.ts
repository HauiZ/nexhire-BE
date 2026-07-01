import { registerAs } from '@nestjs/config';

export const authServiceConfig = registerAs('authService', () => ({
  port: parseInt(process.env.AUTH_SERVICE_PORT ?? '3001', 10),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '604800', 10),
  },
  bcryptRounds: 12,
  verification: {
    tokenLength: parseInt(process.env.EMAIL_VERIFICATION_TOKEN_LENGTH ?? '6', 10),
    tokenTtlMinutes: parseInt(process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES ?? '15', 10),
    resendCooldownSeconds: parseInt(process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS ?? '60', 10),
    maxResends: parseInt(process.env.EMAIL_VERIFICATION_MAX_RESENDS ?? '5', 10),
  },
}));
