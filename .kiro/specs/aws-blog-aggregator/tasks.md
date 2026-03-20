# Implementation Plan: AWS Developer Intelligence Platform

## Overview

This plan implements the AWS Developer Intelligence Platform as a full-stack application with React 18 + Next.js 14 + TypeScript + TailwindCSS frontend and Node.js + Express.js backend. The platform consists of three tools: Documentation Navigator, Blog Post Aggregator, and Cost Surprise Predictor. Tasks are ordered to build foundational infrastructure first, then each tool incrementally, followed by frontend UI and integration.

## Tasks

- [x] 1. Project setup and shared infrastructure
  - [x] 1.1 Initialize monorepo with Next.js 14 frontend and Express.js backend
    - Create project root with `packages/frontend` (Next.js 14, React 18, TypeScript, TailwindCSS) and `packages/backend` (Express.js, TypeScript)
    - Configure `tsconfig.json` for both packages with shared types in `packages/shared`
    - Set up ESLint, Prettier, and Jest/Vitest test runners for both packages
    - Install core dependencies: `next`, `react`, `express`, `aws-sdk` (v3), `zod`, `axios`
    - _Requirements: All (project foundation)_

  - [x] 1.2 Define shared TypeScript interfaces and types
    - Create `packages/shared/src/types/` with all interfaces from the design document
    - Define enums: `DocumentFormat`, `QueryType`, `ContentSource`, `DifficultyLevel`, `AuthorityLevel`, `TrendStatus`, `CostRange`, `CleanupMethod`, `SessionStatus`, `ResourceStatus`
    - Define core interfaces: `ContentItem`, `ContentMetadata`, `AuthorInfo`, `EngagementMetrics`, `QualityScore`, `SearchQuery`, `FilterCriteria`
    - Define Documentation Navigator types: `ProcessedQuery`, `ExtractedSection`, `HighlightedSection`, `Answer`, `CodeExample`, `DocumentInfo`
    - Define Cost Predictor types: `Workshop`, `CostAnalysis`, `AWSResource`, `ResourcePricing`, `HiddenCost`, `TrackingSession`, `CleanupScript`
    - Export all types from a barrel `index.ts`
    - _Requirements: All (shared type foundation)_

  - [x] 1.3 Set up Express.js backend with API routing structure
    - Create Express app entry point with CORS, JSON body parsing, and error handling middleware
    - Define route modules: `/api/docs/*`, `/api/blog/*`, `/api/cost/*`
    - Implement global error handler with structured error responses
    - Add request logging middleware
    - _Requirements: 27.1, 27.2, 27.3_

  - [x] 1.4 Set up DynamoDB tables and S3 buckets configuration
    - Create infrastructure config for DynamoDB tables: `Documents`, `ContentCache`, `AuthorDB`, `TrendData`, `Workshops`, `ResourceTracking`, `PricingData`, `SearchHistory`, `QueryHistory`
    - Create S3 bucket config for: `custom-docs-uploads`, `workshop-content`
    - Implement DynamoDB client wrapper with retry logic and exponential backoff
    - Implement S3 client wrapper for file upload/download
    - _Requirements: 26.1, 26.4, 38.1_

  - [ ]* 1.5 Write unit tests for shared infrastructure
    - Test DynamoDB client wrapper retry logic and error handling
    - Test S3 client wrapper upload/download operations
    - Test error handling middleware
    - _Requirements: 27.1, 27.4_

