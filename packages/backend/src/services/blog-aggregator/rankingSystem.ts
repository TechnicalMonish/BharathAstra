import {
  AuthorityLevel,
  ContentSource,
  type ContentItem,
  type QualityScore,
  type ScoreBreakdown,
  type RankedResult,
  type EngagementMetrics,
} from "@aws-intel/shared";

// --- Constants ---

const WEIGHTS = {
  recency: 0.20,
  authority: 0.15,
  validation: 0.25,
  impact: 0.25,
  quality: 0.15,
} as const;

const RECENCY_THRESHOLDS = [
  { maxDays: 30, score: 10 },
  { maxDays: 90, score: 8 },
  { maxDays: 180, score: 6 },
  { maxDays: 365, score: 4 },
  { maxDays: 730, score: 2 },
] as const;

const RECENCY_MIN = 1;

const AUTHORITY_SCORES: Record<AuthorityLevel, number> = {
  [AuthorityLevel.AWS_HERO]: 10,
  [AuthorityLevel.AWS_EMPLOYEE]: 8,
  [AuthorityLevel.RECOGNIZED_CONTRIBUTOR]: 6,
  [AuthorityLevel.COMMUNITY_MEMBER]: 4,
  [AuthorityLevel.UNKNOWN]: 3,
};

const NEUTRAL_SCORE = 5;

// --- Helpers ---

function daysBetween(date1: Date, date2: Date): number {
  const ms = Math.abs(date2.getTime() - date1.getTime());
  return ms / (1000 * 60 * 60 * 24);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function calculateRecencyScore(publishDate: Date, now: Date = new Date()): number {
  const days = daysBetween(publishDate, now);
  for (const { maxDays, score } of RECENCY_THRESHOLDS) {
    if (days <= maxDays) return score;
  }
  return RECENCY_MIN;
}

function calculateAuthorityScore(authorityLevel: AuthorityLevel): number {
  return AUTHORITY_SCORES[authorityLevel] ?? AUTHORITY_SCORES[AuthorityLevel.UNKNOWN];
}

function calculateValidationScore(engagement?: EngagementMetrics): number {
  if (!engagement) return NEUTRAL_SCORE;
  return clamp(engagement.normalizedScore, 0, 10);
}

function calculateImpactScore(item: ContentItem): number {
  const content = (item.content || "").toLowerCase();
  let score = 3; // baseline

  if (/\d+\s*%\s*(faster|improvement|increase|reduction|better|performance)/i.test(content) ||
      /performance\s+(improv|gain|boost)/i.test(content)) {
    score += 3;
  }
  if (/\$\s*\d+|cost\s+sav|sav\w+\s+\$|reduc\w+\s+cost/i.test(content)) {
    score += 3;
  }
  if (/before\s*(and|\/|&)\s*after|before[\s:]+.*after/i.test(content)) {
    score += 2;
  }
  if (/case\s+study|real[\s-]world/i.test(content)) {
    score += 1;
  }

  return clamp(score, 0, 10);
}

function calculateContentQualityScore(item: ContentItem): number {
  let score = 3; // baseline
  const meta = item.metadata;

  if (meta?.hasCodeExamples) score += 2.5;
  if (meta?.hasDiagrams) score += 2;
  if (meta?.hasStepByStep) score += 2;

  // Edge cases detection from content
  const content = (item.content || "").toLowerCase();
  if (/edge\s+case|corner\s+case|error\s+handl|exception/i.test(content)) {
    score += 1.5;
  }

  // Comprehensive coverage: long content with multiple sections
  const wordCount = (item.content || "").split(/\s+/).filter(Boolean).length;
  if (wordCount > 300 && meta?.hasCodeExamples && meta?.hasStepByStep) {
    score += 2;
  }

  return clamp(score, 0, 10);
}

// --- RankingSystem class ---

export class RankingSystem {
  /**
   * Calculate a quality score for a single content item.
   */
  calculateQualityScore(item: ContentItem, now: Date = new Date()): QualityScore {
    const recency = calculateRecencyScore(item.publishDate, now);
    const authority = calculateAuthorityScore(item.author?.authorityLevel ?? AuthorityLevel.UNKNOWN);
    const validation = calculateValidationScore(item.engagement);
    const impact = calculateImpactScore(item);
    const quality = calculateContentQualityScore(item);

    const overall = clamp(
      recency * WEIGHTS.recency +
      authority * WEIGHTS.authority +
      validation * WEIGHTS.validation +
      impact * WEIGHTS.impact +
      quality * WEIGHTS.quality,
      0,
      10
    );

    const breakdown: ScoreBreakdown = {
      recencyPoints: recency,
      authorityPoints: authority,
      validationPoints: validation,
      impactPoints: impact,
      qualityPoints: quality,
    };

    return {
      overall,
      recency,
      authorAuthority: authority,
      communityValidation: validation,
      practicalImpact: impact,
      contentQuality: quality,
      breakdown,
    };
  }

  /**
   * Rank an array of content items by quality score descending.
   * Tiebreaks by recency (newer first).
   */
  rankResults(items: ContentItem[], now: Date = new Date()): RankedResult[] {
    const scored = items.map((item) => ({
      item,
      score: this.calculateQualityScore(item, now),
    }));

    scored.sort((a, b) => {
      const diff = b.score.overall - a.score.overall;
      if (Math.abs(diff) > 1e-9) return diff;
      // Tiebreak: newer content first
      return b.item.publishDate.getTime() - a.item.publishDate.getTime();
    });

    return scored.map((entry, index) => ({
      item: entry.item,
      score: entry.score,
      rank: index + 1,
    }));
  }
}

// Export helpers for testing
export {
  calculateRecencyScore,
  calculateAuthorityScore,
  calculateValidationScore,
  calculateImpactScore,
  calculateContentQualityScore,
  daysBetween,
  clamp,
  WEIGHTS,
  RECENCY_THRESHOLDS,
  RECENCY_MIN,
  AUTHORITY_SCORES,
  NEUTRAL_SCORE,
};
