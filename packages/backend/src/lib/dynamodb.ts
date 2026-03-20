import {
  PutCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
  DeleteCommand,
  UpdateCommand,
  BatchWriteCommand,
  type PutCommandInput,
  type GetCommandInput,
  type QueryCommandInput,
  type ScanCommandInput,
  type DeleteCommandInput,
  type UpdateCommandInput,
  type BatchWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { docClient } from "../config/aws";

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
    name === "ProvisionedThroughputExceededException" ||
    name === "ThrottlingException" ||
    name === "InternalServerError" ||
    name === "ServiceUnavailable" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function put(
  params: Omit<PutCommandInput, "TableName"> & { TableName: string }
): Promise<void> {
  await withRetry(() => docClient.send(new PutCommand(params)));
}

export async function get(
  params: Omit<GetCommandInput, "TableName"> & { TableName: string }
): Promise<Record<string, unknown> | undefined> {
  const result = await withRetry(() => docClient.send(new GetCommand(params)));
  return result.Item as Record<string, unknown> | undefined;
}

export async function query(
  params: Omit<QueryCommandInput, "TableName"> & { TableName: string }
): Promise<Record<string, unknown>[]> {
  const result = await withRetry(() =>
    docClient.send(new QueryCommand(params))
  );
  return (result.Items as Record<string, unknown>[]) ?? [];
}

export async function scan(
  params: Omit<ScanCommandInput, "TableName"> & { TableName: string }
): Promise<Record<string, unknown>[]> {
  const result = await withRetry(() => docClient.send(new ScanCommand(params)));
  return (result.Items as Record<string, unknown>[]) ?? [];
}

export async function del(
  params: Omit<DeleteCommandInput, "TableName"> & { TableName: string }
): Promise<void> {
  await withRetry(() => docClient.send(new DeleteCommand(params)));
}

export async function update(
  params: Omit<UpdateCommandInput, "TableName"> & { TableName: string }
): Promise<Record<string, unknown> | undefined> {
  const result = await withRetry(() =>
    docClient.send(new UpdateCommand(params))
  );
  return result.Attributes as Record<string, unknown> | undefined;
}

export async function batchWrite(
  params: BatchWriteCommandInput
): Promise<void> {
  await withRetry(() => docClient.send(new BatchWriteCommand(params)));
}

export { withRetry, isRetryable, sleep };
