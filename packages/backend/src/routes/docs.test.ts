import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { errorHandler } from "../middleware/errorHandler";

// Mock all service modules before importing the router
vi.mock("../services/doc-navigator/queryProcessor", () => {
  return {
    QueryProcessor: vi.fn().mockImplementation(() => ({
      processQuery: vi.fn().mockReturnValue({
        originalQuestion: "How do I use S3?",
        normalizedQuestion: "use s3",
        awsServices: ["S3"],
        concepts: ["storage"],
        queryType: "how_to",
        keywords: ["s3", "use"],
      }),
    })),
  };
});

vi.mock("../services/doc-navigator/documentIndexer", () => {
  return {
    DocumentIndexer: vi.fn().mockImplementation(() => ({
      searchIndex: vi.fn().mockResolvedValue([
        {
          docId: "aws-s3",
          docTitle: "Amazon S3 Guide",
          sectionId: "sec-1",
          sectionTitle: "Getting Started",
          content: "S3 is object storage.",
          relevanceScore: 0.9,
        },
      ]),
    })),
  };
});

vi.mock("../services/doc-navigator/documentManager", () => {
  return {
    DocumentManager: vi.fn().mockImplementation(() => ({
      listDocuments: vi.fn().mockResolvedValue([
        {
          docId: "aws-s3",
          title: "Amazon S3 Guide",
          category: "Storage",
          type: "official_aws",
          sections: 3,
          lastUpdated: new Date(),
          selected: false,
        },
      ]),
      selectDocuments: vi.fn(),
      getSelectedDocuments: vi.fn().mockResolvedValue([
        { docId: "aws-s3", title: "Amazon S3 Guide", selected: true },
      ]),
      uploadCustomDoc: vi.fn().mockResolvedValue({
        docId: "custom-123",
        title: "My Doc",
        category: "Custom",
        type: "custom_upload",
        sections: 2,
        lastUpdated: new Date(),
        selected: false,
      }),
      deleteCustomDoc: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock("../services/doc-navigator/sectionExtractor", () => {
  return {
    SectionExtractor: vi.fn().mockImplementation(() => ({
      extractRelevantSections: vi.fn().mockResolvedValue([
        {
          docId: "aws-s3",
          docTitle: "Amazon S3 Guide",
          sectionId: "sec-1",
          sectionNumber: "1.1",
          sectionTitle: "Getting Started",
          content: "S3 is object storage.",
          relevanceScore: 0.9,
          parentSections: [],
        },
      ]),
      highlightAnswers: vi.fn().mockReturnValue({
        section: {
          docId: "aws-s3",
          docTitle: "Amazon S3 Guide",
          sectionId: "sec-1",
          sectionNumber: "1.1",
          sectionTitle: "Getting Started",
          content: "S3 is object storage.",
          relevanceScore: 0.9,
          parentSections: [],
        },
        highlights: [
          { text: "S3 is object storage.", startIndex: 0, endIndex: 21, relevanceScore: 0.8 },
        ],
      }),
    })),
  };
});

vi.mock("../services/doc-navigator/answerBuilder", () => {
  return {
    AnswerBuilder: vi.fn().mockImplementation(() => ({
      buildAnswer: vi.fn().mockResolvedValue({
        directAnswer: "S3 is object storage.",
        answerType: "direct",
        sections: [],
        codeExamples: [],
        relatedSections: [],
        prerequisites: [],
      }),
    })),
  };
});

vi.mock("../services/doc-navigator/codeExtractor", () => {
  return {
    CodeExtractor: vi.fn().mockImplementation(() => ({
      extractCodeExamples: vi.fn().mockReturnValue([]),
    })),
  };
});

vi.mock("../services/doc-navigator/questionHistoryManager", () => {
  return {
    QuestionHistoryManager: vi.fn().mockImplementation(() => ({
      saveQuestion: vi.fn().mockResolvedValue({
        questionId: "q-123",
        question: "How do I use S3?",
        timestamp: new Date(),
        answerType: "direct",
        docsQueried: ["aws-s3"],
      }),
      getHistory: vi.fn().mockResolvedValue([
        {
          questionId: "q-123",
          question: "How do I use S3?",
          timestamp: new Date(),
          answerType: "direct",
          docsQueried: ["aws-s3"],
        },
      ]),
      getAnswer: vi.fn().mockImplementation((_userId: string, questionId: string) => {
        if (questionId === "q-123") {
          return Promise.resolve({
            directAnswer: "S3 is object storage.",
            answerType: "direct",
            sections: [],
            codeExamples: [],
            relatedSections: [],
            prerequisites: [],
          });
        }
        return Promise.resolve(undefined);
      }),
    })),
  };
});

// Import router after mocks are set up
import docsRouter from "./docs";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/docs", docsRouter);
  app.use(errorHandler);
  return app;
}

describe("Documentation Navigator API", () => {
  const app = createTestApp();

  describe("POST /api/docs/query", () => {
    it("should return an answer for a valid question", async () => {
      const res = await request(app)
        .post("/api/docs/query")
        .send({ question: "How do I use S3?" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("questionId", "q-123");
      expect(res.body).toHaveProperty("answer");
      expect(res.body.answer).toHaveProperty("directAnswer");
      expect(res.body).toHaveProperty("responseTimeMs");
      expect(res.body).toHaveProperty("withinTarget");
    });

    it("should return 400 when question is missing", async () => {
      const res = await request(app)
        .post("/api/docs/query")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });

    it("should return 400 when question is empty string", async () => {
      const res = await request(app)
        .post("/api/docs/query")
        .send({ question: "   " });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });

    it("should accept optional docIds", async () => {
      const res = await request(app)
        .post("/api/docs/query")
        .send({ question: "How do I use S3?", docIds: ["aws-s3"] });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("answer");
    });
  });

  describe("GET /api/docs/list", () => {
    it("should return a list of documents", async () => {
      const res = await request(app).get("/api/docs/list");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("documents");
      expect(Array.isArray(res.body.documents)).toBe(true);
    });

    it("should accept filter query params", async () => {
      const res = await request(app)
        .get("/api/docs/list")
        .query({ category: "Storage", searchTerm: "S3" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("documents");
    });
  });

  describe("POST /api/docs/select", () => {
    it("should select documents by IDs", async () => {
      const res = await request(app)
        .post("/api/docs/select")
        .send({ docIds: ["aws-s3", "aws-lambda"] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ selected: ["aws-s3", "aws-lambda"] });
    });

    it("should return 400 when docIds is not an array", async () => {
      const res = await request(app)
        .post("/api/docs/select")
        .send({ docIds: "aws-s3" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });
  });

  describe("POST /api/docs/upload", () => {
    it("should upload a custom document", async () => {
      const content = Buffer.from("# My Custom Doc\n\nSome content.").toString("base64");

      const res = await request(app)
        .post("/api/docs/upload")
        .send({ name: "My Doc", format: "markdown", content, category: "Custom" });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("document");
      expect(res.body.document).toHaveProperty("docId");
    });

    it("should return 400 when name is missing", async () => {
      const res = await request(app)
        .post("/api/docs/upload")
        .send({ format: "text", content: "aGVsbG8=" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });

    it("should return 400 for invalid format", async () => {
      const res = await request(app)
        .post("/api/docs/upload")
        .send({ name: "Doc", format: "docx", content: "aGVsbG8=" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });
  });

  describe("DELETE /api/docs/:docId", () => {
    it("should delete a document", async () => {
      const res = await request(app).delete("/api/docs/custom-123");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: "custom-123" });
    });
  });

  describe("GET /api/docs/history", () => {
    it("should return question history", async () => {
      const res = await request(app).get("/api/docs/history");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("history");
      expect(Array.isArray(res.body.history)).toBe(true);
    });

    it("should accept a limit query param", async () => {
      const res = await request(app)
        .get("/api/docs/history")
        .query({ limit: "5" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("history");
    });
  });

  describe("GET /api/docs/history/:questionId", () => {
    it("should return a previous answer", async () => {
      const res = await request(app).get("/api/docs/history/q-123");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("questionId", "q-123");
      expect(res.body).toHaveProperty("answer");
    });

    it("should return 404 for unknown question ID", async () => {
      const res = await request(app).get("/api/docs/history/q-unknown");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("NotFound");
    });
  });
});
