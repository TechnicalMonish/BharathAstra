import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { DocumentService } from "../services/documentService";
import { SearchService } from "../services/searchService";
import {
  UploadResponse,
  DocumentSearchRequest,
  SummarizeRequest,
} from "../types";
import { ValidationError, ErrorCodes } from "../utils/errors";
import { validateQuery } from "../utils/validation";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const documentService = new DocumentService();
const searchService = new SearchService();

/**
 * POST /api/documents/upload
 * Handles multipart file upload, validates and processes the document,
 * returns UploadResponse with document metadata.
 */
router.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new ValidationError(
          "No file provided. Please upload a PDF or TXT file.",
          ErrorCodes.UNSUPPORTED_FORMAT,
        );
      }

      const { buffer, originalname, mimetype } = req.file;

      const result: UploadResponse = await documentService.upload(
        buffer,
        originalname,
        mimetype,
      );

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/documents/:documentId/search
 * Searches within an uploaded document for sections matching the query.
 * Returns ranked results with highlighted text, section headings, and page numbers.
 */
router.post(
  "/:documentId/search",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { documentId } = req.params;
      const { query } = req.body as DocumentSearchRequest;

      validateQuery(query);

      const result = await searchService.searchDocument(documentId, query);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/documents/:documentId/summarize
 * Generates a summary of the full document or a specific section.
 * Returns the summary text, references, and word count.
 */
router.post(
  "/:documentId/summarize",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { documentId } = req.params;
      const { sectionId } = (req.body as SummarizeRequest) || {};

      const result = await searchService.summarizeDocument(
        documentId,
        sectionId,
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
