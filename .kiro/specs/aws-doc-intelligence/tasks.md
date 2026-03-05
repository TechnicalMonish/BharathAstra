# Implementation Plan: AWS Doc Intelligence

## Overview

Incremental implementation of the AWS Doc Intelligence platform — a React/TypeScript frontend with a Node.js/Express backend, powered by Amazon Bedrock, S3, and DynamoDB. Tasks are ordered to build foundational layers first (project structure, shared utilities, data models), then each module (Document Analyzer, Resource Aggregator, Cost Predictor), and finally wire everything together with the frontend.

## Tasks

- [ ] 1. Set up monorepo project structure and shared utilities
  - [ ] 1.1 Initialize monorepo with frontend (React + Vite + TypeScript + Tailwind CSS) and backend (Node.js + Express + TypeScript) directories
    - Create `frontend/` and `backend/` directories with `package.json`, `tsconfig.json`
    - Set up Vite config for frontend, Express entry point for backend
    - Install core dependencies: `react`, `react-router-dom`, `tailwindcss`, `express`, `aws-sdk` (v3 clients for S3, DynamoDB, Bedrock), `pdf-parse`, `fast-check`, `vitest`
    - _Requirements: 7.1, 7.4_

  - [ ] 1.2 Define shared TypeScript interfaces and types
    - Create `backend/src/types/index.ts` with all API request/response interfaces from the design (`UploadRequest`, `UploadResponse`, `DocumentSearchRequest`, `DocumentSearchResponse`, `SummarizeRequest`, `SummarizeResponse`, `ResourceSearchRequest`, `ResourceSearchResponse`, `CostPredictionRequest`, `CostPredictionResponse`, `IdentifiedService`, `ErrorResponse`)
    - Create `backend/src/types/models.ts` with data model types (`DocumentSection`, `DocumentMetadata`)
    - _Requirements: 1.1, 2.1, 3.1, 4.2, 5.1, 5.2_

  - [ ] 1.3 Implement error handling utilities and error sanitization middleware
    - Create `backend/src/utils/errors.ts` with custom error classes (`ValidationError`, `ServiceUnavailableError`, `TimeoutError`) and error codes (`UNSUPPORTED_FORMAT`, `DOCUMENT_TOO_LARGE`, `EMPTY_QUERY`, etc.)
    - Create `backend/src/middleware/errorHandler.ts` with Express error-handling middleware that sanitizes errors (strips stack traces, internal paths, AWS ARNs, account IDs) and returns `ErrorResponse` format
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]\* 1.4 Write property test for error sanitization (Property 15)
    - **Property 15: Error messages do not expose internal details**
    - Generate random error objects containing stack traces, file paths, internal service names, ARNs, and exception class names; verify the sanitized user-facing message contains none of these
    - **Validates: Requirements 8.1, 8.3**

  - [ ] 1.5 Implement validation utility functions
    - Create `backend/src/utils/validation.ts` with validators for file format (PDF/TXT MIME types), page count (max 100), query string (non-empty, max 500 chars), and cost specification (non-empty, max 2000 chars)
    - Return structured validation errors using the custom error classes
    - _Requirements: 1.3, 1.4, 2.1, 5.1_

