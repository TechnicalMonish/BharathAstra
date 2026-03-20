# Design Document: AWS Developer Intelligence Platform

## Overview

The AWS Developer Intelligence Platform is a comprehensive system that solves the overwhelming problem of AWS documentation and resource discovery through three integrated intelligent tools:

### 1. AWS Documentation Navigator
Provides smart, surgical documentation guidance with pre-integrated AWS official docs, custom doc uploads, sidebar question interface, and highlighted answer extraction. The navigator uses natural language processing to understand developer questions, extracts exact relevant sections from documentation, and creates guided reading paths with prerequisite identification. It cuts documentation research time from 2 hours to 15 minutes.

### 2. AWS Blog Post Aggregator & Ranker
An intelligent content discovery and ranking system that searches across multiple AWS-related content sources, aggregates results, and ranks them by quality and relevance. The aggregator retrieves content from 11+ sources including AWS official blogs, Reddit, HackerNews, Medium, Dev.to, YouTube, GitHub, Twitter/X, and AWS documentation. It applies a sophisticated multi-factor ranking algorithm that weighs recency (20%), author authority (15%), community validation (25%), practical impact (25%), and content quality (15%) to produce quality scores from 0-10. Helps developers find proven solutions in minutes instead of reading dozens of posts.

### 3. AWS Cost Surprise Predictor
Prevents surprise AWS bills by scanning tutorials and AWS workshops before deployment, warning about hidden costs, tracking deployed resources, and generating cleanup scripts. Pre-integrated with 500+ AWS workshops and supports custom tutorial analysis. Typical savings: $50-200/month for developers learning AWS.

The platform is designed for sub-5-second response times, handles API rate limits gracefully, and caches results for 24 hours to ensure fast subsequent queries.

## Architecture

The platform follows a modular architecture with three main subsystems, each with clear separation of concerns:

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Presentation Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │Doc Navigator │  │ Blog Results │  │Cost Dashboard│              │
│  │   Sidebar    │  │    Cards     │  │              │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────────────┐
│                      Application Layer                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Documentation   │  │   Blog Post      │  │   Cost Surprise  │  │
│  │    Navigator     │  │   Aggregator     │  │    Predictor     │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────────────┐
│                         Data Layer                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Doc Index  │  │Content Cache │  │  Cost DB     │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: AWS Documentation Navigator

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Presentation Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Sidebar    │  │Answer Display│  │Doc Selection │      │
│  │   Question   │  │with Highlight│  │   Panel      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Query Processor│ │Section Extract│ │Prerequisite  │      │
│  └──────────────┘  └──────────────┘  │  Analyzer    │      │
│  ┌──────────────┐  ┌──────────────┐  └──────────────┘      │
│  │Answer Builder│  │Code Extractor│                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Indexing Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Doc Indexer   │  │  Parser      │  │  Sync Engine │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                         Data Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Document Index│  │Custom Docs   │  │Query History │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Documentation Sources                   │
│  AWS Official Docs │ Custom Uploads (PDF, HTML, MD, TXT)    │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**Presentation Layer:**
- Sidebar Question: Input field with auto-complete and question history
- Answer Display: Shows direct answers with highlighted sections
- Doc Selection Panel: Lists available docs with search and filtering

**Application Layer:**
- Query Processor: Parses natural language, maps to AWS terminology
- Section Extractor: Identifies and extracts relevant doc sections
- Prerequisite Analyzer: Identifies required knowledge gaps
- Answer Builder: Constructs direct answers from extracted sections
- Code Extractor: Finds and formats code examples

**Indexing Layer:**
- Doc Indexer: Creates searchable index of documentation
- Parser: Handles PDF, HTML, Markdown, and text formats
- Sync Engine: Auto-updates AWS official docs every 24 hours

**Data Layer:**
- Document Index: Vector embeddings and full-text search index
- Custom Docs: User-uploaded documentation storage
- Query History: Previous questions and answers for quick reference

---

## Part 2: AWS Blog Post Aggregator

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Presentation Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Result Cards │  │   Filters    │  │  Trend View  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Search Engine │  │Ranking System│  │Filter Engine │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Conflict Det. │  │Trend Analyzer│  │Recommender   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Integration Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Content Fetch │  │  Normalizer  │  │Rate Limiter  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                         Data Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Content Cache │  │Author DB     │  │Trend DB      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      External Sources                        │
│  AWS Blogs │ Reddit │ HN │ Medium │ Dev.to │ YouTube │      │
│  GitHub │ Twitter/X │ AWS Docs │ Whitepapers                │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**Presentation Layer:**
- Result Cards: Display aggregated content with rich metadata
- Filters: UI controls for filtering results
- Trend View: Visualization of trending and declining topics

**Application Layer:**
- Search Engine: Query processing, synonym expansion, result orchestration
- Ranking System: Multi-factor quality scoring and result ordering
- Filter Engine: Apply user-specified criteria to narrow results
- Conflict Detector: Identify contradictory advice using NLP
- Trend Analyzer: Track content volume and engagement trends
- Recommender: Suggest related content based on viewing history

**Integration Layer:**
- Content Fetcher: Retrieve content from external sources with retry logic
- Normalizer: Transform diverse data formats into unified structure
- Rate Limiter: Manage API quotas and implement backoff strategies

**Data Layer:**
- Content Cache: 24-hour TTL cache for retrieved content
- Author Database: Authority levels for recognized contributors
- Trend Database: Historical data for trend analysis

---

