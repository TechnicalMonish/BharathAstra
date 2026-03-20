import {
  type SearchQuery,
  type ExpandedQuery,
  type RankedResult,
  type ContentItem,
  type SearchResult,
} from "@aws-intel/shared";
import { ContentFetcher } from "./contentFetcher";
import { Normalizer } from "./normalizer";
import { RankingSystem } from "./rankingSystem";
import { FilterEngine } from "./filterEngine";

// --- Constants ---

const AWS_SERVICE_NAMES = [
  "lambda", "s3", "ec2", "dynamodb", "rds", "aurora", "ecs", "eks",
  "fargate", "api gateway", "cloudfront", "route53", "iam", "kms",
  "sqs", "sns", "step functions", "cloudformation", "cdk", "cloudwatch",
  "kinesis", "redshift", "elasticache", "elastic beanstalk", "sagemaker",
  "bedrock", "cognito", "appsync", "eventbridge", "secrets manager",
  "vpc", "alb", "nlb", "efs", "ebs", "glue", "athena", "quicksight",
  "codepipeline", "codebuild", "codedeploy", "amplify", "lightsail",
];

const SYNONYM_MAP: Record<string, string[]> = {
  serverless: ["lambda", "fargate", "api gateway", "step functions"],
  containers: ["ecs", "eks", "fargate", "docker", "kubernetes"],
  database: ["dynamodb", "rds", "aurora", "elasticache", "redshift"],
  storage: ["s3", "efs", "ebs"],
  compute: ["ec2", "lambda", "ecs", "fargate"],
  messaging: ["sqs", "sns", "eventbridge", "kinesis"],
  security: ["iam", "kms", "cognito", "secrets manager"],
  monitoring: ["cloudwatch", "x-ray"],
  cicd: ["codepipeline", "codebuild", "codedeploy"],
  iac: ["cloudformation", "cdk", "terraform", "sam"],
  ml: ["sagemaker", "bedrock"],
  networking: ["vpc", "alb", "nlb", "cloudfront", "route53"],
  cache: ["elasticache", "cloudfront", "dax"],
  api: ["api gateway", "appsync", "rest", "graphql"],
  cost: ["pricing", "billing", "free tier", "cost optimization"],
};

const CONCEPT_KEYWORDS = [
  "best practice", "tutorial", "migration", "optimization", "performance",
  "security", "scaling", "deployment", "architecture", "microservices",
  "monitoring", "logging", "testing", "debugging", "cost",
];

// --- Helpers ---

function extractTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function extractAwsServices(terms: string[]): string[] {
  const found: string[] = [];
  const joined = terms.join(" ");
  for (const service of AWS_SERVICE_NAMES) {
    if (joined.includes(service)) {
      found.push(service);
    }
  }
  // Also check individual terms
  for (const term of terms) {
    if (AWS_SERVICE_NAMES.includes(term) && !found.includes(term)) {
      found.push(term);
    }
  }
  return [...new Set(found)];
}

function extractConcepts(terms: string[]): string[] {
  const joined = terms.join(" ");
  return CONCEPT_KEYWORDS.filter((c) => joined.includes(c));
}

function findSynonyms(terms: string[]): string[] {
  const synonyms: string[] = [];
  for (const term of terms) {
    if (SYNONYM_MAP[term]) {
      synonyms.push(...SYNONYM_MAP[term]);
    }
    // Reverse lookup
    for (const [key, values] of Object.entries(SYNONYM_MAP)) {
      if (values.includes(term) && !synonyms.includes(key)) {
        synonyms.push(key);
      }
    }
  }
  return [...new Set(synonyms)];
}

// --- SearchEngine class ---

export class SearchEngine {
  private fetcher: ContentFetcher;
  private normalizer: Normalizer;
  private ranker: RankingSystem;
  private filter: FilterEngine;

  constructor(
    fetcher?: ContentFetcher,
    normalizer?: Normalizer,
    ranker?: RankingSystem,
    filter?: FilterEngine
  ) {
    this.fetcher = fetcher ?? new ContentFetcher();
    this.normalizer = normalizer ?? new Normalizer();
    this.ranker = ranker ?? new RankingSystem();
    this.filter = filter ?? new FilterEngine();
  }

