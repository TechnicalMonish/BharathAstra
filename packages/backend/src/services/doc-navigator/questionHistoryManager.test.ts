import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  QuestionHistoryManager,
  generateQuestionId,
  MAX_HISTORY_PER_USER,
} from "./questionHistoryManager";
import {
  AnswerType,
  type Answer,
  type HighlightedSection,
  type ExtractedSection,
} from "@aws-intel/shared";

// --- Mock DynamoDB ---

const mockPut = vi.fn().mockResolvedValue(undefined);
const mockQuery = vi.fn().mockResolvedValue([]);
const mockGet = vi.fn().mockResolvedValue(undefined);
const mockDel = vi.fn().mockResolvedValue(undefined);

vi.mock("../../lib/dynamodb", () => ({
  put: (...args: unknown[]) => mockPut(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  get: (...args: unknown[]) => mockGet(...args),
  del: (...args: unknown[]) => mockDel(...args),
}));

// --- Helpers ---

function makeSection(overrides: Partial<ExtractedSection> = {}): ExtractedSection {
  return {
    docId: "doc-1",
    docTitle: "Test Doc",
    sectionId: "sec-0",
    sectionNumber: "1.1",
    sectionTitle: "Getting Started",
    content: "Some content.",
    relevanceScore: 0.8,
    parentSections: [],
    ...overrides,
  };
}

function makeHighlightedSection(
  sectionOverrides: Partial<ExtractedSection> = {}
): HighlightedSection {
  return {
    section: makeSection(sectionOverrides),
    highlights: [
      {
        text: "Some highlighted text.",
        startIndex: 0,
        endIndex: 21,
        relevanceScore: 0.9,
      },
    ],
  };
}

function makeAnswer(overrides: Partial<Answer> = {}): Answer {
  return {
    answerType: AnswerType.DIRECT,
    sections: [makeHighlightedSection()],
    codeExamples: [],
    relatedSections: [],
    prerequisites: [],
    directAnswer: "Lambda is a serverless compute service.",
    ...overrides,
  };
}

// --- Tests ---

describe("generateQuestionId", () => {
  it("generates a string starting with 'q-'", () => {
    const id = generateQuestionId();
    expect(id).toMatch(/^q-/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateQuestionId()));
    expect(ids.size).toBe(100);
  });
});

