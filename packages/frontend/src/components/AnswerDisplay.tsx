'use client';

import { useMemo } from 'react';
import { CodeBlock } from './CodeBlock';

// Types matching the backend Answer interface
export interface SectionReference {
  sectionNumber: string;
  title: string;
}

export interface Highlight {
  text: string;
  startIndex: number;
  endIndex: number;
  relevanceScore: number;
}

export interface ExtractedSection {
  docId: string;
  docTitle: string;
  sectionId: string;
  sectionNumber: string;
  sectionTitle: string;
  content: string;
  relevanceScore: number;
  parentSections: SectionReference[];
}

export interface HighlightedSection {
  section: ExtractedSection;
  highlights: Highlight[];
}

export interface CodeExample {
  language: string;
  code: string;
  description: string;
  sourceSection: SectionReference;
  configurableParams: Parameter[];
}

export interface Parameter {
  name: string;
  description: string;
  defaultValue?: string;
}

export interface RelatedSection {
  sectionId: string;
  title: string;
  description: string;
  relationshipType: 'prerequisite' | 'next_step' | 'related_concept';
}

export interface Prerequisite {
  concept: string;
  description: string;
  learnMoreSection?: SectionReference;
}

export type AnswerType = 'direct' | 'multi_step' | 'reference' | 'ambiguous';

export interface Answer {
  directAnswer?: string;
  answerType: AnswerType;
  sections: HighlightedSection[];
  codeExamples: CodeExample[];
  relatedSections: RelatedSection[];
  prerequisites: Prerequisite[];
  steps?: string[]; // For HOW_TO answers with numbered steps
}

interface AnswerDisplayProps {
  answer: Answer;
  question?: string;
  onRelatedSectionClick?: (sectionId: string) => void;
  className?: string;
}

export function AnswerDisplay({
  answer,
  question,
  onRelatedSectionClick,
  className = '',
}: AnswerDisplayProps) {
  const isHowToAnswer = answer.answerType === 'multi_step';

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Question Display */}
      {question && (
        <div className="flex items-start gap-3 p-4 bg-aws-orange/10 rounded-lg border border-aws-orange/20">
          <span className="text-2xl">💬</span>
          <div>
            <p className="text-sm text-gray-500 mb-1">Your Question</p>
            <p className="text-aws-dark font-medium">{question}</p>
          </div>
        </div>
      )}

      {/* Direct Answer Summary */}
      {answer.directAnswer && (
        <DirectAnswerCard
          answer={answer.directAnswer}
          isHowTo={isHowToAnswer}
          steps={answer.steps}
          sourceSection={answer.sections[0]?.section}
        />
      )}

      {/* Prerequisites (if any) */}
      {answer.prerequisites.length > 0 && (
        <PrerequisitesCard prerequisites={answer.prerequisites} />
      )}

      {/* Highlighted Extracted Sections */}
      {answer.sections.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-aws-dark flex items-center gap-2">
            <svg className="w-5 h-5 text-aws-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Relevant Documentation Sections
          </h3>
          {answer.sections.map((highlightedSection, index) => (
            <HighlightedSectionCard
              key={`${highlightedSection.section.sectionId}-${index}`}
              highlightedSection={highlightedSection}
              index={index + 1}
            />
          ))}
        </div>
      )}

      {/* Code Examples */}
      {answer.codeExamples.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-aws-dark flex items-center gap-2">
            <svg className="w-5 h-5 text-aws-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            Code Examples
          </h3>
          {answer.codeExamples.map((example, index) => (
            <CodeExampleCard key={index} example={example} />
          ))}
        </div>
      )}

      {/* Related Sections */}
      {answer.relatedSections.length > 0 && (
        <RelatedSectionsCard
          sections={answer.relatedSections}
          onSectionClick={onRelatedSectionClick}
        />
      )}
    </div>
  );
}


