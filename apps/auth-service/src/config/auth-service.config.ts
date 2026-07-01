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
}));