- [x] 2. Checkpoint - Verify project setup
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Documentation Navigator - Indexing and data layer
  - [x] 3.1 Implement Document Indexer service
    - Create `DocumentIndexer` class implementing `indexOfficialDocs()`, `indexCustomDoc()`, `syncOfficialDocs()`, `searchIndex()`
    - Implement document parsing for PDF (using `pdf-parse`), HTML (using `cheerio`), Markdown (using `marked`), and plain text
    - Parse documents into sections by heading structure, store section metadata (title, level, parent sections)
    - Generate vector embeddings for semantic search using AWS Bedrock
    - Create full-text search index using keyword extraction
    - Implement 24-hour sync scheduling for official AWS docs
    - _Requirements: 1.1, 1.2, 1.5, 3.1, 3.2_

  - [ ]* 3.2 Write property tests for Document Indexer
    - **Property 1: Index completeness** - For any valid document, all sections are indexed and searchable
    - **Validates: Requirements 1.1, 3.2**

  - [x] 3.3 Implement Document Manager service
    - Create `DocumentManager` class implementing `listDocuments()`, `selectDocuments()`, `getSelectedDocuments()`, `uploadCustomDoc()`, `deleteCustomDoc()`
    - Organize AWS official docs by service categories (Compute, Storage, Database, Networking, Security, etc.)
    - Separate custom uploads from official docs in listing
    - Support multi-select for cross-service queries
    - Implement search/filter by service name or category
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.3, 3.4, 3.5_

  - [ ]* 3.4 Write unit tests for Document Manager
    - Test document listing with filters
    - Test multi-select behavior and default selection
    - Test custom doc upload and deletion
    - _Requirements: 2.1, 2.2, 2.5_

- [x] 4. Documentation Navigator - Query processing and answer building
  - [x] 4.1 Implement Query Processor service
    - Create `QueryProcessor` class implementing `processQuery()`, `suggestCompletions()`, `mapToAWSTerms()`
    - Implement natural language normalization (lowercase, remove filler words)
    - Extract AWS service names from queries (Lambda, S3, IAM, etc.)
    - Classify query type: HOW_TO, WHAT_IS, TROUBLESHOOT, BEST_PRACTICE, COMPARISON
    - Map informal language to formal AWS terminology using a synonym dictionary
    - Generate auto-complete suggestions based on common AWS queries
    - _Requirements: 4.2, 5.1, 5.2, 5.3, 5.4_

  - [ ]* 4.2 Write property tests for Query Processor
    - **Property 2: Query normalization idempotency** - Processing a query twice produces the same result
    - **Validates: Requirements 5.1, 5.2**

  - [x] 4.3 Implement Section Extractor service
    - Create `SectionExtractor` class implementing `extractRelevantSections()`, `highlightAnswers()`
    - Rank search matches by relevance score, extract top 5 sections
    - Include parent section context for clarity
    - Identify exact sentences/paragraphs that answer the question
    - Generate highlight ranges (startIndex, endIndex) for answer text within sections
    - Include section numbers and titles for reference
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 4.4 Implement Answer Builder service
    - Create `AnswerBuilder` class implementing `buildAnswer()`
    - Generate 2-3 sentence direct answer summaries using AWS Bedrock
    - Format HOW_TO answers as numbered step lists
    - Include source section references in direct answers
    - Fall back to highlighted sections when direct answer cannot be determined
    - Suggest up to 3 related sections (prerequisites, next steps, related concepts)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 4.5 Implement Code Extractor service
    - Create `CodeExtractor` class implementing `extractCodeExamples()`, `identifyConfigurableParams()`
    - Detect code blocks by language markers (```python, ```javascript, etc.)
    - Extract inline code snippets for configuration values
    - Identify configurable parameters (placeholders, variables)
    - Prioritize complete, runnable examples
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 4.6 Implement Prerequisite Analyzer service
    - Create `PrerequisiteAnalyzer` class implementing `analyzePrerequisites()`, `checkKnowledgeGaps()`
    - Extract concepts mentioned in sections
    - Identify knowledge gaps and find prerequisite sections
    - Order prerequisites by dependency (foundational first)
    - _Requirements: 9.2_

  - [x] 4.7 Implement Question History Manager
    - Create `QuestionHistoryManager` class implementing `saveQuestion()`, `getHistory()`, `getAnswer()`
    - Store last 50 questions per user in DynamoDB
    - Support re-displaying previous answers
    - _Requirements: 4.4, 4.5_

  - [ ]* 4.8 Write unit tests for Answer Builder and Section Extractor
    - Test direct answer generation for different query types
    - Test section extraction ranking and highlighting
    - Test fallback behavior when no direct answer found
    - _Requirements: 7.1, 7.5, 6.1, 6.5_

