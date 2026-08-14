import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Wrapper over S3-compatible object storage (CV files, exported PDFs).
 * Features call this service, never the SDK directly. The DB stores only keys.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('storage.bucket') as string;
    this.client = new S3Client({
      endpoint: this.config.get<string>('storage.endpoint') as string,
      region: this.config.get<string>('storage.region') as string,
      forcePathStyle: this.config.get<boolean>('storage.forcePathStyle') as boolean,
      credentials: {
        accessKeyId: this.config.get<string>('storage.accessKey') as string,
        secretAccessKey: this.config.get<string>('storage.secretKey') as string,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    const exists = await this.client
      .send(new HeadBucketCommand({ Bucket: this.bucket }))
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
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
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentLength: size,
        ContentType: contentType,
      }),
    );
    return key;
  }

  /** Short-lived URL to download an object directly. */
  presignedGetUrl(key: string, expirySeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: expirySeconds },
    );
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
