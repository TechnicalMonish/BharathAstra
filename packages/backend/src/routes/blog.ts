import { Router, type Request, type Response } from "express";
import { SearchEngine } from "../services/blog-aggregator/searchEngine";
import { CacheManager, generateCacheKey } from "../services/blog-aggregator/cacheManager";
import { ResultCardBuilder } from "../services/blog-aggregator/resultCardBuilder";
import { ContentFreshnessMonitor } from "../services/blog-aggregator/contentFreshnessMonitor";
import { TrendAnalyzer } from "../services/blog-aggregator/trendAnalyzer";
import { RecommendationEngine } from "../services/blog-aggregator/recommendationEngine";
import { ConflictDetector } from "../services/blog-aggregator/conflictDetector";
import { ConflictSeverity, type SearchQuery, type RankedResult, type ResultCard } from "@aws-intel/shared";

const router = Router();

// Service instances
const searchEngine = new SearchEngine();
const cacheManager = new CacheManager();
const cardBuilder = new ResultCardBuilder();
const freshnessMonitor = new ContentFreshnessMonitor();
const trendAnalyzer = new TrendAnalyzer();
const recommendationEngine = new RecommendationEngine();
const conflictDetector = new ConflictDetector();

// Store last search results for conflict/recommendation lookups
let lastSearchResults: RankedResult[] = [];

router.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Blog Aggregator API" });
});

/**
 * POST /api/blog/search
 * Submit search query with optional filters, returns ranked ResultCards.
 */
router.post("/search", async (req: Request, res: Response) => {
  try {
    const { text, filters, limit } = req.body;

    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Search text is required" });
      return;
    }

    const query: SearchQuery = { text, filters, limit };
    const cacheKey = generateCacheKey(text, filters);

    // Check cache
    const cached = await cacheManager.get(cacheKey);
    if (cached && !cached.stale) {
      res.json({ results: cached.data, cached: true });
      return;
    }

    // If stale, serve stale and refresh in background
    if (cached?.stale) {
      cacheManager.refreshInBackground(cacheKey, async () => {
        const fresh = await searchEngine.search(query);
        return buildCards(fresh);
      });
      res.json({ results: cached.data, cached: true, stale: true });
      return;
    }

    // Fresh search
    const ranked = await searchEngine.search(query);
    lastSearchResults = ranked;

    // Update trend data
    trendAnalyzer.updateTrendData(ranked.map((r) => r.item));

    // Build result cards with freshness warnings
    const cards = buildCards(ranked);

    // Cache results
    await cacheManager.set(cacheKey, cards);

    // Suggest alternatives if no results
    if (cards.length === 0) {
      const alternatives = searchEngine.suggestAlternatives(text);
      res.json({ results: [], alternatives, message: "No results found. Try these alternatives." });
      return;
    }

    res.json({ results: cards, total: cards.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    res.status(500).json({ error: message, partial: true });
  }
});

/**
 * GET /api/blog/trending
 * Get trending topics.
 */
router.get("/trending", (_req: Request, res: Response) => {
  try {
    const limit = 10;
    const topics = trendAnalyzer.getTrendingTopics(limit);
    res.json({ topics });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get trending topics";
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/blog/recommendations/:itemId
 * Get related content recommendations for a given item.
 */
router.get("/recommendations/:itemId", (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const allItems = lastSearchResults.map((r) => r.item);
    const viewedItem = allItems.find((item) => item.id === itemId);

    if (!viewedItem) {
      res.status(404).json({ error: "Item not found in recent results" });
      return;
    }

    const recommendations = recommendationEngine.getRecommendations(viewedItem, [], allItems);
    res.json({ recommendations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get recommendations";
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/blog/conflicts
 * Get detected conflicts for current results.
 */
router.get("/conflicts", (_req: Request, res: Response) => {
  try {
    const conflicts = conflictDetector.detectConflicts(lastSearchResults);
    res.json({ conflicts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to detect conflicts";
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/blog/clear-cache
 * Clear the in-memory cache to force fresh results.
 */
router.post("/clear-cache", (_req: Request, res: Response) => {
  cacheManager.clearMemoryCache();
  res.json({ message: "Cache cleared" });
});

// --- Helpers ---

function buildCards(ranked: RankedResult[]): ResultCard[] {
  return ranked.map((result) => {
    const freshnessReport = freshnessMonitor.checkFreshness(result.item);
    const extras = freshnessReport.hasDeprecatedReferences
      ? { conflicts: undefined, trendInfo: undefined }
      : undefined;

    const card = cardBuilder.buildCard(result, extras);

    // Attach freshness warnings as additional conflicts if present
    if (freshnessReport.hasDeprecatedReferences) {
      const freshnessConflicts = freshnessReport.warnings.map((w) => ({
        message: `${w.message}. Consider using ${w.alternative ?? "a newer service"}.`,
        conflictingApproaches: [w.service, w.alternative ?? "newer alternative"],
        severity: ConflictSeverity.MEDIUM,
      }));
      card.conflicts = [...(card.conflicts ?? []), ...freshnessConflicts];
    }

    return card;
  });
}

export default router;