  /**
   * Main search: expand query → fetch → normalize → rank → filter.
   * Applies source diversity to ensure results from all available sources.
   */
  async search(query: SearchQuery): Promise<RankedResult[]> {
    const expanded = this.expandQuery(query.text);

    // Fetch from all sources
    const sourceResults = await this.fetcher.fetchFromAllSources(expanded);

    // Normalize all items
    const allItems: ContentItem[] = [];
    for (const sr of sourceResults) {
      const normalized = this.normalizer.normalize(sr);
      allItems.push(...normalized);
    }

    // Rank
    const ranked = this.ranker.rankResults(allItems);

    // Apply filters
    const filtered = query.filters
      ? this.filter.applyFilters(ranked, query.filters)
      : ranked;

    // Apply source diversity then limit
    const limit = query.limit ?? 150;
    const diverse = this.applySourceDiversity(filtered, limit);
    return diverse;
  }

  /**
   * Ensure results include items from all available sources.
   * Guarantees at least `minPerSource` items from each source that has results,
   * then fills remaining slots by overall rank.
   */
  private applySourceDiversity(
    ranked: RankedResult[],
    limit: number,
    minPerSource: number = 5
  ): RankedResult[] {
    // Group by source
    const bySource = new Map<string, RankedResult[]>();
    for (const r of ranked) {
      const src = r.item.source;
      if (!bySource.has(src)) bySource.set(src, []);
      bySource.get(src)!.push(r);
    }

    const selected = new Set<number>(); // indices into ranked[]
    const result: RankedResult[] = [];

    // Phase 1: guarantee min items from each source (already sorted by rank within source)
    for (const [, items] of bySource) {
      const take = Math.min(minPerSource, items.length);
      for (let i = 0; i < take; i++) {
        const idx = ranked.indexOf(items[i]);
        if (!selected.has(idx)) {
          selected.add(idx);
          result.push(items[i]);
        }
      }
    }

    // Phase 2: fill remaining slots by overall rank
    for (const r of ranked) {
      if (result.length >= limit) break;
      const idx = ranked.indexOf(r);
      if (!selected.has(idx)) {
        selected.add(idx);
        result.push(r);
      }
    }

    // Re-sort by overall score descending so the final output is ranked
    result.sort((a, b) => {
      const diff = b.score.overall - a.score.overall;
      if (Math.abs(diff) > 1e-9) return diff;
      return b.item.publishDate.getTime() - a.item.publishDate.getTime();
    });

    // Re-assign rank numbers
    return result.map((r, i) => ({ ...r, rank: i + 1 }));
  }

  /**
   * Expand a query string with synonyms, AWS services, and concepts.
   */
  expandQuery(query: string): ExpandedQuery {
    const terms = extractTerms(query);
    const awsServices = extractAwsServices(terms);
    const concepts = extractConcepts(terms);
    const synonyms = findSynonyms(terms);

    return {
      originalTerms: terms,
      synonyms,
      awsServices,
      concepts,
    };
  }

  /**
   * Suggest alternative search terms when no results found.
   */
  suggestAlternatives(query: string): string[] {
    const terms = extractTerms(query);
    const suggestions: string[] = [];

    // Suggest based on synonyms
    for (const term of terms) {
      if (SYNONYM_MAP[term]) {
        suggestions.push(...SYNONYM_MAP[term].slice(0, 2));
      }
    }

    // Suggest broader terms
    const awsServices = extractAwsServices(terms);
    if (awsServices.length > 0) {
      suggestions.push(`${awsServices[0]} tutorial`);
      suggestions.push(`${awsServices[0]} best practices`);
    }

    // Suggest related categories
    for (const term of terms) {
      for (const [category, related] of Object.entries(SYNONYM_MAP)) {
        if (related.includes(term)) {
          suggestions.push(`${category} on AWS`);
        }
      }
    }

    return [...new Set(suggestions)].slice(0, 5);
  }
}

export {
  extractTerms,
  extractAwsServices,
  extractConcepts,
  findSynonyms,
  AWS_SERVICE_NAMES,
  SYNONYM_MAP,
  CONCEPT_KEYWORDS,
};