- [x] 5. Documentation Navigator - API routes
  - [x] 5.1 Create Documentation Navigator REST API endpoints
    - `POST /api/docs/query` - Submit natural language question, returns Answer with highlighted sections
    - `GET /api/docs/list` - List available documents with optional filters
    - `POST /api/docs/select` - Select documents for querying
    - `POST /api/docs/upload` - Upload custom documentation (PDF, HTML, MD, TXT)
    - `DELETE /api/docs/:docId` - Delete custom uploaded document
    - `GET /api/docs/history` - Get question history
    - `GET /api/docs/history/:questionId` - Re-display a previous answer
    - Wire together QueryProcessor → DocumentIndexer → SectionExtractor → AnswerBuilder → CodeExtractor pipeline
    - Implement 2-second response time target for queries
    - _Requirements: 1.3, 2.1, 3.1, 3.5, 4.1, 4.4, 4.5, 5.5, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 5.2 Write integration tests for Documentation Navigator API
    - Test full query pipeline from question to answer
    - Test multi-document query returning results from multiple docs
    - Test custom document upload and querying
    - _Requirements: 5.5, 10.1, 10.5_

- [x] 6. Checkpoint - Documentation Navigator backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Blog Aggregator - Content fetching and normalization
  - [x] 7.1 Implement Content Fetcher service with source adapters
    - Create `ContentFetcher` class implementing `fetchFromAllSources()`, `fetchFromSource()`
    - Implement source adapters for: AWS Blog (RSS/scraping), Reddit API, HackerNews API, Medium API, Dev.to API, YouTube Data API, GitHub Search API, Twitter/X API, AWS Docs, AWS Whitepapers
    - Implement parallel fetching with 5-second timeout per source
    - Implement exponential backoff retry logic for failed requests
    - Continue processing when individual sources fail, log errors
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 27.1, 27.4_

  - [x] 7.2 Implement Rate Limiter service
    - Create rate limiter with per-source quotas (Reddit: 60/min, HN: 30/min, GitHub: 30/min, etc.)
    - Implement token bucket algorithm for rate limiting
    - Queue requests when rate limit is reached
    - Temporarily disable consistently failing sources with admin alerts
    - _Requirements: 11.2, 27.4, 27.5_

  - [x] 7.3 Implement Content Normalizer service
    - Create `Normalizer` class implementing `normalize()`, `extractMetadata()`
    - Transform source-specific formats into unified `ContentItem` structure
    - Extract metadata: hasCodeExamples, hasDiagrams, hasStepByStep, estimatedReadTime, difficultyLevel, techStack, awsServices
    - Normalize dates to ISO 8601, validate URLs
    - Extract author credentials from bio/profile
    - Truncate content to first 500 words for processing
    - _Requirements: 11.4_

  - [ ]* 7.4 Write unit tests for Content Fetcher and Normalizer
    - Test parallel fetching with simulated source failures
    - Test normalization of different source formats
    - Test rate limiter token bucket behavior
    - _Requirements: 11.2, 11.3, 11.4_

- [x] 8. Blog Aggregator - Ranking system
  - [x] 8.1 Implement Ranking System service
    - Create `RankingSystem` class implementing `calculateQualityScore()`, `rankResults()`
    - Implement recency scoring: ≤30 days=10, 31-90=8, 91-180=6, 181-365=4, 1-2yr=2, >2yr=1
    - Implement author authority scoring: AWS Hero=10, AWS Employee=8, Recognized Contributor=6, Community=4, Unknown=3
    - Implement community validation scoring with platform-specific normalization (Reddit upvotes, HN points, GitHub stars, Medium claps)
    - Implement practical impact scoring: performance improvements +3, cost savings +3, before/after +2, case study +1, baseline 3
    - Implement content quality scoring: code examples +2.5, diagrams +2, step-by-step +2, edge cases +1.5, comprehensive +2, baseline 3
    - Calculate overall: (recency×0.20) + (authority×0.15) + (validation×0.25) + (impact×0.25) + (quality×0.15)
    - Handle missing data with neutral scores, tiebreak by recency
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 13.1, 13.2, 13.3, 13.4, 14.1, 14.2, 14.3, 14.4, 14.5, 15.1, 15.2, 15.3, 15.4, 15.5, 16.1, 16.2, 16.3, 16.4, 16.5, 17.1, 17.2, 17.3, 17.4, 17.5_

  - [ ]* 8.2 Write property tests for Ranking System
    - **Property 3: Quality score bounds** - For any ContentItem, qualityScore is always between 0.0 and 10.0 inclusive
    - **Validates: Requirements 12.4**

  - [ ]* 8.3 Write property tests for Ranking System ordering
    - **Property 4: Ranking consistency** - For any two items, if item A has a higher quality score than item B, A always ranks before B
    - **Validates: Requirements 12.3, 12.5**

  - [ ]* 8.4 Write property tests for recency scoring
    - **Property 5: Recency monotonicity** - For any two items, the newer item always receives a recency score greater than or equal to the older item
    - **Validates: Requirements 13.1, 13.2, 13.3**

