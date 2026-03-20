import {
  AnswerType,
  QueryType,
  RelationType,
  type Answer,
  type HighlightedSection,
  type ProcessedQuery,
  type RelatedSection,
  type Prerequisite,
  type CodeExample,
  type SectionReference,
  type Parameter,
  type BuiltContext,
  type GeneratedAnswer,
  type Citation,
  type RAGRankedResult,
  type RAGGeneratorConfig,
} from "@aws-intel/shared";

// --- Constants ---

const MAX_RELATED_SECTIONS = 3;
const MAX_DIRECT_ANSWER_SENTENCES = 3;

// --- Bedrock direct answer generation (with mock fallback) ---

async function generateDirectAnswerWithBedrock(
  sections: HighlightedSection[],
  query: ProcessedQuery
): Promise<string | undefined> {
  try {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import(
      "@aws-sdk/client-bedrock-runtime"
    );
    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
      requestHandler: { requestTimeout: 5000 } as never,
    });

    const sectionTexts = sections
      .slice(0, 3)
      .map((s) => s.section.content)
      .join("\n\n");

    const prompt = `Based on the following documentation sections, provide a concise 2-3 sentence answer to the question: "${query.originalQuestion}"\n\nSections:\n${sectionTexts.slice(0, 4000)}`;

    // Race against a 5-second timeout
    const bedrockPromise = client.send(
      new InvokeModelCommand({
        modelId: "anthropic.claude-3-haiku-20240307-v1:0",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 256,
          messages: [{ role: "user", content: prompt }],
        }),
      })
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Bedrock timeout")), 5000)
    );

    const response = await Promise.race([bedrockPromise, timeoutPromise]);

    const result = JSON.parse(new TextDecoder().decode(response.body));
    return result.content?.[0]?.text;
  } catch {
    // Fallback to mock generation (timeout or Bedrock unavailable)
    return undefined;
  }
}

// --- Mock direct answer generation ---

function generateMockDirectAnswer(
  sections: HighlightedSection[],
  query: ProcessedQuery
): string | undefined {
  if (sections.length === 0) return undefined;

  const topSection = sections[0];
  const highlights = topSection.highlights;

  // Use the top highlights to build a summary
  if (highlights.length > 0) {
    const topSentences = highlights
      .slice(0, MAX_DIRECT_ANSWER_SENTENCES)
      .map((h) => h.text.trim());
    return topSentences.join(" ");
  }

  // Fall back to first sentences of the top section content
  const sentences = topSection.section.content
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) return undefined;

  return (
    sentences.slice(0, MAX_DIRECT_ANSWER_SENTENCES).join(". ") + "."
  );
}

// --- Format HOW_TO answers as numbered step lists ---

function formatHowToAnswer(
  sections: HighlightedSection[],
  query: ProcessedQuery
): string | undefined {
  if (sections.length === 0) return undefined;

  // Collect relevant highlight texts across sections
  const steps: string[] = [];
  for (const hs of sections) {
    for (const h of hs.highlights) {
      const text = h.text.trim();
      if (text.length > 0 && steps.length < 5) {
        steps.push(text);
      }
    }
  }

  if (steps.length === 0) return undefined;

  return steps.map((step, i) => `${i + 1}. ${step}`).join("\n");
}

// --- Build source reference string ---

function buildSourceReference(section: HighlightedSection): SectionReference {
  return {
    sectionNumber: section.section.sectionNumber,
    title: section.section.sectionTitle,
  };
}

// --- Determine answer type ---

function determineAnswerType(
  query: ProcessedQuery,
  sections: HighlightedSection[],
  directAnswer: string | undefined
): AnswerType {
  if (sections.length === 0) return AnswerType.REFERENCE;

  if (query.queryType === QueryType.HOW_TO) return AnswerType.MULTI_STEP;

  if (!directAnswer) return AnswerType.REFERENCE;

  if (query.queryType === QueryType.COMPARISON) return AnswerType.AMBIGUOUS;

  return AnswerType.DIRECT;
}

// --- Extract code examples from sections ---

