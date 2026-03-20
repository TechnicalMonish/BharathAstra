import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  type PutObjectCommandInput,
  type GetObjectCommandInput,
  type ListObjectsV2CommandInput,
} from "@aws-sdk/client-s3";
import { s3Client } from "../config/aws";
import type { Readable } from "stream";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 100;

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_RETRIES - 1) {
        throw error;
      }
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw lastError;
}

function isRetryable(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  const code = (error as { code?: string }).code;
  return (
    name === "InternalError" ||
    name === "ServiceUnavailable" ||
    name === "SlowDown" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface UploadParams {
  bucket: string;
  key: string;
  body: Buffer | Readable | string;
  contentType?: string;
}

export async function upload(params: UploadParams): Promise<void> {
  const input: PutObjectCommandInput = {
    Bucket: params.bucket,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType,
  };
  await withRetry(() => s3Client.send(new PutObjectCommand(input)));
}

export interface DownloadResult {
  body: Readable;
  contentType?: string;
  contentLength?: number;
}

export async function download(
  bucket: string,
  key: string
): Promise<DownloadResult> {
  const input: GetObjectCommandInput = { Bucket: bucket, Key: key };
  const result = await withRetry(() =>
    s3Client.send(new GetObjectCommand(input))
  );
  return {
    body: result.Body as Readable,
    contentType: result.ContentType,
    contentLength: result.ContentLength,
  };
}

export async function deleteObject(
  bucket: string,
  key: string
): Promise<void> {
  await withRetry(() =>
    s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  );
}

export interface S3Object {
  key: string;
  size: number;
  lastModified?: Date;
}

export async function listObjects(
  bucket: string,
  prefix?: string
): Promise<S3Object[]> {
  const input: ListObjectsV2CommandInput = {
    Bucket: bucket,
    Prefix: prefix,
  };
  const result = await withRetry(() =>
    s3Client.send(new ListObjectsV2Command(input))
  );
  return (
    result.Contents?.map((obj) => ({
      key: obj.Key ?? "",
      size: obj.Size ?? 0,
      lastModified: obj.LastModified,
    })) ?? []
  );
}

export { withRetry, isRetryable, sleep };