- [ ] 2. Implement Document Service (upload, parse, store)
  - [ ] 2.1 Implement document upload and parsing logic
    - Create `backend/src/services/documentService.ts` implementing `IDocumentService`
    - Implement `upload()`: validate file format and size, extract text via `pdf-parse` (PDF) or direct read (TXT), compute page count, upload raw file to S3 (`documents/{documentId}/{filename}`), split text into sections by headings, store metadata + sections in DynamoDB Documents table
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]\* 2.2 Write property test for upload round-trip (Property 1)
    - **Property 1: Upload round-trip preserves document content**
    - For random valid documents, verify upload produces non-empty extracted text and a valid searchable index entry
    - **Validates: Requirements 1.1, 1.2**

  - [ ]\* 2.3 Write property test for unsupported format rejection (Property 2)
    - **Property 2: Unsupported format rejection**
    - For random files with MIME types other than `application/pdf` or `text/plain`, verify the upload returns an error listing supported formats
    - **Validates: Requirements 1.3**

  - [ ]\* 2.4 Write property test for upload confirmation metadata (Property 3)
    - **Property 3: Upload confirmation contains document metadata**
    - For random successfully parsed documents, verify the response contains the original filename and accurate page count
    - **Validates: Requirements 1.5**

  - [ ] 2.5 Create document upload API route
    - Create `backend/src/routes/documents.ts` with `POST /api/documents/upload` endpoint
    - Handle multipart file upload, call `DocumentService.upload()`, return `UploadResponse`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 3. Implement Search Service (document search + summarization)
  - [ ] 3.1 Implement vector embedding generation and in-memory search
    - Create `backend/src/services/searchService.ts` implementing `ISearchService`
    - Implement `searchDocument()`: retrieve document sections from DynamoDB, generate query embedding via Bedrock Titan Embeddings, compute cosine similarity against section embeddings, rank by relevance score descending, highlight matching terms in text, return `DocumentSearchResponse` with section headings and page numbers
    - If no results match, use Bedrock to suggest related topics from the document
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]\* 3.2 Write property test for search result ordering (Property 4)
    - **Property 4: Search results are ordered by relevance score descending**
    - For random search responses with 2+ results, verify each result's relevance score ≥ the next result's score
    - **Validates: Requirements 2.1, 4.3**

  - [ ]\* 3.3 Write property test for search highlights (Property 5)
    - **Property 5: Search highlights contain query terms**
    - For random document search results with highlighted text, verify highlights contain at least one term from the original query
    - **Validates: Requirements 2.2**

  - [ ]\* 3.4 Write property test for search result metadata (Property 6)
    - **Property 6: Document search results contain structural metadata**
    - For random document search results, verify each result has a non-empty section heading and page number ≥ 1
    - **Validates: Requirements 2.3**

  - [ ] 3.5 Implement document summarization
    - Add `summarizeDocument()` to `SearchService`: retrieve document/section text, call Bedrock Claude with a prompt to summarize (max 500 words full-doc, 200 words section), include section references in response
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]\* 3.6 Write property test for summary references (Property 7)
    - **Property 7: Summary responses include section references**
    - For random generated summaries, verify the response includes at least one reference with section heading and page number
    - **Validates: Requirements 3.4**

  - [ ]\* 3.7 Write property test for summary word count limits (Property 8)
    - **Property 8: Summary word count respects limits**
    - For random full-document summaries verify word count ≤ 500; for random section summaries verify word count ≤ 200
    - **Validates: Requirements 3.5**

  - [ ] 3.8 Create search and summarize API routes
    - Add `POST /api/documents/:documentId/search` and `POST /api/documents/:documentId/summarize` endpoints to `backend/src/routes/documents.ts`
    - Wire to `SearchService` methods, return appropriate responses
    - _Requirements: 2.1, 3.1_

- [ ] 4. Checkpoint - Core document module complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement Resource Aggregator Service
  - [ ] 5.1 Implement external resource search with retry logic
    - Create `backend/src/services/resourceService.ts` implementing `IResourceAggregatorService`
    - Implement `search()`: call external web search API for AWS-related content, parse results into `SearchResult` objects with title, sourceUrl, snippet, resourceType, rank by relevance score descending, categorize by resource type
    - Implement retry-once logic on network timeout (as per Requirement 8.2)
    - If no results found, suggest alternative search terms
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 8.2_

  - [ ]\* 5.2 Write property test for resource search result fields (Property 9)
    - **Property 9: Resource search results contain all required fields**
    - For random resource search results, verify each has non-empty title, valid URL, non-empty snippet, and resourceType in ["blog", "video", "article"]
    - **Validates: Requirements 4.2**

  - [ ]\* 5.3 Write property test for resource type filtering (Property 10)
    - **Property 10: Resource type filtering returns only matching types**
    - For random search results and a selected filter type, verify filtering returns only results matching that type
    - **Validates: Requirements 4.5**

  - [ ] 5.4 Create resource search API route
    - Create `backend/src/routes/resources.ts` with `POST /api/resources/search` endpoint
    - Wire to `ResourceAggregatorService.search()`, return `ResourceSearchResponse`
    - _Requirements: 4.1, 4.2_

- [ ] 6. Implement Cost Predictor Service
  - [ ] 6.1 Implement cost prediction with Bedrock
    - Create `backend/src/services/costService.ts` implementing `ICostPredictorService`
    - Implement `predict()`: send cost specification to Bedrock Claude with a structured prompt to identify AWS services, estimate monthly costs, determine free tier eligibility/limits/duration/restrictions, generate optimization suggestions with estimated savings
    - Ensure total cost equals sum of individual service costs
    - Prioritize free tier as first optimization suggestion for eligible services
    - Return error if no AWS services can be identified
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3_

  - [ ]\* 6.2 Write property test for total cost consistency (Property 11)
    - **Property 11: Total cost equals sum of individual service costs**
    - For random cost prediction responses with 1+ services, verify `totalEstimatedMonthlyCost` equals the sum of all `estimatedMonthlyCost` values
    - **Validates: Requirements 5.2**

  - [ ]\* 6.3 Write property test for free tier completeness (Property 12)
    - **Property 12: Free tier info is complete for all identified services**
    - For random identified services, verify each has free tier info with eligibility, limits, and duration; if eligible, restrictions must be non-empty
    - **Validates: Requirements 5.3, 5.4**

  - [ ]\* 6.4 Write property test for optimization savings (Property 13)
    - **Property 13: Optimization suggestions include estimated savings**
    - For random optimization suggestions, verify each has non-empty suggestion text and positive estimatedSavings
    - **Validates: Requirements 6.1, 6.2**

  - [ ]\* 6.5 Write property test for free tier prioritization (Property 14)
    - **Property 14: Free tier is prioritized as first optimization suggestion**
    - For random free-tier-eligible services with optimization suggestions, verify the first suggestion references free tier
    - **Validates: Requirements 6.3**

  - [ ] 6.6 Create cost prediction API route
    - Create `backend/src/routes/cost.ts` with `POST /api/cost/predict` endpoint
    - Wire to `CostPredictorService.predict()`, return `CostPredictionResponse`
    - _Requirements: 5.1, 5.2_

