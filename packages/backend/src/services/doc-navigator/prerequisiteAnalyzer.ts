import {
  ExperienceLevel,
  type ExtractedSection,
  type Prerequisite,
  type SectionReference,
} from "@aws-intel/shared";

// --- Local types (from design doc, not yet in shared) ---

export interface UserKnowledge {
  userId: string;
  knownConcepts: string[];
  knownServices: string[];
  experienceLevel: ExperienceLevel;
}

export interface KnowledgeGap {
  concept: string;
  description: string;
  learnMoreSection: SectionReference;
  estimatedReadTime: number;
}

// --- Constants ---

/** Common AWS foundational concepts ordered by dependency (foundational first). */
const FOUNDATIONAL_CONCEPTS: readonly string[] = [
  "iam",
  "vpc",
  "security group",
  "subnet",
  "region",
  "availability zone",
  "s3",
  "ec2",
  "cloudwatch",
  "cloudformation",
];

/** Rough words-per-minute for read time estimation. */
const WORDS_PER_MINUTE = 200;

// --- Helpers ---

/**
 * Extract distinct concepts mentioned in a section's content.
 * Looks for AWS service names and common cloud concepts.
 */
function extractConcepts(content: string): string[] {
  const lower = content.toLowerCase();
  const concepts = new Set<string>();

  // AWS service patterns
  const servicePatterns = [
    "lambda", "s3", "ec2", "iam", "dynamodb", "rds", "ecs", "eks",
    "fargate", "cloudfront", "route53", "api gateway", "sqs", "sns",
    "kinesis", "cloudwatch", "cloudformation", "cloudtrail", "vpc",
    "elastic beanstalk", "step functions", "eventbridge", "cognito",
    "secrets manager", "kms", "waf", "shield", "aurora",
  ];

  // General cloud concepts
  const conceptPatterns = [
    "security group", "subnet", "availability zone", "region",
    "load balancer", "auto scaling", "container", "serverless",
    "microservice", "encryption", "authentication", "authorization",
    "role", "policy", "permission", "bucket", "instance", "cluster",
    "deployment", "pipeline", "monitoring", "logging",
  ];

  for (const pattern of [...servicePatterns, ...conceptPatterns]) {
    if (lower.includes(pattern)) {
      concepts.add(pattern);
    }
  }

  return Array.from(concepts);
}

/**
 * Estimate reading time in minutes based on word count.
 */
function estimateReadTime(content: string): number {
  const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

/**
 * Sort concepts so foundational ones come first.
 * Concepts in FOUNDATIONAL_CONCEPTS are ordered by their index;
 * remaining concepts are appended alphabetically.
 */
function orderByDependency(concepts: string[]): string[] {
  const foundational: string[] = [];
  const other: string[] = [];

  for (const concept of concepts) {
    const idx = FOUNDATIONAL_CONCEPTS.indexOf(concept.toLowerCase());
    if (idx >= 0) {
      foundational.push(concept);
    } else {
      other.push(concept);
    }
  }

  foundational.sort(
    (a, b) =>
      FOUNDATIONAL_CONCEPTS.indexOf(a.toLowerCase()) -
      FOUNDATIONAL_CONCEPTS.indexOf(b.toLowerCase())
  );
  other.sort((a, b) => a.localeCompare(b));

  return [...foundational, ...other];
}

// --- PrerequisiteAnalyzer class ---

export class PrerequisiteAnalyzer {
  /**
   * Analyze sections to produce a list of prerequisites.
   * Extracts concepts from sections, filters out what the user already knows,
   * and orders by dependency (foundational first).
   */
  analyzePrerequisites(
    sections: ExtractedSection[],
    userKnowledge: UserKnowledge
  ): Prerequisite[] {
    if (sections.length === 0) return [];

    // Collect all concepts across sections
    const conceptSectionMap = new Map<string, SectionReference>();

    for (const section of sections) {
      const concepts = extractConcepts(section.content);
      for (const concept of concepts) {
        if (!conceptSectionMap.has(concept)) {
          conceptSectionMap.set(concept, {
            sectionNumber: section.sectionNumber,
            title: section.sectionTitle,
          });
        }
      }

      // Also include parent sections as prerequisite sources
      for (const parent of section.parentSections) {
        const parentKey = parent.title.toLowerCase();
        if (!conceptSectionMap.has(parentKey)) {
          conceptSectionMap.set(parentKey, parent);
        }
      }
    }

    // Filter out concepts the user already knows
    const knownLower = new Set([
      ...userKnowledge.knownConcepts.map((c) => c.toLowerCase()),
      ...userKnowledge.knownServices.map((s) => s.toLowerCase()),
    ]);

    const unknownConcepts = Array.from(conceptSectionMap.keys()).filter(
      (c) => !knownLower.has(c.toLowerCase())
    );

    // Order by dependency
    const ordered = orderByDependency(unknownConcepts);

    // Build prerequisites
    return ordered.map((concept) => {
      const ref = conceptSectionMap.get(concept);
      return {
        concept,
        description: `Understanding of ${concept} is recommended before proceeding.`,
        learnMoreSection: ref,
      };
    });
  }

  /**
   * Check which prerequisites represent knowledge gaps for the user.
   * Returns gaps with estimated read times and section references.
   */
  checkKnowledgeGaps(
    prerequisites: Prerequisite[],
    userKnowledge: UserKnowledge,
    sections: ExtractedSection[] = []
  ): KnowledgeGap[] {
    const knownLower = new Set([
      ...userKnowledge.knownConcepts.map((c) => c.toLowerCase()),
      ...userKnowledge.knownServices.map((s) => s.toLowerCase()),
    ]);

    // Build a map from concept to section content for read time estimation
    const contentMap = new Map<string, string>();
    for (const section of sections) {
      const concepts = extractConcepts(section.content);
      for (const concept of concepts) {
        if (!contentMap.has(concept)) {
          contentMap.set(concept, section.content);
        }
      }
    }

    const gaps: KnowledgeGap[] = [];

    for (const prereq of prerequisites) {
      if (knownLower.has(prereq.concept.toLowerCase())) continue;

      const sectionContent = contentMap.get(prereq.concept) || "";
      const readTime = sectionContent
        ? estimateReadTime(sectionContent)
        : estimateReadTimeByLevel(userKnowledge.experienceLevel);

      gaps.push({
        concept: prereq.concept,
        description: prereq.description,
        learnMoreSection: prereq.learnMoreSection || {
          sectionNumber: "",
          title: prereq.concept,
        },
        estimatedReadTime: readTime,
      });
    }

    return gaps;
  }
}

/**
 * Fallback read time estimate based on experience level.
 */
function estimateReadTimeByLevel(level: ExperienceLevel): number {
  switch (level) {
    case ExperienceLevel.BEGINNER:
      return 5;
    case ExperienceLevel.INTERMEDIATE:
      return 3;
    case ExperienceLevel.ADVANCED:
      return 1;
    default:
      return 3;
  }
}

// Export helpers for testing
export {
  extractConcepts,
  estimateReadTime,
  orderByDependency,
  estimateReadTimeByLevel,
  FOUNDATIONAL_CONCEPTS,
  WORDS_PER_MINUTE,
};
