import {
  ConflictSeverity,
  type ContentItem,
  type RankedResult,
  type Conflict,
  type ConflictPosition,
  type Recommendation,
} from "@aws-intel/shared";

// --- Constants ---

const OPPOSING_PAIRS: [string, string][] = [
  ["serverless", "containers"],
  ["monolith", "microservices"],
  ["sql", "nosql"],
  ["rest", "graphql"],
  ["ecs", "eks"],
  ["lambda", "ec2"],
  ["dynamodb", "rds"],
  ["cloudformation", "terraform"],
  ["cdk", "sam"],
];

const DEPRECATED_KEYWORDS = [
  "deprecated", "legacy", "outdated", "no longer recommended",
  "end of life", "eol", "sunset", "replaced by",
];

const CURRENT_KEYWORDS = [
  "recommended", "best practice", "current", "latest",
  "modern", "preferred", "use instead",
];

// --- Helpers ---

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function extractTopics(item: ContentItem): string[] {
  const topics: string[] = [];
  if (item.metadata?.awsServices) {
    topics.push(...item.metadata.awsServices.map((s) => s.toLowerCase()));
  }
  const titleWords = extractKeywords(item.title);
  topics.push(...titleWords.filter((w) => w.length > 3));
  return [...new Set(topics)];
}

function keywordSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let overlap = 0;
  for (const word of setA) {
    if (setB.has(word)) overlap++;
  }
  return overlap / Math.max(setA.size, setB.size);
}

function detectStance(content: string): string {
  const lower = content.toLowerCase();
  for (const [a, b] of OPPOSING_PAIRS) {
    if (lower.includes(a) && !lower.includes(b)) return a;
    if (lower.includes(b) && !lower.includes(a)) return b;
  }
  // Extract the first strong recommendation pattern
  const match = lower.match(/(?:use|recommend|prefer|choose|go with)\s+(\w+)/);
  return match ? match[1] : "general";
}

function isDeprecated(content: string): boolean {
  const lower = content.toLowerCase();
  return DEPRECATED_KEYWORDS.some((kw) => lower.includes(kw));
}

function isCurrent(content: string): boolean {
  const lower = content.toLowerCase();
  return CURRENT_KEYWORDS.some((kw) => lower.includes(kw));
}

function classifySeverity(posA: ConflictPosition, posB: ConflictPosition): ConflictSeverity {
  // Deprecated vs current = HIGH
  if ((posA.isDeprecated && posB.isCurrent) || (posB.isDeprecated && posA.isCurrent)) {
    return ConflictSeverity.HIGH;
  }
  // Both have strong opposing stances = MEDIUM
  if (posA.stance !== posB.stance && posA.stance !== "general" && posB.stance !== "general") {
    return ConflictSeverity.MEDIUM;
  }
  return ConflictSeverity.LOW;
}

// --- ConflictDetector class ---

export class ConflictDetector {
  /**
   * Detect conflicts among ranked results by grouping by topic
   * and comparing stances using keyword similarity.
   */
  detectConflicts(results: RankedResult[]): Conflict[] {
    const items = results.map((r) => r.item);
    const recommendations = this.analyzeRecommendations(items);
    const conflicts: Conflict[] = [];

    // Group recommendations by topic
    const topicGroups = new Map<string, Recommendation[]>();
    for (const rec of recommendations) {
      const key = rec.topic.toLowerCase();
      if (!topicGroups.has(key)) topicGroups.set(key, []);
      topicGroups.get(key)!.push(rec);
    }

    for (const [topic, recs] of topicGroups) {
      if (recs.length < 2) continue;

      // Compare pairs for conflicts
      for (let i = 0; i < recs.length; i++) {
        for (let j = i + 1; j < recs.length; j++) {
          const a = recs[i];
          const b = recs[j];

          if (a.approach === b.approach) continue;

          // Check if approaches are opposing
          const aKeywords = extractKeywords(a.approach);
          const bKeywords = extractKeywords(b.approach);
          const similarity = keywordSimilarity(aKeywords, bKeywords);

          // Low similarity with different approaches = potential conflict
          if (similarity < 0.3) {
            const allItems = [...a.supportingItems, ...b.supportingItems];
            const uniqueItems = allItems.filter(
              (item, idx) => allItems.findIndex((x) => x.id === item.id) === idx
            );

            const posA: ConflictPosition = {
              item: a.supportingItems[0],
              stance: a.approach,
              isDeprecated: isDeprecated(a.supportingItems[0].content),
              isCurrent: isCurrent(a.supportingItems[0].content),
            };
            const posB: ConflictPosition = {
              item: b.supportingItems[0],
              stance: b.approach,
              isDeprecated: isDeprecated(b.supportingItems[0].content),
              isCurrent: isCurrent(b.supportingItems[0].content),
            };

            const severity = classifySeverity(posA, posB);

            conflicts.push({
              topic,
              conflictingItems: uniqueItems,
              positions: [posA, posB],
              severity,
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Extract key recommendations from content items,
   * grouping by topic with detected approach/stance.
   */
  analyzeRecommendations(items: ContentItem[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    for (const item of items) {
      const topics = extractTopics(item);
      const stance = detectStance(item.content);

      for (const topic of topics) {
        recommendations.push({
          topic,
          approach: stance,
          supportingItems: [item],
        });
      }
    }

    return recommendations;
  }
}

export {
  extractKeywords,
  extractTopics,
  keywordSimilarity,
  detectStance,
  isDeprecated,
  isCurrent,
  classifySeverity,
  OPPOSING_PAIRS,
};
