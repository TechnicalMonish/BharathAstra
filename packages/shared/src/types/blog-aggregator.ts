// Blog Post Aggregator types

import {
  ConflictSeverity,
  ContentSource,
  DifficultyLevel,
  TrendStatus,
} from "./enums";
import {
  AuthorInfo,
  ContentItem,
  QualityScore,
  ScoreBreakdown,
} from "./common";

// === Search ===

export interface ExpandedQuery {
  originalTerms: string[];
  synonyms: string[];
  awsServices: string[];
  concepts: string[];
}

export interface SearchResult {
  content: ContentItem;
  qualityScore: number;
  relevanceScore: number;
}

export interface RankedResult {
  item: ContentItem;
  score: QualityScore;
  rank: number;
}

// === Content Source Results ===

export interface SourceResult {
  source: ContentSource;
  items: ContentItem[];
  error?: Error;
  retrievalTime: number;
}

// === Conflict Detection ===

export interface ConflictPosition {
  item: ContentItem;
  stance: string;
  isDeprecated: boolean;
  isCurrent: boolean;
}

export interface Conflict {
  topic: string;
  conflictingItems: ContentItem[];
  positions: ConflictPosition[];
  severity: ConflictSeverity;
  resolution?: string;
}

export interface Recommendation {
  topic: string;
  approach: string;
  supportingItems: ContentItem[];
}

// === Trend Analysis ===

export interface VolumeData {
  last30Days: number;
  last90Days: number;
  previousPeriod: number;
  percentageChange: number;
}

export interface EngagementData {
  averageScore: number;
  totalEngagement: number;
  trend: "increasing" | "stable" | "decreasing";
}

export interface TrendAnalysis {
  topic: string;
  status: TrendStatus;
  changePercentage: number;
  contentVolume: VolumeData;
  engagementTrend: EngagementData;
  lastUpdated: Date;
}

export interface TrendingTopic {
  topic: string;
  score: number;
  recentItems: ContentItem[];
}

// === Result Card ===

export interface ImpactMetrics {
  performanceImprovement?: string;
  costSavings?: string;
  otherMetrics?: string[];
}

export interface ValidationStats {
  upvotes?: number;
  stars?: number;
  shares?: number;
  comments?: number;
}

export interface UserExperience {
  quote: string;
  source: ContentSource;
  url: string;
  upvotes: number;
}

export interface RelatedLink {
  type: "article" | "discussion" | "code" | "documentation";
  title: string;
  url: string;
}

export interface ConflictWarning {
  message: string;
  conflictingApproaches: string[];
  severity: ConflictSeverity;
}

export interface TrendIndicator {
  status: TrendStatus;
  changePercentage: number;
  message: string;
}

export interface ResultCard {
  title: string;
  url: string;
  source: ContentSource;
  qualityScore: number;
  scoreBreakdown: ScoreBreakdown;
  publishDate: Date;
  author: AuthorInfo;
  estimatedReadTime: number;
  difficultyLevel: DifficultyLevel;
  keyTakeaways: string[];
  impactMetrics?: ImpactMetrics;
  prerequisites?: string[];
  communityValidation: ValidationStats;
  userExperiences?: UserExperience[];
  relatedLinks: RelatedLink[];
  conflicts?: ConflictWarning[];
  trendIndicator?: TrendIndicator;
}

// === Cache ===

export interface CachedContent {
  data: unknown;
  cachedAt: Date;
  expiresAt: Date;
  stale: boolean;
}

// === Author Database ===

export interface PlatformProfile {
  platform: ContentSource;
  username: string;
  profileUrl: string;
  followers?: number;
  reputation?: number;
}

export interface AuthorRecord {
  id: string;
  name: string;
  aliases: string[];
  authorityLevel: string;
  credentials: string[];
  platforms: PlatformProfile[];
  articlesPublished: number;
  lastUpdated: Date;
}

// === History ===

export interface SearchRecord {
  query: string;
  filters: import("./common").FilterCriteria;
  timestamp: Date;
  resultsCount: number;
}

export interface ViewRecord {
  itemId: string;
  timestamp: Date;
  durationSeconds: number;
  source: ContentSource;
}

export interface SearchHistory {
  userId: string;
  searches: SearchRecord[];
  viewedItems: ViewRecord[];
}