- [x] 9. Blog Aggregator - Filtering, conflicts, and trends
  - [x] 9.1 Implement Filter Engine service
    - Create `FilterEngine` class implementing `applyFilters()`
    - Support filters: freeTierOnly, recencyRange, difficultyLevels, techStacks, implementationTimeRange, focusAreas, minQualityScore
    - Apply AND logic across all specified filters
    - Maintain original ranking order after filtering
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7_

  - [x] 9.2 Implement Conflict Detector service
    - Create `ConflictDetector` class implementing `detectConflicts()`, `analyzeRecommendations()`
    - Extract key recommendations from content items using NLP (AWS Comprehend)
    - Group recommendations by topic, compare using semantic similarity
    - Flag contradictions when similarity < 0.3 and both items are highly ranked
    - Identify deprecated vs. current practices using AWS service lifecycle data
    - Classify conflict severity: HIGH (contradictory best practices), MEDIUM (different valid approaches), LOW (minor differences)
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [x] 9.3 Implement Trend Analyzer service
    - Create `TrendAnalyzer` class implementing `analyzeTrend()`, `updateTrendData()`, `getTrendingTopics()`
    - Track daily content volume per topic in DynamoDB
    - Calculate 90-day rolling average, compare current to previous period
    - Classify: Rising (>20% increase), Stable (-20% to +20%), Declining (>20% decrease)
    - Schedule daily trend data updates via EventBridge
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_

  - [x] 9.4 Implement Recommendation Engine service
    - Create `RecommendationEngine` class implementing `getRecommendations()`, `findRelatedContent()`
    - Calculate similarity based on AWS services, topics, and difficulty
    - Apply weights: topic similarity 40%, complementary skills 30%, sequential learning 30%
    - Exclude previously viewed content, limit to 5 recommendations
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_

  - [ ]* 9.5 Write unit tests for Filter Engine
    - Test AND logic across multiple filters
    - Test each filter type individually
    - Test empty filter passthrough
    - _Requirements: 19.1, 19.7_

- [x] 10. Blog Aggregator - Search engine, caching, and API routes
  - [x] 10.1 Implement Search Engine service
    - Create `SearchEngine` class implementing `search()`, `expandQuery()`, `suggestAlternatives()`
    - Extract key concepts and AWS service names from queries
    - Expand queries with synonyms and related terms
    - Orchestrate: ContentFetcher → Normalizer → RankingSystem → FilterEngine pipeline
    - Suggest alternative search terms when no results found
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5_

  - [x] 10.2 Implement Cache Manager service
    - Create `CacheManager` class implementing `get()`, `set()`, `invalidate()`, `refreshInBackground()`
    - Cache key: hash of (query + filters), TTL: 24 hours
    - Serve stale content while refreshing in background
    - Persist quality scores to avoid recalculation
    - Return cached results within 500ms
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5_

  - [x] 10.3 Implement Result Card Builder service
    - Create `ResultCardBuilder` class implementing `buildCard()`
    - Extract up to 3 key takeaways using NLP
    - Fetch user experience quotes from Reddit/HN (up to 2, prioritize recent highly-upvoted)
    - Extract prerequisites from content using pattern matching
    - Include conflict warnings and trend indicators
    - Format impact metrics, community validation stats, and related links
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 22.1, 22.2, 22.3, 22.4, 22.5, 23.1, 23.2, 23.3, 23.4, 23.5_

  - [x] 10.4 Implement Content Freshness Monitor
    - Maintain database of AWS service lifecycle states in DynamoDB
    - Check content references against current/deprecated services
    - Display warnings for deprecated service references
    - Suggest current alternatives for deprecated services
    - Update service lifecycle data weekly from AWS announcements
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5_

  - [x] 10.5 Create Blog Aggregator REST API endpoints
    - `POST /api/blog/search` - Submit search query with optional filters, returns ranked ResultCards
    - `GET /api/blog/trending` - Get trending topics
    - `GET /api/blog/recommendations/:itemId` - Get related content recommendations
    - `GET /api/blog/conflicts` - Get detected conflicts for current results
    - Wire together full search pipeline with caching
    - Implement error handling: partial results with source availability notices
    - _Requirements: 11.1, 25.1, 27.1, 27.2, 27.3_

  - [ ]* 10.6 Write integration tests for Blog Aggregator API
    - Test full search pipeline from query to ranked results
    - Test caching behavior (cache hit, stale refresh)
    - Test partial results when sources fail
    - _Requirements: 26.2, 27.1, 27.3_