function extractCodeExamples(
  sections: HighlightedSection[]
): CodeExample[] {
  const examples: CodeExample[] = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;

  for (const hs of sections) {
    let match: RegExpExecArray | null;
    while ((match = codeBlockRegex.exec(hs.section.content)) !== null) {
      const language = match[1] || "text";
      const code = match[2].trim();
      const params = identifyConfigurableParams(code);

      examples.push({
        language,
        code,
        description: `Code example from ${hs.section.sectionTitle}`,
        sourceSection: {
          sectionNumber: hs.section.sectionNumber,
          title: hs.section.sectionTitle,
        },
        configurableParams: params,
      });
    }
  }

  return examples;
}

// --- Identify configurable parameters in code ---

function identifyConfigurableParams(code: string): Parameter[] {
  const params: Parameter[] = [];
  const seen = new Set<string>();

  // Match placeholders like <BUCKET_NAME>, ${VAR_NAME}, YOUR_VALUE
  const patterns = [
    /<([A-Z_]+)>/g,
    /\$\{([A-Z_]+)\}/g,
    /\b(YOUR_[A-Z_]+)\b/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(code)) !== null) {
      const name = match[1];
      if (!seen.has(name)) {
        seen.add(name);
        params.push({
          name,
          description: `Configurable parameter: ${name}`,
        });
      }
    }
  }

  return params;
}

// --- Suggest related sections ---

function suggestRelatedSections(
  sections: HighlightedSection[],
  query: ProcessedQuery
): RelatedSection[] {
  const related: RelatedSection[] = [];
  const usedIds = new Set<string>();

  // Use parent sections as prerequisites
  for (const hs of sections) {
    for (const parent of hs.section.parentSections) {
      if (related.length >= MAX_RELATED_SECTIONS) break;
      const key = `parent-${parent.sectionNumber}`;
      if (!usedIds.has(key)) {
        usedIds.add(key);
        related.push({
          sectionId: `sec-${parent.sectionNumber}`,
          title: parent.title,
          description: `Prerequisite: ${parent.title}`,
          relationshipType: RelationType.PREREQUISITE,
        });
      }
    }
  }

  // Add next-step suggestions from lower-ranked sections
  for (let i = 1; i < sections.length && related.length < MAX_RELATED_SECTIONS; i++) {
    const sec = sections[i].section;
    const key = sec.sectionId;
    if (!usedIds.has(key)) {
      usedIds.add(key);
      related.push({
        sectionId: sec.sectionId,
        title: sec.sectionTitle,
        description: `Related: ${sec.sectionTitle}`,
        relationshipType:
          i === 1 ? RelationType.NEXT_STEP : RelationType.RELATED_CONCEPT,
      });
    }
  }

  return related.slice(0, MAX_RELATED_SECTIONS);
}

// --- Extract prerequisites from sections ---

function extractPrerequisites(
  sections: HighlightedSection[],
  query: ProcessedQuery
): Prerequisite[] {
  const prerequisites: Prerequisite[] = [];
  const seen = new Set<string>();

  // Derive prerequisites from AWS services mentioned in the query
  for (const service of query.awsServices) {
    if (!seen.has(service)) {
      seen.add(service);
      prerequisites.push({
        concept: service,
        description: `Basic understanding of ${service} is recommended.`,
      });
    }
  }

  // Derive from parent sections
  for (const hs of sections) {
    for (const parent of hs.section.parentSections) {
      if (!seen.has(parent.title) && prerequisites.length < 5) {
        seen.add(parent.title);
        prerequisites.push({
          concept: parent.title,
          description: `Review ${parent.title} for foundational context.`,
          learnMoreSection: {
            sectionNumber: parent.sectionNumber,
            title: parent.title,
          },
        });
      }
    }
  }

  return prerequisites;
}

// --- AnswerBuilder class ---

