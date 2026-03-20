import {
  TrendStatus,
  type ContentItem,
  type TrendAnalysis,
  type TrendingTopic,
  type VolumeData,
  type EngagementData,
} from "@aws-intel/shared";

// --- Constants ---

const RISING_THRESHOLD = 0.20;
const DECLINING_THRESHOLD = -0.20;

// --- Types ---

interface TopicData {
  items: ContentItem[];
  lastUpdated: Date;
}

// --- Helpers ---

function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function classifyTrend(percentageChange: number): TrendStatus {
  if (percentageChange > RISING_THRESHOLD) return TrendStatus.RISING;
  if (percentageChange < DECLINING_THRESHOLD) return TrendStatus.DECLINING;
  return TrendStatus.STABLE;
}

function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 1.0 : 0;
  return (current - previous) / previous;
}

function extractTopicFromItem(item: ContentItem): string[] {
  const topics: string[] = [];
  if (item.metadata?.awsServices) {
    topics.push(...item.metadata.awsServices.map((s) => s.toLowerCase()));
  }
  return topics.length > 0 ? topics : ["general"];
}

// --- TrendAnalyzer class ---

export class TrendAnalyzer {
  private topicStore: Map<string, TopicData> = new Map();

  /**
   * Analyze trend for a specific topic based on stored data.
   */
  analyzeTrend(topic: string, now: Date = new Date()): TrendAnalysis {
    const key = topic.toLowerCase();
    const data = this.topicStore.get(key);
    const items = data?.items || [];

    const volume = this.calculateVolume(items, now);
    const engagement = this.calculateEngagement(items, now);
    const status = classifyTrend(volume.percentageChange);

    return {
      topic,
      status,
      changePercentage: volume.percentageChange,
      contentVolume: volume,
      engagementTrend: engagement,
      lastUpdated: data?.lastUpdated || now,
    };
  }

  /**
   * Update trend data store with new content items.
   */
  updateTrendData(items: ContentItem[]): void {
    const now = new Date();
    for (const item of items) {
      const topics = extractTopicFromItem(item);
      for (const topic of topics) {
        const key = topic.toLowerCase();
        if (!this.topicStore.has(key)) {
          this.topicStore.set(key, { items: [], lastUpdated: now });
        }
        const data = this.topicStore.get(key)!;
        // Avoid duplicates
        if (!data.items.some((existing) => existing.id === item.id)) {
          data.items.push(item);
        }
        data.lastUpdated = now;
      }
    }
  }

  /**
   * Get trending topics sorted by score (volume × change).
   */
  getTrendingTopics(limit: number = 10, now: Date = new Date()): TrendingTopic[] {
    const topics: TrendingTopic[] = [];

    for (const [topic, data] of this.topicStore) {
      const volume = this.calculateVolume(data.items, now);
      const recentItems = data.items
        .filter((item) => daysBetween(item.publishDate, now) <= 30)
        .slice(0, 5);

      const score = volume.last30Days * (1 + Math.max(0, volume.percentageChange));

      topics.push({ topic, score, recentItems });
    }

    return topics
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private calculateVolume(items: ContentItem[], now: Date): VolumeData {
    let last30Days = 0;
    let last90Days = 0;
    let previousPeriod = 0; // 90-180 days ago

    for (const item of items) {
      const age = daysBetween(item.publishDate, now);
      if (age <= 30) {
        last30Days++;
        last90Days++;
      } else if (age <= 90) {
        last90Days++;
      } else if (age <= 180) {
        previousPeriod++;
      }
    }

    const percentageChange = calculatePercentageChange(last90Days, previousPeriod);

    return { last30Days, last90Days, previousPeriod, percentageChange };
  }

  private calculateEngagement(items: ContentItem[], now: Date): EngagementData {
    const recentItems = items.filter(
      (item) => daysBetween(item.publishDate, now) <= 90
    );

    if (recentItems.length === 0) {
      return { averageScore: 0, totalEngagement: 0, trend: "stable" };
    }

    let totalScore = 0;
    for (const item of recentItems) {
      totalScore += item.engagement?.normalizedScore ?? 0;
    }

    const averageScore = totalScore / recentItems.length;
    const totalEngagement = totalScore;

    // Compare first half vs second half of recent items (by date)
    const sorted = [...recentItems].sort(
      (a, b) => a.publishDate.getTime() - b.publishDate.getTime()
    );
    const mid = Math.floor(sorted.length / 2);
    const olderHalf = sorted.slice(0, Math.max(1, mid));
    const newerHalf = sorted.slice(Math.max(1, mid));

    const olderAvg =
      olderHalf.reduce((s, i) => s + (i.engagement?.normalizedScore ?? 0), 0) /
      olderHalf.length;
    const newerAvg =
      newerHalf.reduce((s, i) => s + (i.engagement?.normalizedScore ?? 0), 0) /
      newerHalf.length;

    let trend: "increasing" | "stable" | "decreasing" = "stable";
    const engagementChange = calculatePercentageChange(newerAvg, olderAvg);
    if (engagementChange > RISING_THRESHOLD) trend = "increasing";
    else if (engagementChange < DECLINING_THRESHOLD) trend = "decreasing";

    return { averageScore, totalEngagement, trend };
  }
}

export {
  classifyTrend,
  calculatePercentageChange,
  extractTopicFromItem,
  RISING_THRESHOLD,
  DECLINING_THRESHOLD,
};