## Part 3: AWS Cost Surprise Predictor

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Presentation Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Cost Dashboard│  │Workshop List │  │Cleanup Panel │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Cost Analyzer │  │Resource Track│  │Cleanup Script│      │
│  └──────────────┘  │              │  │  Generator   │      │
│  ┌──────────────┐  └──────────────┘  └──────────────┘      │
│  │Hidden Cost   │                                            │
│  │  Detector    │                                            │
│  └──────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                         Data Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Workshop DB   │  │Resource Track│  │Pricing DB    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      External Sources                        │
│  AWS Workshops │ AWS Pricing API │ Custom Tutorials         │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**Presentation Layer:**
- Cost Dashboard: Shows tracked resources and accumulated costs
- Workshop List: Searchable catalog with cost badges
- Cleanup Panel: Displays cleanup scripts and cost savings

**Application Layer:**
- Cost Analyzer: Scans tutorials for AWS resource deployments
- Resource Tracker: Monitors deployed resources and calculates costs
- Cleanup Script Generator: Creates deletion scripts with dependency ordering
- Hidden Cost Detector: Identifies costs not mentioned in tutorials

**Data Layer:**
- Workshop Database: Pre-analyzed cost data for 500+ workshops
- Resource Tracking: Active resources with deployment timestamps
- Pricing Database: Current AWS pricing data updated monthly

## Components and Interfaces

---

## Part 1: AWS Documentation Navigator Components

### 1. Document Indexer

**Purpose:** Index AWS official documentation and custom uploads for fast semantic search.

**Interface:**
```typescript
interface DocumentIndexer {
  indexOfficialDocs(): Promise<IndexResult>
  indexCustomDoc(file: UploadedFile): Promise<IndexResult>
  syncOfficialDocs(): Promise<SyncResult>
  searchIndex(query: string, docIds?: string[]): Promise<SearchMatch[]>
}

interface UploadedFile {
  name: string
  format: DocumentFormat
  content: Buffer
  category?: string
}

enum DocumentFormat {
  PDF = "pdf",
  HTML = "html",
  MARKDOWN = "markdown",
  TEXT = "text"
}

interface IndexResult {
  docId: string
  title: string
  sections: number
  indexedAt: Date
  success: boolean
  errors?: string[]
}

interface SyncResult {
  docsUpdated: number
  docsAdded: number
  docsRemoved: number
  syncedAt: Date
}

interface SearchMatch {
  docId: string
  docTitle: string
  sectionId: string
  sectionTitle: string
  content: string
  relevanceScore: number
}
```

**Key Operations:**
- `indexOfficialDocs()`: Initial indexing of 200+ AWS service docs
- `indexCustomDoc()`: Parse and index user-uploaded documentation
- `syncOfficialDocs()`: Daily sync to update AWS documentation
- `searchIndex()`: Semantic search across indexed documents

**Indexing Strategy:**
- Parse documents into sections (by heading structure)
- Generate vector embeddings for semantic search
- Create full-text search index for keyword matching
- Store section metadata (title, level, parent sections)
- Index time: < 10 seconds for documents up to 1000 pages

### 2. Query Processor

**Purpose:** Parse natural language questions and map to AWS terminology.

**Interface:**
```typescript
interface QueryProcessor {
  processQuery(question: string): ProcessedQuery
  suggestCompletions(partial: string): string[]
  mapToAWSTerms(informal: string): string[]
}

interface ProcessedQuery {
  originalQuestion: string
  normalizedQuestion: string
  awsServices: string[]
  concepts: string[]
  queryType: QueryType
  keywords: string[]
}

enum QueryType {
  HOW_TO = "how_to",           // "How do I..."
  WHAT_IS = "what_is",          // "What is..."
  TROUBLESHOOT = "troubleshoot", // "Why isn't..."
  BEST_PRACTICE = "best_practice", // "What's the best way..."
  COMPARISON = "comparison"      // "Difference between..."
}
```

**Query Processing Steps:**
1. Normalize question (lowercase, remove filler words)
2. Extract AWS service names (Lambda, S3, IAM, etc.)
3. Identify key concepts (permissions, encryption, scaling)
4. Classify query type for answer formatting
5. Generate search keywords

**Example:**
- Input: "How do I give Lambda permission to read from S3?"
- Output:
  - AWS Services: ["Lambda", "S3", "IAM"]
  - Concepts: ["permissions", "access control"]
  - Query Type: HOW_TO
  - Keywords: ["lambda", "s3", "permissions", "iam role", "policy"]

### 3. Section Extractor

**Purpose:** Extract relevant sections from documentation with precise highlighting.

**Interface:**
```typescript
interface SectionExtractor {
  extractRelevantSections(matches: SearchMatch[], query: ProcessedQuery): ExtractedSection[]
  highlightAnswers(section: ExtractedSection, query: ProcessedQuery): HighlightedSection
}

interface ExtractedSection {
  docId: string
  docTitle: string
  sectionId: string
  sectionNumber: string  // e.g., "3.2.1"
  sectionTitle: string
  content: string
  relevanceScore: number
  parentSections: SectionReference[]
}

interface SectionReference {
  sectionNumber: string
  title: string
}

interface HighlightedSection {
  section: ExtractedSection
  highlights: Highlight[]
}

interface Highlight {
  text: string
  startIndex: number
  endIndex: number
  relevanceScore: number
}
```

**Extraction Logic:**
- Rank search matches by relevance score
- Extract top 5 most relevant sections
- Include parent section context for clarity
- Identify exact sentences/paragraphs that answer the question
- Highlight answer text within sections

### 4. Answer Builder

**Purpose:** Construct direct answers from extracted sections.