- [x] 11. Checkpoint - Blog Aggregator backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Cost Predictor - Workshop management and cost analysis
  - [x] 12.1 Implement Workshop Manager service
    - Create `WorkshopManager` class implementing `listWorkshops()`, `getWorkshop()`, `syncWorkshops()`, `addCustomTutorial()`
    - Fetch and parse AWS Workshops catalog (500+ workshops)
    - Organize by category: Serverless, Containers, ML, Security, Networking, Database, etc.
    - Support custom tutorial addition via URL
    - Implement daily auto-sync via EventBridge for new workshops
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5_

  - [x] 12.2 Implement Cost Analyzer service
    - Create `CostAnalyzer` class implementing `analyzeTutorial()`, `scanContent()`, `calculateCosts()`
    - Parse CloudFormation templates to extract resource definitions
    - Parse Terraform files to extract resource definitions
    - Parse AWS CLI commands that create resources (e.g., `aws ec2 run-instances`)
    - Parse instructional text for resource mentions using NLP
    - Look up current pricing from AWS Pricing API
    - Calculate hourly, daily, and monthly costs per resource
    - Generate three cost scenarios: "If deleted after workshop", "If left running 1 day", "If left running 1 month"
    - Identify free tier eligible resources and show costs only if limits exceeded
    - Highlight most expensive services in the report
    - _Requirements: 30.2, 30.3, 31.1, 31.2, 31.3, 31.4, 31.5, 32.1, 32.2, 32.3, 32.4, 32.5_

  - [ ]* 12.3 Write property tests for Cost Analyzer
    - **Property 6: Cost non-negativity** - For any set of AWS resources, all calculated costs (hourly, daily, monthly) are non-negative
    - **Validates: Requirements 31.2**

  - [ ]* 12.4 Write property tests for cost scenario consistency
    - **Property 7: Cost scenario ordering** - For any resource set, "after workshop" cost ≤ "1 day" cost ≤ "1 month" cost
    - **Validates: Requirements 31.4**

