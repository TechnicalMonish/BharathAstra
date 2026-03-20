import {
  RecencyRange,
  DifficultyLevel,
  type FilterCriteria,
  type RankedResult,
} from "@aws-intel/shared";

// --- Constants ---

const RECENCY_DAYS: Record<string, number> = {
  [RecencyRange.LAST_WEEK]: 7,
  [RecencyRange.LAST_MONTH]: 30,
  [RecencyRange.LAST_3_MONTHS]: 90,
  [RecencyRange.LAST_6_MONTHS]: 180,
  [RecencyRange.LAST_YEAR]: 365,
};

// --- Helpers ---

function parseImplementationTimeMinutes(time?: string): number | null {
  if (!time) return null;
  const lower = time.toLowerCase();
  const numMatch = lower.match(/(\d+)/);
  if (!numMatch) return null;
  const value = parseInt(numMatch[1], 10);
  if (lower.includes("hour") || lower.includes("hr")) return value * 60;
  if (lower.includes("day")) return value * 60 * 24;
  return value; // assume minutes
}

// --- FilterEngine class ---

export class FilterEngine {
  /**
   * Apply all specified filters using AND logic.
   * Undefined/empty filters are skipped.
   * Original ranking order is preserved.
   */
  applyFilters(results: RankedResult[], criteria: FilterCriteria): RankedResult[] {
    if (!criteria) return results;

    return results.filter((result) => {
      const item = result.item;
      const meta = item.metadata;

      if (criteria.freeTierOnly && !meta?.freeTierCompatible) {
        return false;
      }

      if (criteria.recencyRange) {
        const maxDays = RECENCY_DAYS[criteria.recencyRange];
        if (maxDays) {
          const ageMs = Date.now() - item.publishDate.getTime();
          const ageDays = ageMs / (1000 * 60 * 60 * 24);
          if (ageDays > maxDays) return false;
        }
      }

      if (criteria.difficultyLevels && criteria.difficultyLevels.length > 0) {
        if (!meta?.difficultyLevel || !criteria.difficultyLevels.includes(meta.difficultyLevel)) {
          return false;
        }
      }

      if (criteria.techStacks && criteria.techStacks.length > 0) {
        const itemStacks = (meta?.techStack || []).map((s) => s.toLowerCase());
        const hasMatch = criteria.techStacks.some((ts) =>
          itemStacks.includes(ts.toLowerCase())
        );
        if (!hasMatch) return false;
      }

      if (criteria.implementationTimeRange) {
        const { min, max } = criteria.implementationTimeRange;
        const minutes = parseImplementationTimeMinutes(meta?.implementationTime);
        if (minutes !== null) {
          if (min !== undefined && minutes < min) return false;
          if (max !== undefined && minutes > max) return false;
        }
        // If no implementation time data, don't exclude — most blog posts won't have this
      }

      if (criteria.sources && criteria.sources.length > 0) {
        if (!criteria.sources.includes(item.source)) {
          return false;
        }
      }

      if (criteria.focusAreas && criteria.focusAreas.length > 0) {
        const services = (meta?.awsServices || []).map((s) => s.toLowerCase());
        const content = (item.content || "").toLowerCase();
        const hasMatch = criteria.focusAreas.some(
          (area) =>
            services.includes(area.toLowerCase()) ||
            content.includes(area.toLowerCase())
        );
        if (!hasMatch) return false;
      }

      if (criteria.minQualityScore !== undefined) {
        if (result.score.overall < criteria.minQualityScore) {
          return false;
        }
      }

      return true;
    });
  }
}

export { RECENCY_DAYS, parseImplementationTimeMinutes };