- [ ] 7. Checkpoint - All backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement frontend shared components and layout
  - [ ] 8.1 Create app shell with routing and navigation
    - Set up React Router in `frontend/src/App.tsx` with routes for `/` (landing), `/documents` (Document Analyzer), `/resources` (Resource Aggregator), `/cost` (Cost Predictor)
    - Create `frontend/src/components/NavBar.tsx` with navigation links to all three modules
    - _Requirements: 7.1_

  - [ ] 8.2 Create shared UI components
    - Create `frontend/src/components/LoadingIndicator.tsx` for processing/query states
    - Create `frontend/src/components/ErrorDisplay.tsx` for user-friendly error messages
    - Create `frontend/src/components/SearchResultCard.tsx` for reusable result display
    - _Requirements: 7.3, 8.1_

  - [ ] 8.3 Create landing page
    - Create `frontend/src/pages/LandingPage.tsx` with brief descriptions of each module and call-to-action buttons navigating to each module
    - Ensure responsive layout for desktop and mobile
    - _Requirements: 7.2, 7.5_

- [ ] 9. Implement frontend module pages
  - [ ] 9.1 Implement Document Analyzer page
    - Create `frontend/src/pages/DocumentAnalyzer.tsx`
    - File upload form (PDF/TXT) with drag-and-drop, upload confirmation display with document name and page count
    - Search input with results list showing highlighted text, section headings, page numbers, relevance scores
    - Summarize button (full-doc and per-section) with summary display and references
    - Loading indicators during upload, search, and summarization
    - Error display for validation errors and service failures
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 7.3_

  - [ ] 9.2 Implement Resource Aggregator page
    - Create `frontend/src/pages/ResourceAggregator.tsx`
    - Search input for AWS topic queries
    - Results list with title, source URL, snippet, resource type badge
    - Filter tabs/buttons for blogs, videos, articles
    - No-results state with suggested alternative terms
    - Loading and error states
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 7.3_

  - [ ] 9.3 Implement Cost Predictor page
    - Create `frontend/src/pages/CostPredictor.tsx`
    - Text area for natural language cost specification input
    - Results display: table/cards showing each identified service with estimated cost, free tier info (eligibility, limits, duration, restrictions), optimization suggestions with estimated savings
    - Total estimated monthly cost summary
    - No-services-identified error state
    - Loading and error states
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 6.1, 6.2, 6.3, 7.3_

- [ ] 10. Wire frontend to backend API and finalize
  - [ ] 10.1 Create API client service
    - Create `frontend/src/services/api.ts` with functions for all backend endpoints: `uploadDocument()`, `searchDocument()`, `summarizeDocument()`, `searchResources()`, `predictCost()`
    - Include error handling that maps backend `ErrorResponse` to user-friendly display
    - _Requirements: 7.4, 8.1_

  - [ ] 10.2 Connect all frontend pages to API client
    - Wire `DocumentAnalyzer` page to `uploadDocument`, `searchDocument`, `summarizeDocument` API calls
    - Wire `ResourceAggregator` page to `searchResources` API call
    - Wire `CostPredictor` page to `predictCost` API call
    - Ensure loading indicators show during all async operations
    - _Requirements: 7.3, 7.4_

  - [ ] 10.3 Set up Express server with all routes and middleware
    - Create `backend/src/index.ts` as the Express entry point
    - Mount all route modules (`/api/documents`, `/api/resources`, `/api/cost`)
    - Add error-handling middleware, CORS configuration, JSON body parsing, multipart upload handling
    - _Requirements: 7.4, 8.1, 8.3_

- [ ] 11. Final checkpoint - Full platform integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major module
- Property tests use `fast-check` and validate the 15 correctness properties from the design
- Unit tests validate specific examples and edge cases
- All backend services mock AWS SDK clients in tests (S3, DynamoDB, Bedrock)
