import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function envOrThrow(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing env var: ${key}`);
  return v;
}

export class R2Storage {
  private client: S3Client;
  private bucket: string;
  private publicBaseUrl: string;

  constructor() {
    const accountId = envOrThrow("R2_ACCOUNT_ID");
    this.bucket = envOrThrow("R2_BUCKET");
    this.publicBaseUrl = envOrThrow("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: envOrThrow("R2_ACCESS_KEY_ID"),
        secretAccessKey: envOrThrow("R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  async upload(opts: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: opts.key,
        Body: opts.body,
        ContentType: opts.contentType,
      }),
    );
    return `${this.publicBaseUrl}/${opts.key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async signedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}

let _instance: R2Storage | null = null;
export function getR2(): R2Storage {
  if (!_instance) _instance = new R2Storage();
  return _instance;
}

// Test-only helper
export function _resetR2ForTests() {
  _instance = null;
}
