'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { SearchInput, EmptyState, LoadingSpinner, AnswerDisplay, SearchSuggestion, DocumentUpload, DeleteConfirmDialog } from '@/components';
import type { Answer } from '@/components';
import { docsApi } from '@/lib/api';

// Document types
interface DocumentInfo {
  docId: string;
  title: string;
  category: string;
  type: 'official_aws' | 'custom_upload';
  sections: number;
  lastUpdated: string;
  selected: boolean;
}

interface HistoryEntry {
  questionId: string;
  question: string;
  timestamp: string;
}

// AWS service categories for grouping
const AWS_CATEGORIES = [
  'Compute',
  'Storage',
  'Database',
  'Networking',
  'Security',
  'Analytics',
  'Machine Learning',
  'Developer Tools',
  'Management',
  'Other',
] as const;

export default function DocsPage() {
  // Document selection state
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [docSearchTerm, setDocSearchTerm] = useState('');
  const [loadingDocs, setLoadingDocs] = useState(true);

  // Question state
  const [question, setQuestion] = useState('');
  const [questionHistory, setQuestionHistory] = useState<HistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState(''); // Track the question that was asked

  // Answer state
  const [currentAnswer, setCurrentAnswer] = useState<Answer | null>(null);
  const [loadingAnswer, setLoadingAnswer] = useState(false);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; docId: string; docName: string }>({
    isOpen: false,
    docId: '',
    docName: '',
  });
  const [isDeleting, setIsDeleting] = useState(false);

  // Indexing state
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingStatus, setIndexingStatus] = useState<string | null>(null);

  // Auto-complete suggestions for common AWS queries
  const questionSuggestions: SearchSuggestion[] = useMemo(() => [
    { id: '1', text: 'How do I create a Lambda function?', category: 'Lambda' },
    { id: '2', text: 'How do I give Lambda permission to read from S3?', category: 'Lambda' },
    { id: '3', text: 'How do I set up an S3 bucket policy?', category: 'S3' },
    { id: '4', text: 'How do I configure VPC for Lambda?', category: 'Lambda' },
    { id: '5', text: 'What is the difference between IAM roles and policies?', category: 'IAM' },
    { id: '6', text: 'How do I enable versioning on S3?', category: 'S3' },
    { id: '7', text: 'How do I set up DynamoDB auto-scaling?', category: 'DynamoDB' },
    { id: '8', text: 'How do I create an EC2 instance?', category: 'EC2' },
    { id: '9', text: 'How do I configure CloudFront with S3?', category: 'CloudFront' },
    { id: '10', text: 'What are the best practices for IAM?', category: 'IAM' },
    { id: '11', text: 'How do I set up cross-account access?', category: 'IAM' },
    { id: '12', text: 'How do I encrypt data in S3?', category: 'S3' },
    { id: '13', text: 'How do I monitor Lambda performance?', category: 'Lambda' },
    { id: '14', text: 'How do I set up RDS Multi-AZ?', category: 'RDS' },
    { id: '15', text: 'How do I configure API Gateway with Lambda?', category: 'API Gateway' },
  ], []);

  // Load documents on mount
  useEffect(() => {
    async function loadDocuments() {
      try {
        setLoadingDocs(true);
        const response = await docsApi.list();
        const docs = (response.documents || []) as DocumentInfo[];
        setDocuments(docs);
      } catch (error) {
        console.error('Failed to load documents:', error);
        // Set mock data for development
        setDocuments(getMockDocuments());
      } finally {
        setLoadingDocs(false);
      }
    }
    loadDocuments();
  }, []);

  // Load question history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        setLoadingHistory(true);
        const response = await docsApi.getHistory();
        setQuestionHistory((response.history || []) as HistoryEntry[]);
      } catch (error) {
        console.error('Failed to load history:', error);
        setQuestionHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    }
    loadHistory();
  }, []);

  // Filter documents by search term
  const filteredDocuments = useMemo(() => {
    if (!docSearchTerm.trim()) return documents;
    const term = docSearchTerm.toLowerCase();
    return documents.filter(
      (doc) =>
        doc.title.toLowerCase().includes(term) ||
        doc.category.toLowerCase().includes(term)
    );
  }, [documents, docSearchTerm]);

  // Group documents by category and type
  const groupedDocuments = useMemo(() => {
    const officialDocs: Record<string, DocumentInfo[]> = {};
    const customDocs: DocumentInfo[] = [];

    filteredDocuments.forEach((doc) => {
      if (doc.type === 'custom_upload') {
        customDocs.push(doc);
      } else {
        if (!officialDocs[doc.category]) {
          officialDocs[doc.category] = [];
        }
        officialDocs[doc.category].push(doc);
      }
    });

    return { officialDocs, customDocs };
  }, [filteredDocuments]);

  // Toggle document selection
  const toggleDocSelection = useCallback((docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  }, []);

  // Select all documents in a category
  const toggleCategorySelection = useCallback(
    (_category: string, docs: DocumentInfo[]) => {
      setSelectedDocIds((prev) => {
        const next = new Set(prev);
        const categoryDocIds = docs.map((d) => d.docId);
        const allSelected = categoryDocIds.every((id) => prev.has(id));

        if (allSelected) {
          categoryDocIds.forEach((id) => next.delete(id));
        } else {
          categoryDocIds.forEach((id) => next.add(id));
        }
        return next;
      });
    },
    []
  );

  // Get effective selected docs (all if none selected)
  const effectiveSelectedDocs = useMemo(() => {
    if (selectedDocIds.size === 0) {
      return documents.map((d) => d.docId);
    }
    return Array.from(selectedDocIds);
  }, [selectedDocIds, documents]);

  // Submit question
  const handleSubmitQuestion = useCallback(
    async (q: string) => {
      if (!q.trim()) return;

      try {
        setLoadingAnswer(true);
        setCurrentQuestion(q); // Store the question being asked
        
        // Use RAG query endpoint for better answers
        const response = await docsApi.ragQuery(q, effectiveSelectedDocs);
        
        // Convert RAG response to Answer format
        const parsedAnswer: Answer = {
          directAnswer: response.answer,
          answerType: 'direct',
          sections: response.citations.map((citation) => ({
            section: {
              docId: citation.docId,
              docTitle: citation.docId, // Will be enriched later
              sectionId: citation.chunkId,
              sectionNumber: '',
              sectionTitle: citation.sectionTitle,
              content: citation.text,
              relevanceScore: citation.score,
              parentSections: [],
            },
            highlights: [],
          })),
          codeExamples: [],
          relatedSections: response.followUpQuestions.map((fq, idx) => ({
            sectionId: `followup-${idx}`,
            title: fq,
            description: 'Follow-up question',
            relationshipType: 'related_concept' as const,
          })),
          prerequisites: [],
        };
        
        setCurrentAnswer(parsedAnswer);

        // Add to history
        const newEntry: HistoryEntry = {
          questionId: Date.now().toString(),
          question: q,
          timestamp: new Date().toISOString(),
        };
        setQuestionHistory((prev) => [newEntry, ...prev].slice(0, 50));
        setQuestion(''); // Clear input after submission
      } catch (error) {
        console.error('Failed to submit question:', error);
        // Fallback to legacy query endpoint
        try {
          const response = await docsApi.query(q, effectiveSelectedDocs);
          const rawAnswer = response.answer;
          const parsedAnswer = parseAnswerResponse(rawAnswer);
          setCurrentAnswer(parsedAnswer);
          
          const newEntry: HistoryEntry = {
            questionId: Date.now().toString(),
            question: q,
            timestamp: new Date().toISOString(),
          };
          setQuestionHistory((prev) => [newEntry, ...prev].slice(0, 50));
          setQuestion('');
        } catch (fallbackError) {
          console.error('Fallback query also failed:', fallbackError);
          // Set mock answer for development
          setCurrentAnswer(getMockAnswer(q));
        }
      } finally {
        setLoadingAnswer(false);
      }
    },
    [effectiveSelectedDocs]
  );

  // Handle suggestion selection
  const handleSuggestionSelect = useCallback((suggestion: SearchSuggestion) => {
    handleSubmitQuestion(suggestion.text);
  }, [handleSubmitQuestion]);

  // Load answer from history
  const handleHistoryClick = useCallback(async (entry: HistoryEntry) => {
    try {
      setLoadingAnswer(true);
      setQuestion(entry.question);
      setCurrentQuestion(entry.question);
      const response = await docsApi.getHistoryAnswer(entry.questionId);
      const rawAnswer = response.answer;
      const parsedAnswer = parseAnswerResponse(rawAnswer);
      setCurrentAnswer(parsedAnswer);
    } catch (error) {
      console.error('Failed to load history answer:', error);
      // Set mock answer for development
      setCurrentAnswer(getMockAnswer(entry.question));
    } finally {
      setLoadingAnswer(false);
    }
  }, []);

  // Handle related section click
  const handleRelatedSectionClick = useCallback((sectionId: string) => {
    console.log('Navigate to section:', sectionId);
    // TODO: Implement navigation to related section
  }, []);

  // Select all / deselect all
  const handleSelectAll = useCallback(() => {
    if (selectedDocIds.size === documents.length) {
      setSelectedDocIds(new Set());
    } else {
      setSelectedDocIds(new Set(documents.map((d) => d.docId)));
    }
  }, [selectedDocIds.size, documents]);

  // Handle indexing selected documents
  const handleIndexDocuments = useCallback(async () => {
    if (selectedDocIds.size === 0) {
      setIndexingStatus('Please select documents to index first');
      setTimeout(() => setIndexingStatus(null), 3000);
      return;
    }

    try {
      setIsIndexing(true);
      setIndexingStatus('🔄 Starting indexing... This runs in the background.');
      
      const docIdsToIndex = Array.from(selectedDocIds);
      const response = await docsApi.ragIndexOfficial(docIdsToIndex);
      
      const startedCount = response.results.filter(r => r.message === 'Indexing started').length;
      const alreadyIndexed = response.results.filter(r => r.message === 'Already indexed').length;
      const inProgress = response.results.filter(r => r.message === 'Indexing in progress').length;
      const failCount = response.results.filter(r => !r.success).length;
      
      let statusMsg = '';
      if (startedCount > 0) {
        statusMsg += `🚀 Started indexing ${startedCount} document(s). `;
      }
      if (alreadyIndexed > 0) {
        statusMsg += `✅ ${alreadyIndexed} already indexed. `;
      }
      if (inProgress > 0) {
        statusMsg += `⏳ ${inProgress} in progress. `;
      }
      if (failCount > 0) {
        statusMsg += `❌ ${failCount} failed.`;
      }
      
      setIndexingStatus(statusMsg || '✅ All documents processed!');
      
      // Keep the status visible longer if indexing started
      setTimeout(() => setIndexingStatus(null), startedCount > 0 ? 10000 : 5000);
    } catch (error) {
      console.error('Indexing failed:', error);
      setIndexingStatus('❌ Failed to start indexing. Please try again.');
      setTimeout(() => setIndexingStatus(null), 5000);
    } finally {
      setIsIndexing(false);
    }
  }, [selectedDocIds]);

  // Handle document upload
  const handleUpload = useCallback(async (file: File, name: string, category: string, onProgress: (progress: number) => void) => {
    try {
      // Simulate upload progress
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        onProgress(i);
      }

      // Try to use the actual API
      try {
        await docsApi.upload(file, onProgress);
        const response = await docsApi.list();
        const docs = (response.documents || []) as DocumentInfo[];
        setDocuments(docs);
      } catch {
        // If API fails, add mock document locally
        const newDoc: DocumentInfo = {
          docId: `custom-${Date.now()}`,
          title: name,
          category: category,
          type: 'custom_upload',
          sections: Math.floor(Math.random() * 50) + 10,
          lastUpdated: new Date().toISOString(),
          selected: false,
        };
        setDocuments(prev => [newDoc, ...prev]);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  }, []);

  // Handle document delete
  const handleDeleteDoc = useCallback(async (docId: string) => {
    try {
      setIsDeleting(true);
      await docsApi.delete(docId);
      
      // Remove from documents list
      setDocuments((prev) => prev.filter((d) => d.docId !== docId));
      
      // Remove from selection if selected
      setSelectedDocIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
      
      setDeleteConfirm({ isOpen: false, docId: '', docName: '' });
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setIsDeleting(false);
    }
  }, []);

  // Open delete confirmation
  const openDeleteConfirm = useCallback((docId: string, docName: string) => {
    setDeleteConfirm({ isOpen: true, docId, docName });
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left Sidebar - Document Selection */}
      <aside className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-aws-dark flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Documentation
            </h2>
            <button
              onClick={() => setShowUploadModal(true)}
              className="p-1.5 text-aws-orange hover:bg-orange-50 rounded-lg transition-colors"
              title="Upload document"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {selectedDocIds.size === 0
              ? 'All docs selected (default)'
              : `${selectedDocIds.size} doc${selectedDocIds.size !== 1 ? 's' : ''} selected`}
          </p>
        </div>

        {/* Search Documents */}
        <div className="p-3 border-b border-gray-100">
          <SearchInput
            value={docSearchTerm}
            onChange={setDocSearchTerm}
            onSubmit={() => {}}
            placeholder="Search documents..."
            className="text-sm"
          />
        </div>

        {/* Select All / Deselect All + Index Button */}
        <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="text-xs text-aws-orange hover:text-orange-600 transition-colors"
            >
              {selectedDocIds.size === documents.length ? 'Deselect All' : 'Select All'}
            </button>
            <button
              onClick={handleIndexDocuments}
              disabled={isIndexing || selectedDocIds.size === 0}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                isIndexing || selectedDocIds.size === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-aws-orange text-white hover:bg-orange-600'
              }`}
              title="Index selected documents for RAG search"
            >
              {isIndexing ? '⏳ Indexing...' : '🔍 Index'}
            </button>
          </div>
          <span className="text-xs text-gray-400">
            {filteredDocuments.length} docs
          </span>
        </div>

        {/* Indexing Status */}
        {indexingStatus && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">
            {indexingStatus}
          </div>
        )}

        {/* Document List */}
        <div className="flex-1 overflow-y-auto">
          {loadingDocs ? (
            <div className="flex items-center justify-center h-32">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* Custom Uploads Section */}
              {groupedDocuments.customDocs.length > 0 && (
                <DocumentCategory
                  title="Custom Uploads"
                  icon="📁"
                  documents={groupedDocuments.customDocs}
                  selectedDocIds={selectedDocIds}
                  onToggleDoc={toggleDocSelection}
                  onToggleCategory={() =>
                    toggleCategorySelection('custom', groupedDocuments.customDocs)
                  }
                  onDeleteDoc={openDeleteConfirm}
                  isCustom
                />
              )}

              {/* Official AWS Docs by Category */}
              {AWS_CATEGORIES.map((category) => {
                const docs = groupedDocuments.officialDocs[category];
                if (!docs || docs.length === 0) return null;
                return (
                  <DocumentCategory
                    key={category}
                    title={category}
                    icon={getCategoryIcon(category)}
                    documents={docs}
                    selectedDocIds={selectedDocIds}
                    onToggleDoc={toggleDocSelection}
                    onToggleCategory={() => toggleCategorySelection(category, docs)}
                  />
                );
              })}

              {filteredDocuments.length === 0 && (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No documents found
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area - Answer Display */}
      <main className="flex-1 bg-gray-50 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          {loadingAnswer ? (
            <div className="flex items-center justify-center h-64">
              <LoadingSpinner size="lg" />
            </div>
          ) : currentAnswer ? (
            <AnswerDisplay
              answer={currentAnswer}
              question={currentQuestion}
              onRelatedSectionClick={handleRelatedSectionClick}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="bg-gradient-to-br from-aws-orange/10 to-orange-100 rounded-full p-6 mb-6">
                <svg className="w-16 h-16 text-aws-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-aws-dark mb-3">Ask About AWS Documentation</h2>
              <p className="text-gray-600 mb-6 max-w-md">
                Type your question in the input box on the right panel and press Enter. 
                The AI will search through indexed AWS documentation and provide answers with citations.
              </p>
              
              {/* Quick start examples */}
              <div className="bg-white rounded-lg border border-gray-200 p-4 w-full max-w-lg">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span>💡</span> Try asking:
                </h3>
                <div className="space-y-2">
                  {[
                    'How do I create a Lambda function?',
                    'What are the S3 storage classes?',
                    'How do I configure EC2 security groups?',
                  ].map((example, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSubmitQuestion(example)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:text-aws-orange hover:bg-orange-50 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <span className="text-aws-orange">→</span>
                      {example}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Arrow pointing to input */}
              <div className="mt-8 flex items-center gap-2 text-gray-400">
                <span className="text-sm">Type your question here</span>
                <svg className="w-6 h-6 animate-bounce-x" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Right Sidebar - Question Input & History */}
      <aside className="w-96 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-aws-dark text-white">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <h2 className="font-semibold">AI Documentation Assistant</h2>
          </div>
          <span className="inline-block mt-1 text-xs bg-aws-orange px-2 py-0.5 rounded-full">
            POWERED BY BEDROCK
          </span>
        </div>

        {/* Question History */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Recent Questions
            </h3>
          </div>

          {loadingHistory ? (
            <div className="flex items-center justify-center h-32">
              <LoadingSpinner size="sm" />
            </div>
          ) : questionHistory.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {questionHistory.map((entry) => (
                <button
                  key={entry.questionId}
                  onClick={() => handleHistoryClick(entry)}
                  className="w-full p-3 text-left hover:bg-gray-50 transition-colors group"
                >
                  <p className="text-sm text-gray-700 group-hover:text-aws-orange line-clamp-2">
                    💬 {entry.question}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatTimestamp(entry.timestamp)}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500 text-sm">
              No questions yet. Ask something below!
            </div>
          )}
        </div>

        {/* Question Input */}
        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="flex gap-2">
            <SearchInput
              value={question}
              onChange={setQuestion}
              onSubmit={handleSubmitQuestion}
              suggestions={questionSuggestions}
              onSuggestionSelect={handleSuggestionSelect}
              placeholder="Ask about AWS documentation..."
              loading={loadingAnswer}
              className="flex-1"
            />
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            <QuickActionButton icon="📎" label="Upload Doc" onClick={() => setShowUploadModal(true)} />
            <QuickActionButton icon="💻" label="Show Code" onClick={() => {}} />
            <QuickActionButton icon="📖" label="Reading Path" onClick={() => {}} />
            <QuickActionButton icon="🔍" label="Related" onClick={() => {}} />
          </div>
        </div>
      </aside>

      {/* Document Upload Modal */}
      <DocumentUpload
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleUpload}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={deleteConfirm.isOpen}
        documentName={deleteConfirm.docName}
        onConfirm={() => handleDeleteDoc(deleteConfirm.docId)}
        onCancel={() => setDeleteConfirm({ isOpen: false, docId: '', docName: '' })}
        isDeleting={isDeleting}
      />
    </div>
  );
}

// Quick action button component
function QuickActionButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 text-xs bg-gray-100 hover:bg-aws-orange hover:text-white rounded-full transition-colors text-gray-600"
    >
      {icon} {label}
    </button>
  );
}

// Document category component
interface DocumentCategoryProps {
  title: string;
  icon: string;
  documents: DocumentInfo[];
  selectedDocIds: Set<string>;
  onToggleDoc: (docId: string) => void;
  onToggleCategory: () => void;
  onDeleteDoc?: (docId: string, docName: string) => void;
  isCustom?: boolean;
}

function DocumentCategory({
  title,
  icon,
  documents,
  selectedDocIds,
  onToggleDoc,
  onToggleCategory,
  onDeleteDoc,
  isCustom = false,
}: DocumentCategoryProps) {
  const [expanded, setExpanded] = useState(true);
  const allSelected = documents.every((d) => selectedDocIds.has(d.docId));
  const someSelected = documents.some((d) => selectedDocIds.has(d.docId));

  return (
    <div className={isCustom ? 'bg-blue-50' : ''}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-sm font-medium text-gray-700">{title}</span>
          <span className="text-xs text-gray-400">({documents.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            onChange={(e) => {
              e.stopPropagation();
              onToggleCategory();
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 text-aws-orange border-gray-300 rounded focus:ring-aws-orange"
          />
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="pl-8 pr-4 pb-2">
          {documents.map((doc) => (
            <div
              key={doc.docId}
              className={`flex items-center gap-2 py-1.5 px-2 rounded transition-colors ${
                selectedDocIds.has(doc.docId)
                  ? 'bg-orange-50 border-l-2 border-aws-orange'
                  : 'hover:bg-gray-50'
              }`}
            >
              <label className="flex items-center gap-2 flex-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedDocIds.has(doc.docId)}
                  onChange={() => onToggleDoc(doc.docId)}
                  className="w-4 h-4 text-aws-orange border-gray-300 rounded focus:ring-aws-orange"
                />
                <span
                  className={`text-sm truncate ${
                    selectedDocIds.has(doc.docId) ? 'text-aws-dark font-medium' : 'text-gray-600'
                  }`}
                  title={doc.title}
                >
                  {doc.title}
                </span>
              </label>
              {isCustom && (
                <div className="flex items-center gap-1 ml-auto">
                  <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">
                    Custom
                  </span>
                  {onDeleteDoc && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDoc(doc.docId, doc.title);
                      }}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete document"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper function to get category icon
function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    Compute: '⚡',
    Storage: '💾',
    Database: '🗄️',
    Networking: '🌐',
    Security: '🔐',
    Analytics: '📊',
    'Machine Learning': '🤖',
    'Developer Tools': '🛠️',
    Management: '📋',
    Other: '📦',
  };
  return icons[category] || '📄';
}

// Helper function to format timestamp
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Mock data for development
function getMockDocuments(): DocumentInfo[] {
  return [
    // Custom uploads
    { docId: 'custom-1', title: 'Internal AWS Guidelines', category: 'Custom', type: 'custom_upload', sections: 15, lastUpdated: new Date().toISOString(), selected: false },
    { docId: 'custom-2', title: 'Team Best Practices', category: 'Custom', type: 'custom_upload', sections: 8, lastUpdated: new Date().toISOString(), selected: false },
    // Compute
    { docId: 'lambda-1', title: 'AWS Lambda', category: 'Compute', type: 'official_aws', sections: 120, lastUpdated: new Date().toISOString(), selected: false },
    { docId: 'ec2-1', title: 'Amazon EC2', category: 'Compute', type: 'official_aws', sections: 200, lastUpdated: new Date().toISOString(), selected: false },
    { docId: 'ecs-1', title: 'Amazon ECS', category: 'Compute', type: 'official_aws', sections: 85, lastUpdated: new Date().toISOString(), selected: false },
    { docId: 'eks-1', title: 'Amazon EKS', category: 'Compute', type: 'official_aws', sections: 95, lastUpdated: new Date().toISOString(), selected: false },
    // Storage
    { docId: 's3-1', title: 'Amazon S3', category: 'Storage', type: 'official_aws', sections: 150, lastUpdated: new Date().toISOString(), selected: false },
    { docId: 'ebs-1', title: 'Amazon EBS', category: 'Storage', type: 'official_aws', sections: 60, lastUpdated: new Date().toISOString(), selected: false },
    { docId: 'efs-1', title: 'Amazon EFS', category: 'Storage', type: 'official_aws', sections: 45, lastUpdated: new Date().toISOString(), selected: false },
    // Database
    { docId: 'rds-1', title: 'Amazon RDS', category: 'Database', type: 'official_aws', sections: 110, lastUpdated: new Date().toISOString(), selected: false },
    { docId: 'dynamodb-1', title: 'Amazon DynamoDB', category: 'Database', type: 'official_aws', sections: 130, lastUpdated: new Date().toISOString(), selected: false },
    { docId: 'aurora-1', title: 'Amazon Aurora', category: 'Database', type: 'official_aws', sections: 90, lastUpdated: new Date().toISOString(), selected: false },
    // Security
    { docId: 'iam-1', title: 'AWS IAM', category: 'Security', type: 'official_aws', sections: 180, lastUpdated: new Date().toISOString(), selected: false },
    { docId: 'kms-1', title: 'AWS KMS', category: 'Security', type: 'official_aws', sections: 55, lastUpdated: new Date().toISOString(), selected: false },
    // Networking
    { docId: 'vpc-1', title: 'Amazon VPC', category: 'Networking', type: 'official_aws', sections: 140, lastUpdated: new Date().toISOString(), selected: false },
    { docId: 'cloudfront-1', title: 'Amazon CloudFront', category: 'Networking', type: 'official_aws', sections: 75, lastUpdated: new Date().toISOString(), selected: false },
  ];
}

// Helper function to parse answer response from API
function parseAnswerResponse(rawAnswer: unknown): Answer {
  if (!rawAnswer) {
    return getDefaultAnswer();
  }

  // If it's already in the correct format, return it
  const answer = rawAnswer as Record<string, unknown>;
  
  return {
    directAnswer: (answer.directAnswer as string) || undefined,
    answerType: (answer.answerType as Answer['answerType']) || 'reference',
    sections: (answer.sections as Answer['sections']) || [],
    codeExamples: (answer.codeExamples as Answer['codeExamples']) || [],
    relatedSections: (answer.relatedSections as Answer['relatedSections']) || [],
    prerequisites: (answer.prerequisites as Answer['prerequisites']) || [],
    steps: (answer.steps as string[]) || undefined,
  };
}

// Default empty answer
function getDefaultAnswer(): Answer {
  return {
    answerType: 'reference',
    sections: [],
    codeExamples: [],
    relatedSections: [],
    prerequisites: [],
  };
}

// Mock answer for development
function getMockAnswer(question: string): Answer {
  const isHowTo = question.toLowerCase().startsWith('how');
  
  return {
    directAnswer: `To give Lambda permission to read from S3, you need to use the add-permission CLI command with s3.amazonaws.com as the principal. Specify your S3 bucket ARN as the source to restrict which bucket can invoke your function.`,
    answerType: isHowTo ? 'multi_step' : 'direct',
    steps: isHowTo ? [
      'Create an IAM execution role for your Lambda function with S3 read permissions',
      'Use the aws lambda add-permission command to grant S3 permission to invoke your function',
      'Configure S3 event notifications to trigger your Lambda function',
      'Test the integration by uploading a file to your S3 bucket',
    ] : undefined,
    sections: [
      {
        section: {
          docId: 'lambda-1',
          docTitle: 'AWS Lambda Developer Guide',
          sectionId: 'section-3-2',
          sectionNumber: '3.2',
          sectionTitle: 'Resource-based Policy Statements',
          content: 'To give other accounts and AWS services permission to use your Lambda function, use the add-permission command. For example, to grant Amazon S3 permission to invoke your function, use the following command with the --principal s3.amazonaws.com parameter and specify the S3 bucket ARN as the --source-arn. Each Lambda function can have a single resource-based policy with up to 20 KB of policy statements.',
          relevanceScore: 0.95,
          parentSections: [
            { sectionNumber: '3', title: 'Lambda Permissions' },
            { sectionNumber: '3.1', title: 'Overview' },
          ],
        },
        highlights: [
          {
            text: 'add-permission',
            startIndex: 89,
            endIndex: 103,
            relevanceScore: 0.98,
          },
          {
            text: '--principal s3.amazonaws.com',
            startIndex: 186,
            endIndex: 214,
            relevanceScore: 0.96,
          },
          {
            text: '--source-arn',
            startIndex: 254,
            endIndex: 266,
            relevanceScore: 0.94,
          },
        ],
      },
      {
        section: {
          docId: 'lambda-1',
          docTitle: 'AWS Lambda Developer Guide',
          sectionId: 'section-3-3',
          sectionNumber: '3.3',
          sectionTitle: 'Cross-Account Access',
          content: 'To grant cross-account access, specify the full account ID in the principal. When you grant cross-account access, the other account must also have an IAM policy that allows the user to call the Lambda API.',
          relevanceScore: 0.78,
          parentSections: [
            { sectionNumber: '3', title: 'Lambda Permissions' },
          ],
        },
        highlights: [],
      },
    ],
    codeExamples: [
      {
        language: 'bash',
        code: `# Grant S3 permission to invoke Lambda function
aws lambda add-permission \\
  --function-name my-function \\
  --principal s3.amazonaws.com \\
  --statement-id s3-invoke \\
  --action lambda:InvokeFunction \\
  --source-arn arn:aws:s3:::YOUR-BUCKET \\
  --source-account 123456789012`,
        description: 'Use the AWS CLI to grant S3 permission to invoke your Lambda function',
        sourceSection: { sectionNumber: '3.2', title: 'Resource-based Policy Statements' },
        configurableParams: [
          { name: 'my-function', description: 'Your Lambda function name' },
          { name: 'YOUR-BUCKET', description: 'Your S3 bucket name' },
          { name: '123456789012', description: 'Your AWS account ID' },
        ],
      },
      {
        language: 'json',
        code: `{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:ListBucket"
  ],
  "Resource": "arn:aws:s3:::YOUR-BUCKET/*"
}`,
        description: 'IAM policy for Lambda execution role to read from S3',
        sourceSection: { sectionNumber: '3.2', title: 'Resource-based Policy Statements' },
        configurableParams: [
          { name: 'YOUR-BUCKET', description: 'Your S3 bucket name' },
        ],
      },
    ],
    relatedSections: [
      {
        sectionId: 'section-4-1',
        title: 'S3 Event Notifications',
        description: 'Learn how to configure S3 to automatically trigger your Lambda function when objects are created or deleted.',
        relationshipType: 'next_step',
      },
      {
        sectionId: 'section-1-1',
        title: 'IAM Roles Basics',
        description: 'Understand the fundamentals of IAM roles and how they work with Lambda functions.',
        relationshipType: 'prerequisite',
      },
      {
        sectionId: 'section-5-2',
        title: 'VPC Access for Lambda',
        description: 'Configure your Lambda function to access resources in a VPC, including S3 via VPC endpoints.',
        relationshipType: 'related_concept',
      },
    ],
    prerequisites: [
      {
        concept: 'IAM Roles',
        description: 'Understanding of AWS Identity and Access Management roles',
        learnMoreSection: { sectionNumber: '1.1', title: 'IAM Roles Basics' },
      },
      {
        concept: 'AWS CLI',
        description: 'AWS Command Line Interface installed and configured',
      },
    ],
  };
}
