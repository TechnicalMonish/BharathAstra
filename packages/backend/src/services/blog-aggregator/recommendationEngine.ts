import {
  DifficultyLevel,
  type ContentItem,
} from "@aws-intel/shared";

// --- Constants ---

const WEIGHTS = {
  topicSimilarity: 0.40,
  complementarySkills: 0.30,
  sequentialLearning: 0.30,
} as const;

const MAX_RECOMMENDATIONS = 5;

const DIFFICULTY_ORDER: Record<string, number> = {
  [DifficultyLevel.BEGINNER]: 0,
  [DifficultyLevel.INTERMEDIATE]: 1,
  [DifficultyLevel.ADVANCED]: 2,
};

// --- Helpers ---

function setOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));
  let overlap = 0;
  for (const item of setA) {
    if (setB.has(item)) overlap++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? overlap / union : 0;
}

function topicSimilarity(a: ContentItem, b: ContentItem): number {
  const servicesScore = setOverlap(
    a.metadata?.awsServices || [],
    b.metadata?.awsServices || []
  );
  const techScore = setOverlap(
    a.metadata?.techStack || [],
    b.metadata?.techStack || []
  );
  return (servicesScore + techScore) / 2;
}

function complementarySkillsScore(viewed: ContentItem, candidate: ContentItem): number {
  const viewedServices = new Set(
    (viewed.metadata?.awsServices || []).map((s) => s.toLowerCase())
  );
  const candidateServices = (candidate.metadata?.awsServices || []).map((s) =>
    s.toLowerCase()
  );

  // Complementary = candidate has services the user hasn't seen yet
  const newServices = candidateServices.filter((s) => !viewedServices.has(s));
  const sharedServices = candidateServices.filter((s) => viewedServices.has(s));

  // Best score when there's some overlap (context) plus new services
  if (candidateServices.length === 0) return 0;
  const novelty = newServices.length / candidateServices.length;
  const relevance = sharedServices.length > 0 ? 0.5 : 0;
  return Math.min(1, novelty * 0.6 + relevance);
}

function sequentialLearningScore(viewed: ContentItem, candidate: ContentItem): number {
  const viewedLevel = DIFFICULTY_ORDER[viewed.metadata?.difficultyLevel ?? DifficultyLevel.INTERMEDIATE] ?? 1;
  const candidateLevel = DIFFICULTY_ORDER[candidate.metadata?.difficultyLevel ?? DifficultyLevel.INTERMEDIATE] ?? 1;

  const diff = candidateLevel - viewedLevel;

  // Next step (one level up) is ideal
  if (diff === 1) return 1.0;
  // Same level is good
  if (diff === 0) return 0.6;
  // Two levels up is okay
  if (diff === 2) return 0.3;
  // Going backwards is less useful
  if (diff === -1) return 0.2;
  return 0.1;
}

function calculateRecommendationScore(viewed: ContentItem, candidate: ContentItem): number {
  const topic = topicSimilarity(viewed, candidate);
  const complementary = complementarySkillsScore(viewed, candidate);
  const sequential = sequentialLearningScore(viewed, candidate);

  return (
    topic * WEIGHTS.topicSimilarity +
    complementary * WEIGHTS.complementarySkills +
    sequential * WEIGHTS.sequentialLearning
  );
}

// --- RecommendationEngine class ---

export class RecommendationEngine {
  /**
   * Get recommendations for a viewed item, excluding previously viewed content.
   * Returns up to 5 items sorted by recommendation score.
   */
  getRecommendations(
    viewedItem: ContentItem,
    history: ContentItem[],
    allItems: ContentItem[] = []
  ): ContentItem[] {
    const viewedIds = new Set([
      viewedItem.id,
      ...history.map((h) => h.id),
    ]);

    const candidates = allItems.filter((item) => !viewedIds.has(item.id));

    const scored = candidates.map((candidate) => ({
      item: candidate,
      score: calculateRecommendationScore(viewedItem, candidate),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, MAX_RECOMMENDATIONS).map((s) => s.item);
  }

  /**
   * Find content related to a given item from a pool of items.
   * Uses topic similarity as the primary signal.
   */
  findRelatedContent(item: ContentItem, allItems: ContentItem[]): ContentItem[] {
    const candidates = allItems.filter((c) => c.id !== item.id);

    const scored = candidates.map((candidate) => ({
      item: candidate,
      score: topicSimilarity(item, candidate),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, MAX_RECOMMENDATIONS).map((s) => s.item);
  }
}

export {
  WEIGHTS,
  MAX_RECOMMENDATIONS,
  setOverlap,
  topicSimilarity,
  complementarySkillsScore,
  sequentialLearningScore,
  calculateRecommendationScore,
};