- [x] 13. Cost Predictor - Hidden costs, tracking, and cleanup
  - [x] 13.1 Implement Hidden Cost Detector service
    - Create `HiddenCostDetector` class implementing `detectHiddenCosts()`, `checkTutorialDocumentation()`, `compareWithActualResources()`
    - Parse tutorial text for explicit resource mentions and cost mentions
    - Compare mentioned resources with actual deployed resources
    - Flag resources deployed but not mentioned in tutorial
    - Flag resources claimed as "free" but actually costing money
    - Detect common hidden costs: NAT Gateways, ALBs, Elastic IPs, Multi-AZ, data transfer, CloudWatch logs
    - Classify severity by monthly cost impact
    - _Requirements: 33.1, 33.2, 33.3, 33.4, 33.5_

  - [x] 13.2 Implement Resource Tracker service
    - Create `ResourceTracker` class implementing `startTracking()`, `getActiveSessions()`, `updateSession()`, `markResourceDeleted()`, `calculateAccumulatedCost()`
    - Create tracking records associating tutorials with users
    - Record resource IDs, types, and deployment timestamps
    - Calculate accumulated costs by multiplying hourly rates by elapsed time
    - Update cost calculations daily via EventBridge scheduled rule
    - Indicate active vs. deleted resources
    - Display warnings for resources running > 24 hours
    - Group resources by tutorial
    - _Requirements: 34.1, 34.2, 34.3, 34.4, 34.5, 35.1, 35.2, 35.3, 35.4, 35.5_

  - [x] 13.3 Implement Cleanup Script Generator service
    - Create `CleanupScriptGenerator` class implementing `generateScript()`, `orderByDependencies()`
    - Determine resource dependencies and order deletions correctly (e.g., EC2 before security groups, RDS before subnets, ALB before target groups)
    - Generate AWS CLI deletion scripts with proper ordering
    - Generate CloudFormation stack deletion commands
    - Generate Terraform destroy commands
    - Include verification commands to confirm all resources deleted
    - Calculate cost savings from deletion
    - _Requirements: 36.1, 36.2, 36.3, 36.4, 36.5_

  - [ ]* 13.4 Write unit tests for Cleanup Script Generator
    - Test dependency ordering for complex resource graphs
    - Test script generation for each cleanup method (CLI, CloudFormation, Terraform)
    - Test verification command inclusion
    - _Requirements: 36.2, 36.3, 36.5_

- [x] 14. Cost Predictor - Notifications, pricing DB, and API routes
  - [x] 14.1 Implement Notification Manager service
    - Create `NotificationManager` class implementing `sendCostAlert()`, `sendTimeAlert()`, `configureThresholds()`, `dismissNotification()`
    - Send notifications when accumulated cost exceeds $5 (configurable threshold)
    - Send reminders when resources running > 7 days (configurable)
    - Include tutorial name, current cost, and cleanup script link in notifications
    - Prevent duplicate notifications for dismissed alerts
    - Support in-app and email notification channels via SNS
    - _Requirements: 37.1, 37.2, 37.3, 37.4, 37.5_

  - [x] 14.2 Implement Pricing Database Manager service
    - Create `PricingDatabaseManager` class implementing `updatePricing()`, `getPricing()`, `getLastUpdate()`
    - Fetch pricing from AWS Pricing API for all major resource types
    - Cache pricing data in DynamoDB for fast lookups
    - Support all major AWS regions
    - Handle On-Demand, Reserved, and Spot pricing models
    - Schedule monthly pricing updates via EventBridge
    - _Requirements: 38.1, 38.5_

  - [x] 14.3 Implement Tutorial Cost Database service
    - Store cost analyses in DynamoDB for reuse
    - Display cost badges: "Free", "Low Cost ($0-$10)", "Medium Cost ($10-$50)", "High Cost (>$50)"
    - Maintain analyses for official workshops, popular blog tutorials, and community guides
    - Update analyses monthly to reflect pricing changes
    - _Requirements: 38.1, 38.2, 38.3, 38.4, 38.5_

  - [x] 14.4 Create Cost Predictor REST API endpoints
    - `GET /api/cost/workshops` - List workshops with optional filters and cost badges
    - `GET /api/cost/workshops/:workshopId` - Get workshop details with cost analysis
    - `POST /api/cost/scan` - Scan a workshop or custom tutorial URL for costs
    - `GET /api/cost/tracking` - Get user's active tracking sessions
    - `POST /api/cost/tracking/start` - Start tracking resources for a tutorial
    - `PUT /api/cost/tracking/:sessionId/resource/:resourceId/delete` - Mark resource as deleted
    - `GET /api/cost/cleanup/:sessionId` - Generate cleanup script for a session
    - `GET /api/cost/notifications` - Get user notifications
    - `PUT /api/cost/notifications/:id/dismiss` - Dismiss a notification
    - `PUT /api/cost/notifications/config` - Configure notification thresholds
    - Wire together full cost analysis pipeline
    - _Requirements: 29.3, 30.1, 30.4, 30.5, 32.1, 34.3, 36.4, 37.3_

  - [ ]* 14.5 Write integration tests for Cost Predictor API
    - Test workshop listing with cost badges
    - Test cost scan pipeline for CloudFormation and CLI tutorials
    - Test resource tracking lifecycle (start → track → cleanup)
    - _Requirements: 30.3, 31.4, 36.4_

