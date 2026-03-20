import {
  AnswerType,
  type Answer,
  type HistoryEntry,
} from "@aws-intel/shared";
import { put, query, get } from "../../lib/dynamodb";
import { TABLES } from "../../config/tables";

// --- Constants ---

const MAX_HISTORY_PER_USER = 50;

// --- Helper: generate a unique question ID ---

function generateQuestionId(): string {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// --- QuestionHistoryManager class ---

export class QuestionHistoryManager {
  /**
   * Save a question and its answer to the user's history in DynamoDB.
   * Stores the question metadata as a HistoryEntry and the full answer
   * keyed by questionId. Enforces a max of 50 entries per user by
   * trimming the oldest entries when the limit is exceeded.
   */
  async saveQuestion(
    userId: string,
    question: string,
    answer: Answer
  ): Promise<HistoryEntry> {
    const questionId = generateQuestionId();
    const timestamp = new Date();

    const docsQueried = answer.sections.map(
      (s) => s.section.docId
    );
    const uniqueDocs = [...new Set(docsQueried)];

    const entry: HistoryEntry = {
      questionId,
      question,
      timestamp,
      answerType: answer.answerType,
      docsQueried: uniqueDocs,
    };

    // Store the history entry
    await put({
      TableName: TABLES.QueryHistory,
      Item: {
        userId,
        timestamp: timestamp.toISOString(),
        questionId,
        question,
        answerType: answer.answerType,
        docsQueried: uniqueDocs,
        answer: JSON.stringify(answer),
      },
    });

    // Enforce max history limit by removing oldest entries
    await this.trimHistory(userId);

    return entry;
  }

  /**
   * Get the question history for a user, ordered by most recent first.
   * Returns up to `limit` entries (default: MAX_HISTORY_PER_USER).
   */
  async getHistory(
    userId: string,
    limit: number = MAX_HISTORY_PER_USER
  ): Promise<HistoryEntry[]> {
    const items = await query({
      TableName: TABLES.QueryHistory,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": userId,
      },
      ScanIndexForward: false, // newest first
      Limit: limit,
    });

    return items.map((item) => ({
      questionId: item.questionId as string,
      question: item.question as string,
      timestamp: new Date(item.timestamp as string),
      answerType: item.answerType as AnswerType,
      docsQueried: (item.docsQueried as string[]) ?? [],
    }));
  }

  /**
   * Retrieve the full answer for a previously asked question by its ID.
   */
  async getAnswer(userId: string, questionId: string): Promise<Answer | undefined> {
    // We need to find the item by questionId. Since the table uses
    // userId as partition key and timestamp as sort key, we query
    // by userId and filter by questionId.
    const items = await query({
      TableName: TABLES.QueryHistory,
      KeyConditionExpression: "userId = :uid",
      FilterExpression: "questionId = :qid",
      ExpressionAttributeValues: {
        ":uid": userId,
        ":qid": questionId,
      },
      Limit: 1,
    });

    if (items.length === 0) return undefined;

    const answerStr = items[0].answer as string | undefined;
    if (!answerStr) return undefined;

    return JSON.parse(answerStr) as Answer;
  }

  /**
   * Trim history to MAX_HISTORY_PER_USER entries, removing the oldest.
   */
  private async trimHistory(userId: string): Promise<void> {
    const items = await query({
      TableName: TABLES.QueryHistory,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": userId,
      },
      ScanIndexForward: true, // oldest first
    });

    if (items.length <= MAX_HISTORY_PER_USER) return;

    // Import del dynamically to avoid circular issues
    const { del } = await import("../../lib/dynamodb");

    const toRemove = items.slice(0, items.length - MAX_HISTORY_PER_USER);
    for (const item of toRemove) {
      await del({
        TableName: TABLES.QueryHistory,
        Key: {
          userId,
          timestamp: item.timestamp as string,
        },
      });
    }
  }
}

// Export helpers and constants for testing
export { generateQuestionId, MAX_HISTORY_PER_USER };
