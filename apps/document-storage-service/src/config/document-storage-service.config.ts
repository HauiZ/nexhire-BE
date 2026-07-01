import { registerAs } from '@nestjs/config';

export const documentStorageServiceConfig = registerAs(
  'documentStorageService',
  () => ({
    port: parseInt(process.env.DOCUMENT_STORAGE_SERVICE_PORT ?? '3009', 10),
  }),
);