- [x] 15. Checkpoint - All backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Frontend - Layout and shared components
  - [x] 16.1 Create Next.js app layout and navigation
    - Create root layout with TailwindCSS configuration and global styles
    - Implement top navigation bar with links to three tools: Documentation Navigator, Blog Aggregator, Cost Predictor
    - Create responsive sidebar layout component (used by Doc Navigator and Cost Predictor)
    - Implement loading states, error boundaries, and toast notification system
    - Set up API client utility with base URL configuration and error handling
    - _Requirements: 2.1, 4.1_

  - [x] 16.2 Create shared UI components
    - Build `SearchInput` component with auto-complete dropdown support
    - Build `QualityScoreBadge` component displaying 0-10 score with color coding
    - Build `CostBadge` component displaying Free/Low/Medium/High with color coding
    - Build `FilterPanel` component with checkbox groups, dropdowns, and range sliders
    - Build `CodeBlock` component with syntax highlighting (using `prism-react-renderer`) and copy-to-clipboard
    - Build `LoadingSpinner` and `EmptyState` components
    - _Requirements: 4.2, 8.2, 8.5, 18.1, 38.4_

- [x] 17. Frontend - Documentation Navigator UI
  - [x] 17.1 Build Documentation Navigator page
    - Create `/docs` page with three-panel layout: doc selection sidebar, question sidebar, main answer area
    - Implement document selection panel with searchable list, category grouping, multi-select checkboxes
    - Visually indicate selected documents with highlighted state
    - Separate official AWS docs from custom uploads in the list
    - Default to all docs selected when none explicitly chosen
    - _Requirements: 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 17.2 Build question sidebar and answer display
    - Implement question input field with auto-complete suggestions
    - Display question history list in sidebar with click-to-reload
    - Render direct answer summary at top of main area (2-3 sentences)
    - Render numbered step lists for HOW_TO answers
    - Display highlighted extracted sections with section numbers and titles
    - Highlight exact answer sentences/paragraphs with a distinct background color
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2, 6.3, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 17.3 Build code examples and related sections display
    - Render code examples with syntax highlighting and copy-to-clipboard
    - Highlight configurable parameters in code examples
    - Display related section suggestions (up to 3) with titles and descriptions
    - Allow clicking related sections to view content and update suggestions
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 17.4 Build custom document upload UI
    - Implement file upload dropzone accepting PDF, HTML, MD, TXT
    - Show upload progress and indexing status
    - Allow naming and categorizing uploaded documents
    - Show delete button for custom uploads
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 18. Frontend - Blog Aggregator UI
  - [x] 18.1 Build Blog Aggregator search page
    - Create `/blog` page with search bar, filter sidebar, and results area
    - Implement search input with natural language support
    - Display loading state during search (skeleton cards)
    - Show partial results notice when some sources are unavailable
    - Show "no results" state with alternative search term suggestions
    - _Requirements: 25.1, 25.4, 25.5, 27.2, 27.3_

  - [x] 18.2 Build Result Card component
    - Display quality score with breakdown tooltip (recency, authority, validation, impact, quality)
    - Show publish date, author name with credentials badge, estimated read time, difficulty level
    - Display up to 3 key takeaways as bullet points
    - Show impact metrics (performance improvements, cost savings) prominently
    - Display community validation stats (upvotes, stars, shares)
    - Show user experience quotes from Reddit/HN (up to 2) with source attribution and links
    - Display prerequisite list (AWS services, tools, SDKs)
    - Show direct links to original article, related discussions, and code repos
    - Display conflict warnings with contradictory positions summary
    - Show trend indicator (rising/stable/declining with percentage)
    - Display deprecated service warnings with suggested alternatives
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 20.2, 20.3, 21.1, 21.2, 21.3, 22.1, 22.2, 22.3, 22.4, 23.1, 23.2, 23.3, 23.5, 28.2, 28.3_

  - [x] 18.3 Build filter sidebar for Blog Aggregator
    - Implement filter controls: free tier toggle, recency range dropdown, difficulty checkboxes, tech stack multi-select, implementation time range slider, focus area tags
    - Apply filters on change, update results in real-time
    - Show active filter count badge
    - Clear all filters button
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7_

  - [x] 18.4 Build trending topics and recommendations views
    - Create trending topics section showing rising/declining topics with percentage changes
    - Display declining topic warnings
    - Build recommendations panel showing up to 5 related items after viewing an article
    - Use same Result Card format for recommendations
    - _Requirements: 21.1, 21.2, 21.3, 24.1, 24.2, 24.5_