export class AnswerBuilder {
  /**
   * Build an Answer from highlighted sections and a processed query.
   * Attempts to generate a direct answer via AWS Bedrock, falling back
   * to a mock summary built from highlights.
   */
  async buildAnswer(
    sections: HighlightedSection[],
    query: ProcessedQuery
  ): Promise<Answer> {
    // Attempt direct answer generation
    let directAnswer: string | undefined;

    if (query.queryType === QueryType.HOW_TO) {
      directAnswer = formatHowToAnswer(sections, query);
    }

    if (!directAnswer) {
      // Use mock generation first (fast), try Bedrock only if mock fails
      directAnswer = generateMockDirectAnswer(sections, query);
      if (!directAnswer) {
        directAnswer = await generateDirectAnswerWithBedrock(sections, query);
      }
    }

    // Append source reference to direct answer
    if (directAnswer && sections.length > 0) {
      const sourceRef = buildSourceReference(sections[0]);
      directAnswer += ` (Source: ${sourceRef.title}, Section ${sourceRef.sectionNumber})`;
    }

    const answerType = determineAnswerType(query, sections, directAnswer);
    const codeExamples = extractCodeExamples(sections);
    const relatedSections = suggestRelatedSections(sections, query);
    const prerequisites = extractPrerequisites(sections, query);

    return {
      directAnswer,
      answerType,
      sections,
      codeExamples,
      relatedSections,
      prerequisites,
    };
  }
}

// --- RAG Answer Generator ---

const DEFAULT_RAG_CONFIG: RAGGeneratorConfig = {
  modelId: "anthropic.claude-3-haiku-20240307-v1:0",
  maxTokens: 1024,
  temperature: 0.3,
  systemPrompt: `You are a helpful AWS documentation assistant. Answer questions based on the provided context from AWS documentation. 
Be concise and accurate. If the context doesn't contain enough information to answer the question, say so.
Always cite your sources by referencing the section titles provided in the context.`,
};

/**
 * Build a RAG prompt with context and question.
 */
function buildRAGPrompt(context: string, question: string): string {
  return `Context from AWS Documentation:
${context}

Question: ${question}

Please provide a clear, accurate answer based on the context above. Include relevant code examples if available. Cite the source sections when referencing specific information.`;
}

/**
 * Extract citations from the answer and context chunks.
 */
function extractCitations(
  answer: string,
  chunks: RAGRankedResult[]
): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    // Check if the answer references content from this chunk
    const chunkWords = chunk.content.toLowerCase().split(/\s+/).slice(0, 20);
    const answerLower = answer.toLowerCase();

    let matchCount = 0;
    for (const word of chunkWords) {
      if (word.length > 4 && answerLower.includes(word)) {
        matchCount++;
      }
    }

    // If significant overlap, add as citation
    if (matchCount >= 3 && !seen.has(chunk.chunkId)) {
      seen.add(chunk.chunkId);

      // Extract a relevant excerpt (first 100 chars of matching content)
      const excerpt = chunk.content.slice(0, 150).trim() + "...";

      citations.push({
        chunkId: chunk.chunkId,
        docTitle: chunk.metadata.sectionTitle,
        sectionTitle: chunk.metadata.sectionTitle,
        excerpt,
      });
    }
  }

  return citations.slice(0, 5); // Limit to 5 citations
}

/**
 * Compute confidence score based on retrieval quality.
 */
function computeConfidence(chunks: RAGRankedResult[]): number {
  if (chunks.length === 0) return 0;

  // Average of top chunk scores
  const topScores = chunks.slice(0, 3).map((c) => c.combinedScore);
  const avgScore = topScores.reduce((a, b) => a + b, 0) / topScores.length;

  // Boost if multiple high-quality chunks
  const highQualityCount = chunks.filter((c) => c.combinedScore > 0.7).length;
  const boost = Math.min(0.1, highQualityCount * 0.02);

  return Math.min(1, Math.round((avgScore + boost) * 100) / 100);
}

/**
 * Generate follow-up questions based on context.
 */
