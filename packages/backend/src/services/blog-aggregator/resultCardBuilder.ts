import {
  TrendStatus,
  type RankedResult,
  type ResultCard,
  type ImpactMetrics,
  type ValidationStats,
  type RelatedLink,
  type ConflictWarning,
  type TrendIndicator,
  type Conflict,
  type TrendAnalysis,
  type ContentItem,
} from "@aws-intel/shared";

// --- Helpers ---

function extractKeyTakeaways(content: string): string[] {
  const takeaways: string[] = [];
  const sentences = content
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 300);

  // Prioritize sentences with strong signal words
  const signalPatterns = [
    /\b(?:key|important|critical|essential|must|should|recommend|best practice)\b/i,
    /\b(?:improve|reduce|increase|save|optimize|achieve)\b/i,
    /\b\d+\s*%\b/,
    /\$\s*\d+/,
  ];

  const scored = sentences.map((s) => {
    let score = 0;
    for (const pattern of signalPatterns) {
      if (pattern.test(s)) score++;
    }
    return { sentence: s, score };
  });

  scored.sort((a, b) => b.score - a.score);

  for (const { sentence } of scored) {
    if (takeaways.length >= 3) break;
    // Avoid near-duplicates
    const isDuplicate = takeaways.some(
      (t) => t.toLowerCase().includes(sentence.toLowerCase().slice(0, 30))
    );
    if (!isDuplicate) {
      takeaways.push(sentence);
    }
  }

  return takeaways;
}

function extractImpactMetrics(content: string): ImpactMetrics | undefined {
  const metrics: ImpactMetrics = {};
  const otherMetrics: string[] = [];

  const perfMatch = content.match(/(\d+\s*%\s*(?:faster|improvement|increase|better|performance))/i);
  if (perfMatch) {
    metrics.performanceImprovement = perfMatch[1].trim();
  }

  const costMatch = content.match(/(?:cut costs? by|sav\w+)\s*(\$?\d+[%\w\s]*)/i);
  if (costMatch) {
    metrics.costSavings = costMatch[1].trim();
  }

  const otherMatch = content.match(/(\d+x\s+\w+)/gi);
  if (otherMatch) {
    otherMetrics.push(...otherMatch.slice(0, 3));
  }

  if (otherMetrics.length > 0) {
    metrics.otherMetrics = otherMetrics;
  }

  if (metrics.performanceImprovement || metrics.costSavings || metrics.otherMetrics) {
    return metrics;
  }
  return undefined;
}

function extractValidationStats(item: ContentItem): ValidationStats {
  const stats: ValidationStats = {};
  const engagement = item.engagement;
  if (!engagement) return stats;

  if (engagement.upvotes !== undefined) stats.upvotes = engagement.upvotes;
  if (engagement.stars !== undefined) stats.stars = engagement.stars;
  if (engagement.shares !== undefined) stats.shares = engagement.shares;
  if (engagement.comments !== undefined) stats.comments = engagement.comments;

  return stats;
}

function buildRelatedLinks(item: ContentItem): RelatedLink[] {
  const links: RelatedLink[] = [];

  // Original article link
  links.push({
    type: "article",
    title: item.title,
    url: item.url,
  });

  // If GitHub source, mark as code
  if (item.source === "github") {
    links[0].type = "code";
  }

  // If it references docs
  if (item.url.includes("docs.aws.amazon.com")) {
    links[0].type = "documentation";
  }

  return links;
}

function buildConflictWarnings(conflicts?: Conflict[]): ConflictWarning[] | undefined {
  if (!conflicts || conflicts.length === 0) return undefined;

  return conflicts.map((c) => ({
    message: `Conflicting advice detected on "${c.topic}"`,
    conflictingApproaches: c.positions.map((p) => p.stance),
    severity: c.severity,
  }));
}

function buildTrendIndicator(trend?: TrendAnalysis): TrendIndicator | undefined {
  if (!trend) return undefined;

  let message: string;
  switch (trend.status) {
    case TrendStatus.RISING:
      message = `Trending up ${Math.round(trend.changePercentage * 100)}% in the last 90 days`;
      break;
    case TrendStatus.DECLINING:
      message = `Declining ${Math.round(Math.abs(trend.changePercentage) * 100)}% — consider newer alternatives`;
      break;
    default:
      message = "Stable topic with consistent community interest";
  }

  return {
    status: trend.status,
    changePercentage: trend.changePercentage,
    message,
  };
}

// --- CardExtras interface ---

export interface CardExtras {
  conflicts?: Conflict[];
  trendInfo?: TrendAnalysis;
}

// --- ResultCardBuilder class ---

export class ResultCardBuilder {
  /**
   * Build a rich ResultCard from a RankedResult with optional extras.
   */
  buildCard(result: RankedResult, extras?: CardExtras): ResultCard {
    const { item, score } = result;
    const meta = item.metadata;

    return {
      title: item.title,
      url: item.url,
      source: item.source,
      qualityScore: score.overall,
      scoreBreakdown: score.breakdown,
      publishDate: item.publishDate,
      author: item.author,
      estimatedReadTime: meta?.estimatedReadTime ?? 5,
      difficultyLevel: meta?.difficultyLevel ?? "intermediate" as any,
      keyTakeaways: extractKeyTakeaways(item.content),
      impactMetrics: extractImpactMetrics(item.content),
      communityValidation: extractValidationStats(item),
      relatedLinks: buildRelatedLinks(item),
      conflicts: buildConflictWarnings(extras?.conflicts),
      trendIndicator: buildTrendIndicator(extras?.trendInfo),
    };
  }
}

export {
  extractKeyTakeaways,
  extractImpactMetrics,
  extractValidationStats,
  buildRelatedLinks,
  buildConflictWarnings,
  buildTrendIndicator,
};