describe("QuestionHistoryManager", () => {
  let manager: QuestionHistoryManager;

  beforeEach(() => {
    manager = new QuestionHistoryManager();
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
  });

  describe("saveQuestion", () => {
    it("saves a question and answer to DynamoDB", async () => {
      const answer = makeAnswer();
      const entry = await manager.saveQuestion("user-1", "What is Lambda?", answer);

      expect(mockPut).toHaveBeenCalledOnce();
      const putCall = mockPut.mock.calls[0][0];
      expect(putCall.TableName).toContain("QueryHistory");
      expect(putCall.Item.userId).toBe("user-1");
      expect(putCall.Item.question).toBe("What is Lambda?");
      expect(putCall.Item.answerType).toBe(AnswerType.DIRECT);
      expect(putCall.Item.answer).toBeDefined();
    });

    it("returns a valid HistoryEntry", async () => {
      const answer = makeAnswer();
      const entry = await manager.saveQuestion("user-1", "What is Lambda?", answer);

      expect(entry.questionId).toMatch(/^q-/);
      expect(entry.question).toBe("What is Lambda?");
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.answerType).toBe(AnswerType.DIRECT);
    });

    it("extracts unique doc IDs from answer sections", async () => {
      const answer = makeAnswer({
        sections: [
          makeHighlightedSection({ docId: "doc-1" }),
          makeHighlightedSection({ docId: "doc-2" }),
          makeHighlightedSection({ docId: "doc-1" }),
        ],
      });
      const entry = await manager.saveQuestion("user-1", "test", answer);

      expect(entry.docsQueried).toEqual(["doc-1", "doc-2"]);
      const putCall = mockPut.mock.calls[0][0];
      expect(putCall.Item.docsQueried).toEqual(["doc-1", "doc-2"]);
    });

    it("stores the answer as JSON string", async () => {
      const answer = makeAnswer();
      await manager.saveQuestion("user-1", "test", answer);

      const putCall = mockPut.mock.calls[0][0];
      const storedAnswer = JSON.parse(putCall.Item.answer);
      expect(storedAnswer.answerType).toBe(AnswerType.DIRECT);
      expect(storedAnswer.directAnswer).toBe("Lambda is a serverless compute service.");
    });
  });

  describe("getHistory", () => {
    it("returns empty array when no history exists", async () => {
      mockQuery.mockResolvedValue([]);
      const history = await manager.getHistory("user-1");
      expect(history).toEqual([]);
    });

    it("returns history entries mapped from DynamoDB items", async () => {
      mockQuery.mockResolvedValue([
        {
          userId: "user-1",
          timestamp: "2024-01-15T10:00:00.000Z",
          questionId: "q-123",
          question: "What is S3?",
          answerType: AnswerType.DIRECT,
          docsQueried: ["doc-s3"],
        },
      ]);

      const history = await manager.getHistory("user-1");
      expect(history).toHaveLength(1);
      expect(history[0].questionId).toBe("q-123");
      expect(history[0].question).toBe("What is S3?");
      expect(history[0].timestamp).toBeInstanceOf(Date);
      expect(history[0].answerType).toBe(AnswerType.DIRECT);
      expect(history[0].docsQueried).toEqual(["doc-s3"]);
    });

    it("queries with ScanIndexForward false for newest first", async () => {
      await manager.getHistory("user-1");

      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall.ScanIndexForward).toBe(false);
    });

    it("respects the limit parameter", async () => {
      await manager.getHistory("user-1", 10);

      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall.Limit).toBe(10);
    });

    it("defaults limit to MAX_HISTORY_PER_USER", async () => {
      await manager.getHistory("user-1");

      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall.Limit).toBe(MAX_HISTORY_PER_USER);
    });

    it("handles missing docsQueried gracefully", async () => {
      mockQuery.mockResolvedValue([
        {
          userId: "user-1",
          timestamp: "2024-01-15T10:00:00.000Z",
          questionId: "q-123",
          question: "test",
          answerType: AnswerType.REFERENCE,
        },
      ]);

      const history = await manager.getHistory("user-1");
      expect(history[0].docsQueried).toEqual([]);
    });
  });

  describe("getAnswer", () => {
    it("returns undefined when question not found", async () => {
      mockQuery.mockResolvedValue([]);
      const answer = await manager.getAnswer("user-1", "q-nonexistent");
      expect(answer).toBeUndefined();
    });

    it("returns parsed answer when found", async () => {
      const storedAnswer = makeAnswer();
      mockQuery.mockResolvedValue([
        {
          userId: "user-1",
          timestamp: "2024-01-15T10:00:00.000Z",
          questionId: "q-123",
          answer: JSON.stringify(storedAnswer),
        },
      ]);

      const answer = await manager.getAnswer("user-1", "q-123");
      expect(answer).toBeDefined();
      expect(answer!.answerType).toBe(AnswerType.DIRECT);
      expect(answer!.directAnswer).toBe("Lambda is a serverless compute service.");
    });

    it("returns undefined when answer field is missing", async () => {
      mockQuery.mockResolvedValue([
        {
          userId: "user-1",
          timestamp: "2024-01-15T10:00:00.000Z",
          questionId: "q-123",
        },
      ]);

      const answer = await manager.getAnswer("user-1", "q-123");
      expect(answer).toBeUndefined();
    });

    it("queries with correct filter expression", async () => {
      await manager.getAnswer("user-1", "q-456");

      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall.FilterExpression).toBe("questionId = :qid");
      expect(queryCall.ExpressionAttributeValues[":qid"]).toBe("q-456");
      expect(queryCall.ExpressionAttributeValues[":uid"]).toBe("user-1");
    });
  });
});