- [x] 19. Frontend - Cost Predictor UI
  - [x] 19.1 Build Cost Predictor workshop list page
    - Create `/cost` page with searchable workshop catalog
    - Display workshop cards with title, description, category, difficulty, estimated duration
    - Show cost badges (Free/Low/Medium/High) on each workshop card
    - Implement category filter tabs (Serverless, Containers, ML, Security, etc.)
    - Implement search by workshop name or description
    - _Requirements: 29.3, 29.4, 30.1, 38.2, 38.4_

  - [x] 19.2 Build cost report display
    - Create detailed cost report view showing every AWS service that will be deployed
    - Display per-service: hourly rate, daily cost, projected monthly cost
    - Clearly indicate free tier eligible services
    - Show three cost scenarios: "After workshop", "1 day", "1 month" with total costs
    - Highlight most expensive services with visual emphasis
    - Display hidden cost warnings prominently with resource name, hourly cost, monthly cost
    - Show side-by-side comparison when multiple workshops scanned
    - _Requirements: 30.3, 30.4, 31.1, 31.2, 31.3, 31.4, 31.5, 33.2, 33.3_

  - [x] 19.3 Build custom tutorial scanner UI
    - Implement URL input field for custom tutorial scanning
    - Show scanning progress indicator
    - Display same cost report format for custom tutorials
    - Handle parse errors with manual resource input fallback
    - _Requirements: 32.1, 32.3, 32.5_

  - [x] 19.4 Build resource tracking dashboard
    - Display active tracking sessions grouped by tutorial
    - Show per-resource: type, status (running/stopped/deleted), deployment date, accumulated cost
    - Display warnings for resources running > 24 hours
    - Show total accumulated cost and projected monthly cost per session
    - Implement "Generate Cleanup Script" button per session
    - Display cleanup script in a code block with copy-to-clipboard
    - Show cost savings from cleanup
    - _Requirements: 34.3, 34.4, 35.1, 35.2, 35.3, 35.4, 35.5, 36.4_

  - [x] 19.5 Build notification center for cost alerts
    - Display cost threshold and time threshold notifications
    - Show tutorial name, current cost, and link to cleanup script in each notification
    - Implement dismiss button for notifications
    - Build notification settings panel for configuring thresholds
    - _Requirements: 37.1, 37.2, 37.3, 37.4, 37.5_

- [x] 20. Checkpoint - All frontend pages complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 21. Integration and end-to-end wiring
  - [x] 21.1 Wire frontend API calls to backend endpoints
    - Create API service modules in frontend: `docsApi.ts`, `blogApi.ts`, `costApi.ts`
    - Implement request/response type safety using shared types
    - Add error handling with user-friendly error messages and retry logic
    - Implement optimistic UI updates where appropriate
    - Add loading states for all async operations
    - _Requirements: 5.5, 11.5, 27.2, 27.3_

  - [x] 21.2 Implement cross-tool navigation and dashboard
    - Create landing page `/` with overview of all three tools
    - Add cross-tool links (e.g., from blog result to doc navigator for related AWS service)
    - Implement breadcrumb navigation
    - _Requirements: All (platform integration)_

  - [ ]* 21.3 Write end-to-end integration tests
    - Test Documentation Navigator: upload doc → query → receive highlighted answer
    - Test Blog Aggregator: search → filter → view result card with all metadata
    - Test Cost Predictor: select workshop → scan costs → start tracking → generate cleanup
    - Test cross-tool navigation flows
    - _Requirements: All (integration validation)_

- [x] 22. Final checkpoint - Full platform integration complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major subsystem
- Property tests validate universal correctness properties from the design
- The implementation language is TypeScript throughout (frontend and backend), matching the design document
- AWS services (Bedrock, Comprehend, DynamoDB, S3, SNS, EventBridge) are used as specified in the tech stack
