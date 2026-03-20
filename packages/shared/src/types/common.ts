// Common/shared interfaces used across multiple platform components

import {
  AuthorityLevel,
  ContentSource,
  DifficultyLevel,
} from "./enums";

// === Author & Engagement ===

export interface AuthorInfo {
  name: string;
  credentials: string[];
  authorityLevel: AuthorityLevel;
}

export interface EngagementMetrics {
  // Reddit
  upvotes?: number;
  downvotes?: number;
  // HackerNews
  points?: number;
  // GitHub
  stars?: number;
  forks?: number;
  // Medium
  claps?: number;
  // YouTube
  views?: number;
  likes?: number;
  // Twitter
  retweets?: number;
  favorites?: number;
  // General
  comments?: number;
  shares?: number;
  // Normalized
  normalizedScore: number;
}

// === Content ===

export interface ContentMetadata {
  hasCodeExamples: boolean;
  hasDiagrams: boolean;
  hasStepByStep: boolean;
  estimatedReadTime: number;
  difficultyLevel: DifficultyLevel;
  techStack: string[];
  awsServices: string[];
  implementationTime?: string;
  freeTierCompatible?: boolean;
}

export interface ContentItem {
  id: string;
  source: ContentSource;
  sourceId?: string;
  title: string;
  url: string;
  fullContentUrl?: string;
  author: AuthorInfo;
  publishDate: Date;
  lastUpdated?: Date;
  retrievedAt?: Date;
  content: string;
  metadata: ContentMetadata;
  engagement?: EngagementMetrics;
  processed?: boolean;
  processingErrors?: string[];
}

// === Search & Filter ===

export interface SearchQuery {
  text: string;
  filters?: FilterCriteria;
  limit?: number;
}

export interface FilterCriteria {
  freeTierOnly?: boolean;
  recencyRange?: string;
  difficultyLevels?: DifficultyLevel[];
  techStacks?: string[];
  implementationTimeRange?: TimeRange;
  focusAreas?: string[];
  minQualityScore?: number;
  sources?: string[];
}

export interface TimeRange {
  min?: number;
  max?: number;
}

// === Quality Scoring ===

export interface QualityScore {
  overall: number;
  recency: number;
  authorAuthority: number;
  communityValidation: number;
  practicalImpact: number;
  contentQuality: number;
  breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  recencyPoints: number;
  authorityPoints: number;
  validationPoints: number;
  impactPoints: number;
  qualityPoints: number;
}
