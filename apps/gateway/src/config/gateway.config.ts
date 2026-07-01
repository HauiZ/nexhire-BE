import { registerAs } from '@nestjs/config';

export const gatewayConfig = registerAs('gateway', () => ({
  port: parseInt(process.env.GATEWAY_PORT ?? '3000', 10),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
  },
  services: {
    authService: process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001',
    candidateService: process.env.CANDIDATE_SERVICE_URL ?? 'http://localhost:3002',
    companyService: process.env.COMPANY_SERVICE_URL ?? 'http://localhost:3003',
    jobService: process.env.JOB_SERVICE_URL ?? 'http://localhost:3004',
    applicationService:
      process.env.APPLICATION_SERVICE_URL ?? 'http://localhost:3005',
    cvParsingService:
      process.env.CV_PARSING_SERVICE_URL ?? 'http://localhost:3006',
    matchingService: process.env.MATCHING_SERVICE_URL ?? 'http://localhost:3007',
    notificationService:
      process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3008',
    documentStorageService:
      process.env.DOCUMENT_STORAGE_SERVICE_URL ?? 'http://localhost:3009',
  },
}));