function generateFollowUpQuestions(
  context: BuiltContext,
  query: ProcessedQuery
): string[] {
  const questions: string[] = [];
  const services = query.awsServices;

  // Generate questions based on AWS services mentioned
  if (services.length > 0) {
    questions.push(`How do I configure ${services[0]} for production use?`);
    questions.push(`What are the best practices for ${services[0]}?`);
  }

  // Generate questions based on section titles
  const sectionTitles = context.includedChunks
    .map((c) => c.metadata.sectionTitle)
    .filter((t, i, arr) => arr.indexOf(t) === i);

  for (const title of sectionTitles.slice(0, 2)) {
    if (!title.toLowerCase().includes("overview")) {
      questions.push(`Can you explain more about ${title}?`);
    }
  }

  return questions.slice(0, 3);
}

/**
 * RAG Answer Generator class for generating answers from RAG context.
 */
export class RAGAnswerGenerator {
  private config: RAGGeneratorConfig;

  constructor(config?: Partial<RAGGeneratorConfig>) {
    this.config = { ...DEFAULT_RAG_CONFIG, ...config };
  }

  /**
   * Generate an answer using RAG context.
   */
  async generateAnswer(
    context: BuiltContext,
    query: ProcessedQuery
  ): Promise<GeneratedAnswer> {
    // Handle no relevant chunks case
    if (context.includedChunks.length === 0) {
      return {
        answer: "I couldn't find relevant information in the selected documentation to answer your question. Please try rephrasing your question or selecting different documents.",
        confidence: 0,
        citations: [],
        followUpQuestions: [
          "Can you rephrase your question?",
          "Would you like to search in different documents?",
        ],
      };
    }

    // Build the prompt
    const prompt = buildRAGPrompt(context.contextString, query.originalQuestion);

    // Generate answer with Bedrock
    let answer: string;
    try {
      answer = await this.callBedrock(prompt);
    } catch (error) {
      // Fallback to mock answer
      answer = this.generateMockAnswer(context, query);
    }

    // Extract citations
    const citations = extractCitations(answer, context.includedChunks);

    // Compute confidence
    const confidence = computeConfidence(context.includedChunks);

    // Generate follow-up questions
    const followUpQuestions = generateFollowUpQuestions(context, query);

    return {
      answer,
      confidence,
      citations,
      followUpQuestions,
    };
  }

  /**
   * Build RAG prompt.
   */
  buildPrompt(context: string, question: string): string {
    return buildRAGPrompt(context, question);
  }

  /**
   * Call Bedrock LLM for answer generation.
   */
  private async callBedrock(prompt: string): Promise<string> {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import(
      "@aws-sdk/client-bedrock-runtime"
    );

    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

    const body = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: this.config.systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });

    const bedrockPromise = client.send(
      new InvokeModelCommand({
        modelId: this.config.modelId,
        contentType: "application/json",
        accept: "application/json",
        body,
      })
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Bedrock timeout")), 10000)
    );

    const response = await Promise.race([bedrockPromise, timeoutPromise]);
    const result = JSON.parse(new TextDecoder().decode(response.body));

    return result.content?.[0]?.text || "Unable to generate answer.";
  }

  /**
   * Generate a mock answer when Bedrock is unavailable.
   */
  private generateMockAnswer(context: BuiltContext, query: ProcessedQuery): string {
    const topChunk = context.includedChunks[0];
    if (!topChunk) {
      return "No relevant information found.";
    }

    // Extract first few sentences from top chunk
    const sentences = topChunk.content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20)
      .slice(0, 3);

    if (sentences.length === 0) {
      return topChunk.content.slice(0, 500);
    }

    return sentences.join(". ") + ".";
  }

  /**
   * Get current configuration.
   */
  getConfig(): RAGGeneratorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<RAGGeneratorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export helpers for testing
export {
  generateMockDirectAnswer,
  formatHowToAnswer,
  buildSourceReference,
  determineAnswerType,
  extractCodeExamples,
  identifyConfigurableParams,
  suggestRelatedSections,
  extractPrerequisites,
  generateDirectAnswerWithBedrock,
  buildRAGPrompt,
  extractCitations,
  computeConfidence,
  generateFollowUpQuestions,
  MAX_RELATED_SECTIONS,
  MAX_DIRECT_ANSWER_SENTENCES,
  DEFAULT_RAG_CONFIG,
};
