# Implementation Plan: AWS Documentation RAG System

## Overview

This plan implements a production-ready RAG (Retrieval-Augmented Generation) pipeline for the Documentation Navigator. The implementation updates existing components and adds new ones to fetch real AWS documentation, chunk and embed content, perform semantic search, and generate accurate answers with citations.

## Tasks

- [x] 1. Create core RAG types and interfaces
  - [x] 1.1 Add RAG-specific types to shared types
    - Add interfaces: FetchedPage, ParsedDocument, ParsedSection, CodeBlock, DocumentMetadata, Chunk, ChunkMetadata, ChunkingConfig, SearchOptions, SearchResult, RankedResult, BuiltContext, GeneratedAnswer, Citation
    - Add DocumentChunkRecord and DocumentIndexRecord interfaces for DynamoDB
    - _Requirements: 1.6, 3.1, 3.2, 4.1, 4.4, 6.1, 7.1, 10.3, 11.1_

- [x] 2. Implement ContentFetcher component
  - [x] 2.1 Create contentFetcher.ts in doc-navigator service
    - Implement fetchPage() with retry logic and exponential backoff
    - Implement crawlDocPages() with rate limiting (10 req/sec)
    - Implement URL validation for AWS documentation domains
    - Handle 4xx/5xx errors with up to 3 retry attempts
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_
  - [ ]* 2.2 Write unit tests for ContentFetcher
    - Test URL validation, rate limiting, retry logic
    - _Requirements: 1.1, 1.3, 1.4_

- [x] 3. Implement content caching in S3
  - [x] 3.1 Create contentCache.ts for S3-based caching
    - Implement cache storage with configurable TTL
    - Implement content hash computation for change detection
    - Implement cache retrieval with expiration checking
    - Implement stale cache fallback when fresh fetch fails
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [ ]* 3.2 Write property test for cache content hash consistency
    - **Property 13: Cache Content Hash Consistency**
    - **Validates: Requirements 2.3, 2.4**
  - [ ]* 3.3 Write property test for cache hit behavior
    - **Property 14: Cache Hit Behavior**
    - **Validates: Requirements 2.2**

- [x] 4. Implement ContentParser component
  - [x] 4.1 Create contentParser.ts in doc-navigator service
    - Implement parseHtml() to extract title, sections, and metadata
    - Implement extractSections() preserving heading hierarchy (h1-h6)
    - Implement extractCodeBlocks() with language identification
    - Remove navigation, footer, header, script, and style elements
    - Clean and normalize text content
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [ ]* 4.2 Write property test for HTML element removal
    - **Property 16: HTML Element Removal**
    - **Validates: Requirements 3.4**
  - [ ]* 4.3 Write property test for section hierarchy preservation
    - **Property 17: Section Hierarchy Preservation**
    - **Validates: Requirements 3.2**

- [~] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement ContentChunker component
  - [x] 6.1 Create contentChunker.ts in doc-navigator service
    - Implement chunkDocument() and chunkSection() with configurable token limits
    - Implement overlapping windows between adjacent chunks
    - Preserve code blocks as atomic units without splitting
    - Include metadata with section title, section number, and parent references
    - Implement mergeSmallChunks() for chunks below minimum threshold
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 6.2 Write property test for chunk coverage
    - **Property 1: Chunk Coverage**
    - **Validates: Requirements 4.5**
  - [ ]* 6.3 Write property test for chunk structure validity
    - **Property 2: Chunk Structure Validity**
    - **Validates: Requirements 4.1, 4.4**
  - [ ]* 6.4 Write property test for code block preservation
    - **Property 3: Code Block Preservation**
    - **Validates: Requirements 4.3**

- [x] 7. Update EmbeddingGenerator in documentIndexer.ts
  - [x] 7.1 Upgrade embedding generation to use Titan Embed v2
    - Update model to amazon.titan-embed-text-v2:0
    - Ensure 1024-dimension embeddings
    - Implement batch embedding with up to 25 texts per API call
    - Add retry logic with exponential backoff and jitter for rate limits
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ]* 7.2 Write property test for embedding determinism
    - **Property 4: Embedding Determinism**
    - **Validates: Requirements 5.5**
  - [ ]* 7.3 Write property test for embedding dimension consistency
    - **Property 5: Embedding Dimension Consistency**
    - **Validates: Requirements 5.2**

- [x] 8. Update VectorStore in DynamoDB
  - [x] 8.1 Update tables.ts with new chunk storage schema
    - Add DocumentChunks table configuration
    - Add DocumentIndex table configuration
    - _Requirements: 6.1, 6.4_
  - [x] 8.2 Create vectorStore.ts for chunk storage and retrieval
    - Implement storeChunk() and storeBatch() operations
    - Implement deleteByDocId() for document re-indexing
    - Implement semanticSearch() with cosine similarity
    - Support filtering by document IDs
    - Support minimum score threshold and topK limits
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  - [ ]* 8.3 Write property test for search result ordering
    - **Property 6: Search Result Ordering**
    - **Validates: Requirements 7.3**
  - [ ]* 8.4 Write property test for search result constraints
    - **Property 7: Search Result Constraints**
    - **Validates: Requirements 7.4, 7.5, 7.6**
  - [ ]* 8.5 Write property test for chunk deletion by document ID
    - **Property 19: Chunk Deletion by Document ID**
    - **Validates: Requirements 6.3**