// Direct Answer Card Component
interface DirectAnswerCardProps {
  answer: string;
  isHowTo: boolean;
  steps?: string[];
  sourceSection?: ExtractedSection;
}

function DirectAnswerCard({ answer, isHowTo, steps, sourceSection }: DirectAnswerCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-aws-orange to-orange-500 px-4 py-3">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <span className="text-xl">📍</span>
          Direct Answer
        </h3>
      </div>
      <div className="p-4">
        {/* Summary text */}
        <p className="text-gray-700 leading-relaxed mb-4">{answer}</p>

        {/* Numbered steps for HOW_TO answers */}
        {isHowTo && steps && steps.length > 0 && (
          <div className="mt-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">
              Steps to Follow
            </h4>
            <ol className="space-y-2">
              {steps.map((step, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 bg-aws-orange text-white rounded-full flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </span>
                  <span className="text-gray-700 pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Source reference */}
        {sourceSection && (
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 text-sm text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span>Source:</span>
            <span className="text-aws-orange font-medium">
              {sourceSection.sectionNumber} - {sourceSection.sectionTitle}
            </span>
            <span className="text-gray-400">({sourceSection.docTitle})</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Prerequisites Card Component
interface PrerequisitesCardProps {
  prerequisites: Prerequisite[];
}

function PrerequisitesCard({ prerequisites }: PrerequisitesCardProps) {
  return (
    <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
      <h4 className="text-blue-800 font-semibold flex items-center gap-2 mb-3">
        <span className="text-lg">📚</span>
        Prerequisites
      </h4>
      <ul className="space-y-2">
        {prerequisites.map((prereq, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            <div>
              <span className="font-medium text-blue-900">{prereq.concept}</span>
              {prereq.description && (
                <span className="text-blue-700 text-sm"> - {prereq.description}</span>
              )}
              {prereq.learnMoreSection && (
                <span className="text-blue-500 text-sm ml-1">
                  (See: {prereq.learnMoreSection.sectionNumber})
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Highlighted Section Card Component
interface HighlightedSectionCardProps {
  highlightedSection: HighlightedSection;
  index: number;
}

function HighlightedSectionCard({ highlightedSection, index }: HighlightedSectionCardProps) {
  const { section, highlights } = highlightedSection;

  // Render content with highlights
  const renderedContent = useMemo(() => {
    if (highlights.length === 0) {
      return <p className="text-gray-700 leading-relaxed">{section.content}</p>;
    }

    // Sort highlights by startIndex
    const sortedHighlights = [...highlights].sort((a, b) => a.startIndex - b.startIndex);
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    sortedHighlights.forEach((highlight, idx) => {
      // Add text before highlight
      if (highlight.startIndex > lastIndex) {
        parts.push(
          <span key={`text-${idx}`}>
            {section.content.slice(lastIndex, highlight.startIndex)}
          </span>
        );
      }

      // Add highlighted text with distinct background
      parts.push(
        <mark
          key={`highlight-${idx}`}
          className="bg-gradient-to-r from-yellow-200 to-amber-200 px-1 py-0.5 rounded font-medium text-gray-900"
          title={`Relevance: ${(highlight.relevanceScore * 100).toFixed(0)}%`}
        >
          {highlight.text}
        </mark>
      );

      lastIndex = highlight.endIndex;
    });

    // Add remaining text
    if (lastIndex < section.content.length) {
      parts.push(
        <span key="text-end">{section.content.slice(lastIndex)}</span>
      );
    }

    return <p className="text-gray-700 leading-relaxed">{parts}</p>;
  }, [section.content, highlights]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Section Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex-shrink-0 w-8 h-8 bg-aws-dark text-white rounded-lg flex items-center justify-center text-sm font-bold">
              {index}
            </span>
            <div>
              <h4 className="font-semibold text-aws-dark">
                {section.sectionNumber} {section.sectionTitle}
              </h4>
              <p className="text-xs text-gray-500">{section.docTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-aws-orange/10 text-aws-orange px-2 py-1 rounded-full font-medium">
              {(section.relevanceScore * 100).toFixed(0)}% relevant
            </span>
            {highlights.length > 0 && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
                🔍 AI Found This
              </span>
            )}
          </div>
        </div>

        {/* Breadcrumb for parent sections */}
        {section.parentSections.length > 0 && (
          <div className="mt-2 text-xs text-gray-400 flex items-center gap-1">
            {section.parentSections.map((parent, idx) => (
              <span key={idx}>
                {idx > 0 && <span className="mx-1">›</span>}
                {parent.sectionNumber} {parent.title}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Section Content with Highlights */}
      <div className="p-4 bg-gradient-to-b from-amber-50/50 to-white border-l-4 border-aws-orange">
        {renderedContent}
      </div>
    </div>
  );
}


// Code Example Card Component
interface CodeExampleCardProps {
  example: CodeExample;
}

function CodeExampleCard({ example }: CodeExampleCardProps) {
  // Highlight configurable parameters in code
  const highlightedCode = useMemo(() => {
    if (example.configurableParams.length === 0) {
      return example.code;
    }

    let code = example.code;
    example.configurableParams.forEach((param) => {
      // Wrap parameter names with a marker for highlighting
      const regex = new RegExp(`(${param.name})`, 'g');
      code = code.replace(regex, `【$1】`);
    });
    return code;
  }, [example.code, example.configurableParams]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Description */}
      {example.description && (
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <p className="text-sm text-gray-700">{example.description}</p>
          <p className="text-xs text-gray-500 mt-1">
            Source: {example.sourceSection.sectionNumber} - {example.sourceSection.title}
          </p>
        </div>
      )}

      {/* Code Block */}
      <CodeBlock
        code={highlightedCode}
        language={example.language}
        showLineNumbers={true}
      />

      {/* Configurable Parameters */}
      {example.configurableParams.length > 0 && (
        <div className="px-4 py-3 bg-blue-50 border-t border-blue-100">
          <h5 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-2">
            ⚙️ Configurable Parameters
          </h5>
          <div className="space-y-1">
            {example.configurableParams.map((param, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <code className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs font-mono">
                  {param.name}
                </code>
                <span className="text-gray-600">{param.description}</span>
                {param.defaultValue && (
                  <span className="text-gray-400 text-xs">
                    (default: {param.defaultValue})
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Related Sections Card Component
interface RelatedSectionsCardProps {
  sections: RelatedSection[];
  onSectionClick?: (sectionId: string) => void;
}

function RelatedSectionsCard({ sections, onSectionClick }: RelatedSectionsCardProps) {
  const getRelationshipIcon = (type: RelatedSection['relationshipType']) => {
    switch (type) {
      case 'prerequisite':
        return '📚';
      case 'next_step':
        return '➡️';
      case 'related_concept':
        return '🔗';
      default:
        return '📄';
    }
  };

  const getRelationshipLabel = (type: RelatedSection['relationshipType']) => {
    switch (type) {
      case 'prerequisite':
        return 'Prerequisite';
      case 'next_step':
        return 'Next Step';
      case 'related_concept':
        return 'Related';
      default:
        return 'Related';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-aws-dark flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-aws-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        Related Sections
      </h3>
      <div className="grid gap-3">
        {sections.map((section, index) => (
          <button
            key={index}
            onClick={() => onSectionClick?.(section.sectionId)}
            className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:border-aws-orange hover:bg-orange-50 transition-colors text-left group"
          >
            <span className="text-xl">{getRelationshipIcon(section.relationshipType)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 group-hover:text-aws-orange transition-colors">
                  {section.title}
                </span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {getRelationshipLabel(section.relationshipType)}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                {section.description}
              </p>
            </div>
            <svg
              className="w-5 h-5 text-gray-400 group-hover:text-aws-orange transition-colors flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
