import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

/**
 * Wrapper over MinIO for object storage (CV files, exported PDFs).
 * Features call this service, never the SDK directly. The DB stores only keys.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('storage.bucket') as string;
    this.client = new Client({
      endPoint: this.config.get<string>('storage.endpoint') as string,
      port: this.config.get<number>('storage.port'),
      useSSL: this.config.get<boolean>('storage.useSsl') as boolean,
      accessKey: this.config.get<string>('storage.accessKey') as string,
      secretKey: this.config.get<string>('storage.secretKey') as string,
    });
  }

  async onModuleInit(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket).catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Created bucket "${this.bucket}"`);
    }
  }

  /** Store an object; returns the object key. */
  async put(
    key: string,
    body: Buffer | string,
    size?: number,
    contentType?: string,
  ): Promise<string> {
    const meta = contentType ? { 'Content-Type': contentType } : undefined;
    await this.client.putObject(this.bucket, key, body, size, meta);
    return key;
  }

  /** Short-lived URL to download an object directly. */
  presignedGetUrl(key: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, expirySeconds);
  }

  remove(key: string): Promise<void> {
    return this.client.removeObject(this.bucket, key);
  }
}