- [~] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement ReRanker component
  - [x] 10.1 Create reRanker.ts in doc-navigator service
    - Implement rerank() using cross-encoder scoring via Bedrock
    - Implement computeCrossEncoderScore() for query-chunk pairs
    - Combine semantic similarity and rerank scores with configurable weights
    - Return results sorted by combined score
    - _Requirements: 8.1, 8.2, 8.3_
  - [ ]* 10.2 Write property test for re-rank score combination
    - **Property 8: Re-rank Score Combination**
    - **Validates: Requirements 8.2**
  - [ ]* 10.3 Write property test for re-rank result ordering
    - **Property 9: Re-rank Result Ordering**
    - **Validates: Requirements 8.3**

- [x] 11. Implement ContextBuilder component
  - [x] 11.1 Create contextBuilder.ts in doc-navigator service
    - Implement buildContext() with chunk concatenation and separators
    - Include chunk metadata for source attribution
    - Respect maximum context token limit (4000 tokens)
    - Implement token estimation using tiktoken
    - Deduplicate overlapping content from adjacent chunks
    - Set truncated flag when chunks are excluded
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  - [ ]* 11.2 Write property test for context token limit
    - **Property 10: Context Token Limit**
    - **Validates: Requirements 9.3**
  - [ ]* 11.3 Write property test for context truncation indication
    - **Property 11: Context Truncation Indication**
    - **Validates: Requirements 9.4**

- [x] 12. Update RAGAnswerGenerator in answerBuilder.ts
  - [x] 12.1 Refactor answerBuilder.ts to use RAG context
    - Update buildAnswer() to accept BuiltContext instead of HighlightedSection[]
    - Implement buildRAGPrompt() with context and question
    - Update Bedrock call to use context-aware prompting
    - Extract citations linking answer content to source chunks
    - Compute confidence score based on retrieval quality
    - Generate follow-up questions based on context
    - Handle no relevant chunks case with appropriate message
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  - [ ]* 12.2 Write property test for citation completeness and accuracy
    - **Property 12: Citation Completeness and Accuracy**
    - **Validates: Requirements 11.1, 11.2, 11.3**

- [~] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Update DocumentIndexer for RAG pipeline
  - [x] 14.1 Refactor documentIndexer.ts to use new RAG components
    - Integrate ContentFetcher, ContentParser, ContentChunker
    - Update indexOfficialDocs() to fetch real AWS documentation
    - Implement indexAwsDocument() with full pipeline: fetch → parse → chunk → embed → store
    - Update document index status on success/failure
    - Support incremental re-indexing when content changes
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  - [ ]* 14.2 Write property test for document index status consistency
    - **Property 18: Document Index Status Consistency**
    - **Validates: Requirements 12.2**

- [~] 15. Update query processing and search flow
  - [ ] 15.1 Update queryProcessor.ts for RAG queries
    - Normalize question text for consistent embedding
    - Identify AWS services and concepts mentioned
    - Determine query type (how-to, conceptual, troubleshooting)
    - _Requirements: 13.1, 13.2, 13.3_
  - [ ] 15.2 Update sectionExtractor.ts to use VectorStore semantic search
    - Replace keyword-based search with embedding-based semantic search
    - Integrate ReRanker for improved relevance
    - _Requirements: 7.1, 7.2, 7.3, 8.1_

- [x] 16. Update API routes for RAG endpoints
  - [x] 16.1 Update docs.ts routes for RAG operations
    - Update POST /docs/query to use RAG pipeline
    - Add POST /docs/index endpoint for document indexing
    - Add GET /docs/:docId/status endpoint for index status
    - Add POST /docs/sync endpoint for scheduled sync
    - _Requirements: 12.1, 12.5_
  - [ ]* 16.2 Write integration tests for RAG API endpoints
    - Test query flow end-to-end
    - Test indexing flow
    - _Requirements: 10.1, 12.1_

- [~] 17. Implement error handling
  - [ ] 17.1 Add error handling for RAG-specific scenarios
    - Handle AWS documentation unavailable with cache fallback
    - Handle Bedrock rate limits with retry and partial results
    - Handle embedding dimension mismatch by skipping incompatible chunks
    - Log failures for monitoring and debugging
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [~] 18. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The implementation updates existing files where possible to maintain consistency
- Bedrock models used: amazon.titan-embed-text-v2:0 (embeddings), anthropic.claude-3-haiku-20240307-v1:0 (generation)