**Interface:**
```typescript
interface AnswerBuilder {
  buildAnswer(sections: HighlightedSection[], query: ProcessedQuery): Answer
}

interface Answer {
  directAnswer?: string  // 2-3 sentence summary
  answerType: AnswerType
  sections: HighlightedSection[]
  codeExamples: CodeExample[]
  relatedSections: RelatedSection[]
  prerequisites: Prerequisite[]
}

enum AnswerType {
  DIRECT = "direct",           // Clear answer found
  MULTI_STEP = "multi_step",   // Step-by-step instructions
  REFERENCE = "reference",     // No direct answer, show sections
  AMBIGUOUS = "ambiguous"      // Multiple interpretations
}

interface CodeExample {
  language: string
  code: string
  description: string
  sourceSection: SectionReference
  configurableParams: Parameter[]
}

interface Parameter {
  name: string
  description: string
  defaultValue?: string
}

interface RelatedSection {
  sectionId: string
  title: string
  description: string
  relationshipType: RelationType
}

enum RelationType {
  PREREQUISITE = "prerequisite",
  NEXT_STEP = "next_step",
  RELATED_CONCEPT = "related_concept"
}

interface Prerequisite {
  concept: string
  description: string
  learnMoreSection?: SectionReference
}
```

**Answer Building Strategy:**
- For HOW_TO queries: Extract step-by-step instructions
- For WHAT_IS queries: Extract definition and key characteristics
- For TROUBLESHOOT queries: Extract common issues and solutions
- Limit direct answer to 2-3 sentences
- Include code examples when implementation-related
- Suggest 3 related sections (prerequisites, next steps, related concepts)

### 5. Code Extractor

**Purpose:** Find and format code examples from documentation.

**Interface:**
```typescript
interface CodeExtractor {
  extractCodeExamples(sections: ExtractedSection[], query: ProcessedQuery): CodeExample[]
  identifyConfigurableParams(code: string, language: string): Parameter[]
}
```

**Extraction Rules:**
- Detect code blocks by language markers (```python, ```javascript, etc.)
- Extract inline code snippets for configuration values
- Identify configurable parameters (placeholders, variables)
- Prioritize complete, runnable examples
- Include surrounding context (description, prerequisites)

### 6. Prerequisite Analyzer

**Purpose:** Identify required knowledge before reading content.

**Interface:**
```typescript
interface PrerequisiteAnalyzer {
  analyzePrerequisites(sections: ExtractedSection[], userKnowledge: UserKnowledge): Prerequisite[]
  checkKnowledgeGaps(prerequisites: Prerequisite[], userKnowledge: UserKnowledge): KnowledgeGap[]
}

interface UserKnowledge {
  userId: string
  knownConcepts: string[]
  knownServices: string[]
  experienceLevel: ExperienceLevel
}

enum ExperienceLevel {
  BEGINNER = "beginner",
  INTERMEDIATE = "intermediate",
  ADVANCED = "advanced"
}

interface KnowledgeGap {
  concept: string
  description: string
  learnMoreSection: SectionReference
  estimatedReadTime: number
}
```

**Analysis Strategy:**
- Extract concepts mentioned in sections
- Compare against user's known concepts
- Identify gaps (concepts user doesn't know)
- Find prerequisite sections to fill gaps
- Order prerequisites by dependency (foundational first)

### 7. Document Manager

**Purpose:** Manage document selection and organization.

**Interface:**
```typescript
interface DocumentManager {
  listDocuments(filter?: DocumentFilter): DocumentInfo[]
  selectDocuments(docIds: string[]): void
  getSelectedDocuments(): DocumentInfo[]
  uploadCustomDoc(file: UploadedFile): Promise<DocumentInfo>
  deleteCustomDoc(docId: string): Promise<void>
}

interface DocumentFilter {
  category?: string
  searchTerm?: string
  type?: DocumentType
}

enum DocumentType {
  OFFICIAL_AWS = "official_aws",
  CUSTOM_UPLOAD = "custom_upload"
}

interface DocumentInfo {
  docId: string
  title: string
  category: string
  type: DocumentType
  sections: number
  lastUpdated: Date
  selected: boolean
}
```

**Document Organization:**
- AWS official docs organized by service category:
  - Compute (EC2, Lambda, ECS, etc.)
  - Storage (S3, EBS, EFS, etc.)
  - Database (RDS, DynamoDB, Aurora, etc.)
  - Networking (VPC, CloudFront, Route53, etc.)
  - Security (IAM, KMS, Secrets Manager, etc.)
  - And 15+ more categories
- Custom uploads shown separately
- Search filters by service name or category
- Multi-select for cross-service queries

### 8. Question History Manager

**Purpose:** Store and retrieve previous questions for quick reference.

**Interface:**
```typescript
interface QuestionHistoryManager {
  saveQuestion(question: string, answer: Answer): Promise<void>
  getHistory(userId: string, limit?: number): HistoryEntry[]
  getAnswer(questionId: string): Answer
}

interface HistoryEntry {
  questionId: string
  question: string
  timestamp: Date
  answerType: AnswerType
  docsQueried: string[]
}
```

**History Features:**
- Store last 50 questions per user
- Click previous question to re-display answer
- Search history by keyword
- Clear history option

---

## Part 2: AWS Blog Post Aggregator Components

### 1. Search Engine

**Purpose:** Process user queries and orchestrate content retrieval across all sources.

**Interface:**
```typescript
interface SearchEngine {
  search(query: SearchQuery): Promise<SearchResult[]>
  expandQuery(query: string): ExpandedQuery
  suggestAlternatives(query: string): string[]
}

interface SearchQuery {
  text: string
  filters?: FilterCriteria
  limit?: number
}

interface ExpandedQuery {
  originalTerms: string[]
  synonyms: string[]
  awsServices: string[]
  concepts: string[]
}

interface SearchResult {
  content: ContentItem
  qualityScore: number
  relevanceScore: number
}
```

**Key Operations:**
- `search()`: Main entry point that coordinates retrieval, ranking, and filtering
- `expandQuery()`: Expands user query with synonyms and related terms
- `suggestAlternatives()`: Provides alternative search terms when no results found

**Dependencies:**
- Content Fetcher (for retrieval)
- Ranking System (for scoring)
- Filter Engine (for filtering)

### 2. Content Fetcher

**Purpose:** Retrieve content from external sources with error handling and rate limiting.

**Interface:**
```typescript
interface ContentFetcher {
  fetchFromAllSources(query: ExpandedQuery): Promise<SourceResult[]>
  fetchFromSource(source: ContentSource, query: ExpandedQuery): Promise<ContentItem[]>
}

interface SourceResult {
  source: ContentSource
  items: ContentItem[]
  error?: Error
  retrievalTime: number
}

enum ContentSource {
  AWS_BLOG = "aws_blog",
  REDDIT = "reddit",
  HACKERNEWS = "hackernews",
  MEDIUM = "medium",
  DEVTO = "devto",
  YOUTUBE = "youtube",
  GITHUB = "github",
  TWITTER = "twitter",
  AWS_DOCS = "aws_docs",
  AWS_WHITEPAPERS = "aws_whitepapers"
}
```

**Key Operations:**
- `fetchFromAllSources()`: Parallel retrieval from all sources with timeout
- `fetchFromSource()`: Single source retrieval with retry logic

**Error Handling:**
- Continues processing if individual sources fail
- Implements exponential backoff for retries
- Logs errors for monitoring

### 3. Normalizer

**Purpose:** Transform diverse data formats from different sources into a unified structure.

**Interface:**
```typescript
interface Normalizer {
  normalize(sourceResult: SourceResult): ContentItem[]
  extractMetadata(rawContent: any, source: ContentSource): ContentMetadata
}

interface ContentItem {
  id: string
  source: ContentSource
  title: string
  url: string
  author: AuthorInfo
  publishDate: Date
  content: string
  metadata: ContentMetadata
}

interface ContentMetadata {
  hasCodeExamples: boolean
  hasDiagrams: boolean
  hasStepByStep: boolean
  estimatedReadTime: number
  difficultyLevel: DifficultyLevel
  techStack: string[]
  awsServices: string[]
  implementationTime?: string
  freeTierCompatible?: boolean
}

interface AuthorInfo {
  name: string
  credentials: string[]
  authorityLevel: AuthorityLevel
}

enum DifficultyLevel {
  BEGINNER = "beginner",
  INTERMEDIATE = "intermediate",
  ADVANCED = "advanced"
}

enum AuthorityLevel {
  AWS_HERO = "aws_hero",
  AWS_EMPLOYEE = "aws_employee",
  RECOGNIZED_CONTRIBUTOR = "recognized_contributor",
  COMMUNITY_MEMBER = "community_member",
  UNKNOWN = "unknown"
}
```

**Key Operations:**
- `normalize()`: Converts source-specific format to ContentItem
- `extractMetadata()`: Extracts structured metadata from content

**Normalization Rules:**
- Dates converted to ISO 8601 format
- URLs validated and normalized
- Author credentials extracted from bio/profile
- Content truncated to first 500 words for processing

### 4. Ranking System

**Purpose:** Calculate quality scores and order results by relevance and quality.

**Interface:**
```typescript
interface RankingSystem {
  calculateQualityScore(item: ContentItem): QualityScore
  rankResults(items: ContentItem[]): RankedResult[]
}

interface QualityScore {
  overall: number  // 0.0 to 10.0
  recency: number  // 20% weight
  authorAuthority: number  // 15% weight
  communityValidation: number  // 25% weight
  practicalImpact: number  // 25% weight
  contentQuality: number  // 15% weight
  breakdown: ScoreBreakdown
}

interface ScoreBreakdown {
  recencyPoints: number
  authorityPoints: number
  validationPoints: number
  impactPoints: number
  qualityPoints: number
}

interface RankedResult {
  item: ContentItem
  score: QualityScore
  rank: number
}
```

**Scoring Algorithm:**

1. **Recency Score (20% weight):**
   - Content ≤ 30 days: 10.0 points
   - Content 31-90 days: 8.0 points
   - Content 91-180 days: 6.0 points
   - Content 181-365 days: 4.0 points
   - Content 1-2 years: 2.0 points
   - Content > 2 years: 1.0 points

2. **Author Authority Score (15% weight):**
   - AWS Hero: 10.0 points
   - AWS Employee/Solutions Architect: 8.0 points
   - Recognized Contributor (5+ well-received articles): 6.0 points
   - Community Member: 4.0 points
   - Unknown: 3.0 points (neutral baseline)

3. **Community Validation Score (25% weight):**
   - Normalized engagement score based on platform
   - Reddit: (upvotes - downvotes) / age_in_days
   - HackerNews: points / age_in_days
   - GitHub: stars / age_in_days
   - Medium: claps / age_in_days
   - Negative feedback reduces score

4. **Practical Impact Score (25% weight):**
   - Quantified performance improvements: +3.0 points
   - Cost savings data: +3.0 points
   - Before/after metrics: +2.0 points
   - Real-world case study: +1.0 points
   - Baseline (no metrics): 3.0 points

5. **Content Quality Score (15% weight):**
   - Working code examples: +2.5 points
   - Architecture diagrams: +2.0 points
   - Step-by-step instructions: +2.0 points
   - Addresses edge cases: +1.5 points
   - Comprehensive coverage: +2.0 points
   - Baseline: 3.0 points

**Final Score Calculation:**
```
overall = (recency * 0.20) + (authority * 0.15) + (validation * 0.25) + 
          (impact * 0.25) + (quality * 0.15)
```

### 5. Filter Engine

**Purpose:** Apply user-specified criteria to narrow search results.

**Interface:**
```typescript
interface FilterEngine {
  applyFilters(results: RankedResult[], criteria: FilterCriteria): RankedResult[]
}

interface FilterCriteria {
  freeTierOnly?: boolean
  recencyRange?: RecencyRange
  difficultyLevels?: DifficultyLevel[]
  techStacks?: string[]
  implementationTimeRange?: TimeRange
  focusAreas?: string[]
  minQualityScore?: number
}

enum RecencyRange {
  LAST_WEEK = "last_week",
  LAST_MONTH = "last_month",
  LAST_3_MONTHS = "last_3_months",
  LAST_6_MONTHS = "last_6_months",
  LAST_YEAR = "last_year"
}

interface TimeRange {
  min?: number  // minutes
  max?: number  // minutes
}
```

**Filter Logic:**
- All filters use AND logic (must match all specified criteria)
- Empty/undefined filters are ignored
- Results maintain original ranking order after filtering

### 6. Conflict Detector

**Purpose:** Identify contradictory advice across multiple content items using NLP.

**Interface:**
```typescript
interface ConflictDetector {
  detectConflicts(results: RankedResult[]): Conflict[]
  analyzeRecommendations(items: ContentItem[]): Recommendation[]
}

interface Conflict {
  topic: string
  conflictingItems: ContentItem[]
  positions: ConflictPosition[]
  severity: ConflictSeverity
  resolution?: string
}

interface ConflictPosition {
  item: ContentItem
  stance: string
  isDeprecated: boolean
  isCurrent: boolean
}

enum ConflictSeverity {
  HIGH = "high",  // Contradictory best practices
  MEDIUM = "medium",  // Different approaches, both valid
  LOW = "low"  // Minor differences in implementation
}

interface Recommendation {
  topic: string
  approach: string
  supportingItems: ContentItem[]
}
```

**Detection Strategy:**
- Extract key recommendations from each content item
- Group recommendations by topic (AWS service, architecture pattern, etc.)
- Compare recommendations using semantic similarity
- Flag contradictions when similarity < 0.3 and both highly ranked
- Identify deprecated vs. current practices using AWS service lifecycle data

### 7. Trend Analyzer

**Purpose:** Track content volume and engagement trends over time.

**Interface:**
```typescript
interface TrendAnalyzer {
  analyzeTrend(topic: string): TrendAnalysis
  updateTrendData(items: ContentItem[]): void
  getTrendingTopics(limit: number): TrendingTopic[]
}

interface TrendAnalysis {
  topic: string
  status: TrendStatus
  changePercentage: number
  contentVolume: VolumeData
  engagementTrend: EngagementData
  lastUpdated: Date
}

enum TrendStatus {
  RISING = "rising",
  STABLE = "stable",
  DECLINING = "declining"
}

interface VolumeData {
  last30Days: number
  last90Days: number
  previousPeriod: number
  percentageChange: number
}

interface EngagementData {
  averageScore: number
  totalEngagement: number
  trend: "increasing" | "stable" | "decreasing"
}

interface TrendingTopic {
  topic: string
  score: number
  recentItems: ContentItem[]
}
```

**Trend Calculation:**
- Track daily content volume per topic
- Calculate 90-day rolling average
- Compare current period to previous period
- Rising: > 20% increase
- Stable: -20% to +20% change
- Declining: > 20% decrease
- Update trend data daily

### 8. Recommendation Engine

**Purpose:** Suggest related content based on viewing history and content similarity.

**Interface:**
```typescript
interface RecommendationEngine {
  getRecommendations(viewedItem: ContentItem, history: ContentItem[]): ContentItem[]
  findRelatedContent(item: ContentItem, allItems: ContentItem[]): ContentItem[]
}

interface RecommendationStrategy {
  topicSimilarity: number  // 40% weight
  complementarySkills: number  // 30% weight
  sequentialLearning: number  // 30% weight
}
```

**Recommendation Logic:**
- Exclude previously viewed content
- Calculate similarity based on AWS services, topics, and difficulty
- Prioritize complementary content (prerequisites, next steps)
- Limit to 5 recommendations per item
- Order by recommendation score (similarity + complementarity)

### 9. Result Card Builder

**Purpose:** Format content items into rich display cards with all metadata.

**Interface:**
```typescript
interface ResultCardBuilder {
  buildCard(result: RankedResult, extras: CardExtras): ResultCard
}

interface CardExtras {
  userExperiences?: UserExperience[]
  prerequisites?: string[]
  relatedContent?: ContentItem[]
  conflicts?: Conflict[]
  trendInfo?: TrendAnalysis
}

interface ResultCard {
  // Core Info
  title: string
  url: string
  source: ContentSource
  
  // Quality Metrics
  qualityScore: number
  scoreBreakdown: ScoreBreakdown
  
  // Metadata
  publishDate: Date
  author: AuthorInfo
  estimatedReadTime: number
  difficultyLevel: DifficultyLevel
  
  // Content Insights
  keyTakeaways: string[]  // Max 3
  impactMetrics?: ImpactMetrics
  prerequisites?: string[]
  
  // Community Data
  communityValidation: ValidationStats
  userExperiences?: UserExperience[]
  
  // Additional Info
  relatedLinks: RelatedLink[]
  conflicts?: ConflictWarning[]
  trendIndicator?: TrendIndicator
}

interface ImpactMetrics {
  performanceImprovement?: string
  costSavings?: string
  otherMetrics?: string[]
}

interface ValidationStats {
  upvotes?: number
  stars?: number
  shares?: number
  comments?: number
}

interface UserExperience {
  quote: string
  source: ContentSource
  url: string
  upvotes: number
}

interface RelatedLink {
  type: "article" | "discussion" | "code" | "documentation"
  title: string
  url: string
}

interface ConflictWarning {
  message: string
  conflictingApproaches: string[]
  severity: ConflictSeverity
}

interface TrendIndicator {
  status: TrendStatus
  changePercentage: number
  message: string
}
```

**Card Building Process:**
1. Extract core content information
2. Format quality score with breakdown
3. Extract up to 3 key takeaways using NLP
4. Fetch user experiences from Reddit/HN if available
5. Identify prerequisites from content
6. Check for conflicts with other results
7. Add trend indicator if topic is trending/declining
8. Format all data into display-ready structure

### 10. Cache Manager

**Purpose:** Manage content caching with 24-hour TTL and background refresh.

**Interface:**
```typescript
interface CacheManager {
  get(key: string): Promise<CachedContent | null>
  set(key: string, content: any, ttl: number): Promise<void>
  invalidate(key: string): Promise<void>
  refreshInBackground(key: string, fetcher: () => Promise<any>): void
}

interface CachedContent {
  data: any
  cachedAt: Date
  expiresAt: Date
  stale: boolean
}
```

**Caching Strategy:**
- Cache key: hash of (query + filters)
- TTL: 24 hours
- Serve stale content while refreshing in background
- Persist quality scores to avoid recalculation
- Cache individual source results separately for partial updates

## Data Models

### ContentItem
Primary data structure representing a piece of content from any source.

```typescript
interface ContentItem {
  // Identity
  id: string  // UUID
  source: ContentSource
  sourceId: string  // Original ID from source platform
  
  // Core Content
  title: string
  url: string
  content: string  // First 500 words
  fullContentUrl?: string
  
  // Author
  author: AuthorInfo
  
  // Temporal
  publishDate: Date
  lastUpdated?: Date
  retrievedAt: Date
  
  // Metadata
  metadata: ContentMetadata
  
  // Engagement
  engagement: EngagementMetrics
  
  // Processing
  processed: boolean
  processingErrors?: string[]
}
```

### EngagementMetrics
Platform-specific engagement data normalized for comparison.

```typescript
interface EngagementMetrics {
  // Reddit
  upvotes?: number
  downvotes?: number
  
  // HackerNews
  points?: number
  
  // GitHub
  stars?: number
  forks?: number
  
  // Medium
  claps?: number
  
  // YouTube
  views?: number
  likes?: number
  
  // Twitter
  retweets?: number
  favorites?: number
  
  // General
  comments?: number
  shares?: number
  
  // Normalized
  normalizedScore: number  // 0-10 scale
}
```

### AuthorDatabase
Stores authority levels for recognized AWS community contributors.

```typescript
interface AuthorRecord {
  id: string
  name: string
  aliases: string[]  // Different usernames across platforms
  authorityLevel: AuthorityLevel
  credentials: string[]
  platforms: PlatformProfile[]
  articlesPublished: number
  lastUpdated: Date
}

interface PlatformProfile {
  platform: ContentSource
  username: string
  profileUrl: string
  followers?: number
  reputation?: number
}
```

### TrendData
Historical data for trend analysis.

```typescript
interface TrendRecord {
  topic: string
  date: Date
  contentCount: number
  totalEngagement: number
  averageQualityScore: number
  topItems: string[]  // ContentItem IDs
}

interface TopicTrend {
  topic: string
  dailyData: TrendRecord[]
  currentStatus: TrendStatus
  changePercentage: number
  lastCalculated: Date
}
```

### SearchHistory
User search and viewing history for personalized recommendations.

```typescript
interface SearchHistory {
  userId: string
  searches: SearchRecord[]
  viewedItems: ViewRecord[]
}

interface SearchRecord {
  query: string
  filters: FilterCriteria
  timestamp: Date
  resultsCount: number
}

interface ViewRecord {
  itemId: string
  timestamp: Date
  durationSeconds: number
  source: ContentSource
}
```

---

## Part 3: AWS Cost Surprise Predictor Components

### 1. Workshop Manager

**Purpose:** Manage pre-integrated AWS workshops and custom tutorial uploads.

**Interface:**
```typescript
interface WorkshopManager {
  listWorkshops(filter?: WorkshopFilter): WorkshopInfo[]
  getWorkshop(workshopId: string): Workshop
  syncWorkshops(): Promise<SyncResult>
  addCustomTutorial(url: string): Promise<Workshop>
}

interface WorkshopFilter {
  category?: string
  searchTerm?: string
  costRange?: CostRange
}

enum CostRange {
  FREE = "free",
  LOW = "low",      // $0-$10/month
  MEDIUM = "medium", // $10-$50/month
  HIGH = "high"     // >$50/month
}

interface WorkshopInfo {
  workshopId: string
  title: string
  description: string
  category: string
  difficulty: DifficultyLevel
  estimatedDuration: number  // minutes
  costBadge: CostRange
  lastUpdated: Date
}

interface Workshop {
  info: WorkshopInfo
  resources: AWSResource[]
  costAnalysis: CostAnalysis
  instructions: string
}
```

**Workshop Organization:**
- Categories: Serverless, Containers, Machine Learning, Security, Networking, Database, etc.
- Pre-integrated: 500+ official AWS workshops
- Auto-sync: Daily updates from AWS Workshops catalog
- Custom tutorials: Support for blog posts, GitHub repos, personal guides

### 2. Cost Analyzer

**Purpose:** Scan tutorials for AWS resource deployments and calculate costs.

**Interface:**
```typescript
interface CostAnalyzer {
  analyzeTutorial(tutorial: Tutorial): Promise<CostAnalysis>
  scanContent(content: string): AWSResource[]
  calculateCosts(resources: AWSResource[]): CostBreakdown
}

interface Tutorial {
  url?: string
  content: string
  format: TutorialFormat
}

enum TutorialFormat {
  CLOUDFORMATION = "cloudformation",
  TERRAFORM = "terraform",
  AWS_CLI = "aws_cli",
  INSTRUCTIONAL_TEXT = "instructional_text",
  MIXED = "mixed"
}

interface CostAnalysis {
  totalCosts: CostBreakdown
  resources: AWSResource[]
  hiddenCosts: HiddenCost[]
  freeTierEligible: boolean
  warnings: CostWarning[]
  generatedAt: Date
}

interface CostBreakdown {
  hourlyRate: number
  dailyCost: number
  monthlyCost: number
  scenarios: CostScenario[]
}

interface CostScenario {
  name: string  // "After workshop", "1 day", "1 month"
  totalCost: number
  description: string
}

interface AWSResource {
  resourceId: string
  resourceType: string  // "EC2", "RDS", "NAT Gateway", etc.
  configuration: ResourceConfig
  pricing: ResourcePricing
  freeTierEligible: boolean
  deploymentMethod: string  // "CloudFormation", "Terraform", "CLI", etc.
}

interface ResourceConfig {
  region: string
  instanceType?: string
  storageSize?: number
  availabilityZones?: number
  [key: string]: any  // Additional config parameters
}

interface ResourcePricing {
  hourlyRate: number
  dailyCost: number
  monthlyCost: number
  pricingModel: string  // "On-Demand", "Reserved", "Spot", etc.
}

interface HiddenCost {
  resource: AWSResource
  reason: string  // Why it's hidden
  impact: number  // Monthly cost
  severity: "high" | "medium" | "low"
}

interface CostWarning {
  message: string
  affectedResources: string[]
  severity: "critical" | "warning" | "info"
}
```

**Analysis Strategy:**
1. Parse tutorial content for AWS resource references
2. Extract CloudFormation/Terraform templates
3. Identify AWS CLI commands that create resources
4. Parse instructional text for resource mentions
5. Look up current pricing from AWS Pricing API
6. Calculate costs for all identified resources
7. Identify hidden costs (resources not explicitly mentioned)
8. Generate warnings for expensive resources

**Hidden Cost Detection:**
- NAT Gateways (often not mentioned, $0.045/hour)
- Application Load Balancers ($0.0225/hour)
- Elastic IPs when not attached ($0.005/hour)
- RDS instances (storage + instance costs)
- Multi-AZ deployments (multiplies costs)
- Data transfer costs
- CloudWatch logs retention

### 3. Resource Tracker

**Purpose:** Monitor deployed AWS resources from tutorials and calculate accumulated costs.

**Interface:**
```typescript
interface ResourceTracker {
  startTracking(workshopId: string, userId: string, resources: AWSResource[]): Promise<TrackingSession>
  getActiveSessions(userId: string): TrackingSession[]
  updateSession(sessionId: string): Promise<TrackingSession>
  markResourceDeleted(sessionId: string, resourceId: string): Promise<void>
  calculateAccumulatedCost(session: TrackingSession): number
}

interface TrackingSession {
  sessionId: string
  userId: string
  workshopId: string
  workshopTitle: string
  resources: TrackedResource[]
  startedAt: Date
  status: SessionStatus
  accumulatedCost: number
  projectedMonthlyCost: number
}

enum SessionStatus {
  ACTIVE = "active",
  PARTIALLY_DELETED = "partially_deleted",
  COMPLETED = "completed"
}

interface TrackedResource {
  resource: AWSResource
  deployedAt: Date
  deletedAt?: Date
  status: ResourceStatus
  accumulatedCost: number
}

enum ResourceStatus {
  RUNNING = "running",
  STOPPED = "stopped",
  DELETED = "deleted",
  UNKNOWN = "unknown"
}
```

**Tracking Features:**
- Associate resources with specific workshops/tutorials
- Track deployment timestamps
- Calculate accumulated costs daily
- Alert when resources run > 24 hours
- Alert when accumulated cost > $5
- Group resources by workshop for easy management
- Show projected monthly cost if left running

### 4. Cleanup Script Generator

**Purpose:** Generate scripts to delete all resources from a tutorial.

**Interface:**
```typescript
interface CleanupScriptGenerator {
  generateScript(session: TrackingSession, method: CleanupMethod): CleanupScript
  orderByDependencies(resources: AWSResource[]): AWSResource[]
}

enum CleanupMethod {
  AWS_CLI = "aws_cli",
  CLOUDFORMATION = "cloudformation",
  TERRAFORM = "terraform"
}

interface CleanupScript {
  method: CleanupMethod
  script: string
  verificationCommands: string[]
  estimatedTime: number  // minutes
  costSavings: CostSavings
  warnings: string[]
}

interface CostSavings {
  dailySavings: number
  monthlySavings: number
  totalAccumulatedCost: number
}
```

**Script Generation Logic:**
1. Identify all active resources in session
2. Determine resource dependencies
3. Order deletions to respect dependencies:
   - Delete EC2 instances before security groups
   - Delete RDS instances before subnets
   - Delete load balancers before target groups
   - etc.
4. Generate appropriate commands for chosen method
5. Include verification commands to confirm deletion
6. Calculate cost savings from deletion

**Example Output (AWS CLI):**
```bash
#!/bin/bash
# Cleanup script for workshop: Serverless Web Application
# Generated: 2025-01-25
# Estimated savings: $112/month

# Delete Application Load Balancer
aws elbv2 delete-load-balancer --load-balancer-arn arn:aws:...

# Wait for ALB deletion
aws elbv2 wait load-balancers-deleted --load-balancer-arns arn:aws:...

# Delete NAT Gateways
aws ec2 delete-nat-gateway --nat-gateway-id nat-12345
aws ec2 delete-nat-gateway --nat-gateway-id nat-67890

# Delete RDS instance
aws rds delete-db-instance --db-instance-identifier workshop-db --skip-final-snapshot

# Verification commands
echo "Verifying all resources deleted..."
aws elbv2 describe-load-balancers --load-balancer-arns arn:aws:...
aws ec2 describe-nat-gateways --nat-gateway-ids nat-12345 nat-67890
```

### 5. Hidden Cost Detector

**Purpose:** Identify costs not explicitly mentioned in tutorial documentation.

**Interface:**
```typescript
interface HiddenCostDetector {
  detectHiddenCosts(tutorial: Tutorial, analysis: CostAnalysis): HiddenCost[]
  checkTutorialDocumentation(tutorial: Tutorial): MentionedResources
  compareWithActualResources(mentioned: MentionedResources, actual: AWSResource[]): HiddenCost[]
}

interface MentionedResources {
  explicitlyMentioned: string[]  // Resource types mentioned in tutorial
  costsMentioned: boolean  // Does tutorial mention costs at all?
  freeTierClaimed: boolean  // Does tutorial claim "free tier eligible"?
}
```

**Detection Strategy:**
1. Parse tutorial text for resource mentions
2. Parse tutorial text for cost mentions
3. Compare mentioned resources with actual deployed resources
4. Flag resources that will be deployed but aren't mentioned
5. Flag resources mentioned as "free" but actually cost money
6. Calculate impact of each hidden cost
7. Prioritize by severity (high cost = high severity)

**Common Hidden Costs:**
- NAT Gateway: Often deployed automatically, rarely mentioned
- ALB: Required for many architectures, cost often overlooked
- Multi-AZ: Doubles costs, not always clear
- Data transfer: Between AZs, regions, or to internet
- CloudWatch: Logs, metrics, alarms accumulate costs
- Elastic IPs: Cost when not attached to running instance

### 6. Notification Manager

**Purpose:** Send alerts when tutorial resources are costing money.

**Interface:**
```typescript
interface NotificationManager {
  sendCostAlert(session: TrackingSession, threshold: number): Promise<void>
  sendTimeAlert(session: TrackingSession, days: number): Promise<void>
  configureThresholds(userId: string, config: NotificationConfig): Promise<void>
  dismissNotification(notificationId: string): Promise<void>
}

interface NotificationConfig {
  costThreshold: number  // Default: $5
  timeThreshold: number  // Days, default: 7
  enabled: boolean
  channels: NotificationChannel[]
}

enum NotificationChannel {
  EMAIL = "email",
  IN_APP = "in_app",
  SMS = "sms"
}

interface Notification {
  notificationId: string
  userId: string
  sessionId: string
  type: NotificationType
  message: string
  severity: "critical" | "warning" | "info"
  actionUrl: string  // Link to cleanup script
  sentAt: Date
  dismissed: boolean
}

enum NotificationType {
  COST_THRESHOLD = "cost_threshold",
  TIME_THRESHOLD = "time_threshold",
  RESOURCE_STILL_RUNNING = "resource_still_running"
}
```

**Notification Triggers:**
- Accumulated cost > $5 (configurable)
- Resources running > 7 days (configurable)
- Daily reminder if resources still active
- Weekly summary of all tracked resources

### 7. Pricing Database Manager

**Purpose:** Maintain current AWS pricing data.

**Interface:**
```typescript
interface PricingDatabaseManager {
  updatePricing(): Promise<void>
  getPricing(resourceType: string, region: string, config: ResourceConfig): ResourcePricing
  getLastUpdate(): Date
}
```

**Pricing Management:**
- Fetch pricing from AWS Pricing API
- Update monthly (AWS pricing changes infrequently)
- Cache pricing data for fast lookups
- Support all major AWS regions
- Handle different pricing models (On-Demand, Reserved, Spot)

---

## Part 3: Cost Predictor Data Models

### Workshop
Complete workshop information with cost analysis.

```typescript
interface Workshop {
  workshopId: string
  title: string
  description: string
  category: string
  difficulty: DifficultyLevel
  estimatedDuration: number
  sourceUrl: string
  instructions: string
  resources: AWSResource[]
  costAnalysis: CostAnalysis
  lastAnalyzed: Date
  popularity: number  // View count
}
```

### TrackingSession
Active monitoring session for deployed resources.

```typescript
interface TrackingSession {
  sessionId: string
  userId: string
  workshopId: string
  workshopTitle: string
  resources: TrackedResource[]
  startedAt: Date
  lastUpdated: Date
  status: SessionStatus
  accumulatedCost: number
  projectedMonthlyCost: number
  notifications: Notification[]
}
```

### CostDatabase
Pre-analyzed cost data for workshops.

```typescript
interface CostDatabase {
  workshopId: string
  costAnalysis: CostAnalysis
  analyzedAt: Date
  pricingVersion: string  // Track pricing data version
  userReports: UserCostReport[]  // Actual costs reported by users
}

interface UserCostReport {
  userId: string
  actualCost: number
  duration: number  // hours
  region: string
  reportedAt: Date
  notes?: string
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

