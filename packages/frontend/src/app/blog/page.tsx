'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { SearchInput, EmptyState, SearchSuggestion } from '@/components';
import { blogApi } from '@/lib/api';
import { ResultCard, ResultCardSkeleton } from '@/components/ResultCard';
import { BlogFilterSidebar, BlogFilters, getDefaultFilters } from '@/components/BlogFilterSidebar';
import { TrendingTopics, RecommendationsPanel } from '@/components/TrendingRecommendations';
import type { ResultCard as ResultCardType, TrendingTopic } from '@shared/types/blog-aggregator';
import { ContentSource, DifficultyLevel, AuthorityLevel, TrendStatus, ConflictSeverity } from '@shared/types/enums';

// Search result with partial source info
interface SearchResponse {
  results: ResultCardType[];
  totalCount: number;
  unavailableSources?: string[];
  alternativeSuggestions?: string[];
}

export default function BlogPage() {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<ResultCardType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Filter state
  const [filters, setFilters] = useState<BlogFilters>(getDefaultFilters());

  // Partial results notice
  const [unavailableSources, setUnavailableSources] = useState<string[]>([]);
  const [alternativeSuggestions, setAlternativeSuggestions] = useState<string[]>([]);

  // Trending topics
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(true);

  // Recommendations (shown after viewing an article)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<ResultCardType[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  // Auto-complete suggestions
  const searchSuggestions: SearchSuggestion[] = useMemo(() => [
    { id: '1', text: 'Lambda best practices', category: 'Serverless' },
    { id: '2', text: 'S3 performance optimization', category: 'Storage' },
    { id: '3', text: 'DynamoDB single table design', category: 'Database' },
    { id: '4', text: 'ECS vs EKS comparison', category: 'Containers' },
    { id: '5', text: 'API Gateway authentication', category: 'API' },
    { id: '6', text: 'CloudFormation best practices', category: 'IaC' },
    { id: '7', text: 'Cost optimization strategies', category: 'Cost' },
    { id: '8', text: 'VPC networking patterns', category: 'Networking' },
    { id: '9', text: 'IAM least privilege', category: 'Security' },
    { id: '10', text: 'Step Functions workflows', category: 'Serverless' },
  ], []);

  // Load trending topics and initial blog results on mount
  useEffect(() => {
    async function loadInitial() {
      // Load trending topics
      try {
        setLoadingTrending(true);
        const response = await blogApi.getTrending();
        setTrendingTopics((response.topics || []) as TrendingTopic[]);
      } catch (error) {
        console.error('Failed to load trending topics:', error);
        setTrendingTopics(getMockTrendingTopics());
      } finally {
        setLoadingTrending(false);
      }

      // Auto-load recent AWS blog posts so the page isn't empty
      try {
        setIsLoading(true);
        const response = await blogApi.search('AWS cloud') as SearchResponse;
        if (response.results && response.results.length > 0) {
          setResults(response.results);
          setHasSearched(true);
          setSubmittedQuery('');
        }
      } catch (error) {
        console.error('Failed to load initial blogs:', error);
        setResults(getMockResults());
        setHasSearched(true);
        setSubmittedQuery('');
      } finally {
        setIsLoading(false);
      }
    }
    loadInitial();
  }, []);

  // Convert filters to API format
  const getApiFilters = useCallback(() => {
    const apiFilters: Record<string, unknown> = {};
    
    if (filters.freeTierOnly) {
      apiFilters.freeTierOnly = true;
    }
    if (filters.recencyRange) {
      apiFilters.recencyRange = filters.recencyRange;
    }
    if (filters.difficultyLevels.length > 0) {
      apiFilters.difficultyLevels = filters.difficultyLevels;
    }
    if (filters.techStacks.length > 0) {
      apiFilters.techStacks = filters.techStacks;
    }
    if (filters.implementationTimeRange.min > 0 || filters.implementationTimeRange.max < 480) {
      apiFilters.implementationTimeRange = filters.implementationTimeRange;
    }
    if (filters.focusAreas.length > 0) {
      apiFilters.focusAreas = filters.focusAreas;
    }
    if (filters.sources.length > 0) {
      apiFilters.sources = filters.sources;
    }
    
    return apiFilters;
  }, [filters]);

  // Search handler
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;

    setIsLoading(true);
    setHasSearched(true);
    setSubmittedQuery(query);
    setUnavailableSources([]);
    setAlternativeSuggestions([]);
    setSelectedItemId(null);
    setRecommendations([]);

    try {
      const response = await blogApi.search(query, getApiFilters()) as SearchResponse;
      setResults(response.results || []);
      setUnavailableSources(response.unavailableSources || []);
      setAlternativeSuggestions(response.alternativeSuggestions || []);
    } catch (error) {
      console.error('Search failed:', error);
      // Use mock data for development
      setResults(getMockResults());
    } finally {
      setIsLoading(false);
    }
  }, [getApiFilters]);

  // Re-search when filters change (if we have a query or initial results loaded)
  useEffect(() => {
    if (submittedQuery) {
      handleSearch(submittedQuery);
    } else if (hasSearched) {
      // Re-search with default query when filters change on initial load
      handleSearch('AWS cloud');
    }
    // Only re-run when filters change, not when handleSearch changes
    // eslint-disable-next-line
  }, [filters]);

  // Handle suggestion selection
  const handleSuggestionSelect = useCallback((suggestion: SearchSuggestion) => {
    setSearchQuery(suggestion.text);
    handleSearch(suggestion.text);
  }, [handleSearch]);

  // Handle filter change
  const handleFilterChange = useCallback((newFilters: BlogFilters) => {
    setFilters(newFilters);
  }, []);

  // Handle filter reset
  const handleFilterReset = useCallback(() => {
    setFilters(getDefaultFilters());
  }, []);

  // Handle viewing an article (load recommendations)
  const handleViewArticle = useCallback(async (itemId: string) => {
    setSelectedItemId(itemId);
    setLoadingRecommendations(true);

    try {
      const response = await blogApi.getRecommendations(itemId);
      setRecommendations((response.recommendations || []) as ResultCardType[]);
    } catch (error) {
      console.error('Failed to load recommendations:', error);
      setRecommendations(getMockRecommendations());
    } finally {
      setLoadingRecommendations(false);
    }
  }, []);

  // Handle trending topic click
  const handleTrendingClick = useCallback((topic: string) => {
    setSearchQuery(topic);
    handleSearch(topic);
  }, [handleSearch]);

  // Handle alternative suggestion click
  const handleAlternativeClick = useCallback((suggestion: string) => {
    setSearchQuery(suggestion);
    handleSearch(suggestion);
  }, [handleSearch]);

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.freeTierOnly) count++;
    if (filters.recencyRange) count++;
    if (filters.difficultyLevels.length > 0) count++;
    if (filters.techStacks.length > 0) count++;
    if (filters.implementationTimeRange.min > 0 || filters.implementationTimeRange.max < 480) count++;
    if (filters.focusAreas.length > 0) count++;
    if (filters.sources.length > 0) count++;
    return count;
  }, [filters]);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left Sidebar - Filters */}
      <aside className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        <BlogFilterSidebar
          filters={filters}
          onChange={handleFilterChange}
          onReset={handleFilterReset}
          activeCount={activeFilterCount}
        />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 bg-gray-50 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          {/* Search Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-aws-dark mb-2 flex items-center gap-2">
              <span>🔍</span>
              AWS Blog Aggregator
            </h1>
            <p className="text-gray-600 text-sm">
              Search across AWS blogs, Reddit, HackerNews, Medium, and more. Results ranked by quality and relevance.
            </p>
          </div>

          {/* Search Bar */}
          <div className="mb-6">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              onSubmit={handleSearch}
              suggestions={searchSuggestions}
              onSuggestionSelect={handleSuggestionSelect}
              placeholder="Search for AWS tutorials, best practices, solutions..."
              loading={isLoading}
              className="w-full"
            />
          </div>

          {/* Partial Results Notice */}
          {unavailableSources.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
              <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm text-yellow-800 font-medium">Partial results</p>
                <p className="text-xs text-yellow-700">
                  Some sources are temporarily unavailable: {unavailableSources.join(', ')}
                </p>
              </div>
            </div>
          )}

          {/* Results Area */}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <ResultCardSkeleton key={i} />
              ))}
            </div>
          ) : hasSearched ? (
            results.length > 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  {submittedQuery
                    ? `Found ${results.length} results for "${submittedQuery}"`
                    : `Showing ${results.length} recent AWS blog posts`}
                </p>
                {results.map((result, index) => (
                  <ResultCard
                    key={result.url || index}
                    result={result}
                    onViewArticle={() => handleViewArticle(result.url)}
                  />
                ))}
              </div>
            ) : (
              <NoResultsState
                searchTerm={submittedQuery}
                suggestions={alternativeSuggestions.length > 0 ? alternativeSuggestions : ['Lambda tutorials', 'S3 best practices', 'DynamoDB patterns']}
                onSuggestionClick={handleAlternativeClick}
                onClearSearch={() => {
                  setSearchQuery('');
                  setSubmittedQuery('');
                  setHasSearched(false);
                  setResults([]);
                }}
              />
            )
          ) : (
            <div>
              {/* Initial state - show trending topics */}
              <TrendingTopics
                topics={trendingTopics}
                loading={loadingTrending}
                onTopicClick={handleTrendingClick}
              />
            </div>
          )}
        </div>
      </main>

      {/* Right Sidebar - Recommendations */}
      <aside className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        <RecommendationsPanel
          recommendations={recommendations}
          loading={loadingRecommendations}
          selectedItemId={selectedItemId}
          onViewArticle={handleViewArticle}
        />
      </aside>
    </div>
  );
}

// No results state component
function NoResultsState({
  searchTerm,
  suggestions,
  onSuggestionClick,
  onClearSearch,
}: {
  searchTerm?: string;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  onClearSearch?: () => void;
}) {
  return (
    <EmptyState
      icon={
        <svg
          className="w-16 h-16 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      }
      title={searchTerm ? `No results for "${searchTerm}"` : 'No results found'}
      description="Try adjusting your search or filters to find what you're looking for."
      action={onClearSearch ? { label: 'Clear search', onClick: onClearSearch } : undefined}
    >
      {suggestions && suggestions.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-gray-500 mb-2">Try searching for:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => onSuggestionClick?.(suggestion)}
                className="text-sm text-aws-orange hover:text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1 rounded-full transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </EmptyState>
  );
}

// Mock data functions
function getMockTrendingTopics(): TrendingTopic[] {
  return [
    { topic: 'AWS Lambda SnapStart', score: 9.2, recentItems: [] },
    { topic: 'Amazon Bedrock', score: 9.0, recentItems: [] },
    { topic: 'EKS Anywhere', score: 8.5, recentItems: [] },
    { topic: 'Step Functions Distributed Map', score: 8.2, recentItems: [] },
    { topic: 'Aurora Serverless v2', score: 7.8, recentItems: [] },
  ];
}


function getMockResults(): ResultCardType[] {
  return [
    {
      title: 'Building Serverless Applications with AWS Lambda and DynamoDB',
      url: 'https://aws.amazon.com/blogs/compute/serverless-lambda-dynamodb',
      source: ContentSource.AWS_BLOG,
      qualityScore: 8.7,
      scoreBreakdown: {
        recencyPoints: 9,
        authorityPoints: 10,
        validationPoints: 8,
        impactPoints: 9,
        qualityPoints: 8,
      },
      publishDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      author: {
        name: 'James Beswick',
        credentials: ['AWS Serverless Hero', 'Principal Developer Advocate'],
        authorityLevel: AuthorityLevel.AWS_HERO,
      },
      estimatedReadTime: 12,
      difficultyLevel: DifficultyLevel.INTERMEDIATE,
      keyTakeaways: [
        'Use single-table design for DynamoDB to reduce costs',
        'Implement proper error handling with dead letter queues',
        'Leverage Lambda Powertools for observability',
      ],
      impactMetrics: {
        performanceImprovement: '40% faster cold starts',
        costSavings: '$200/month reduction',
      },
      prerequisites: ['AWS Lambda basics', 'DynamoDB fundamentals', 'Node.js'],
      communityValidation: {
        upvotes: 342,
        shares: 89,
        comments: 45,
      },
      userExperiences: [
        {
          quote: 'This guide saved me hours of debugging. The single-table design pattern is a game changer.',
          source: ContentSource.REDDIT,
          url: 'https://reddit.com/r/aws/comments/example',
          upvotes: 156,
        },
      ],
      relatedLinks: [
        { type: 'code', title: 'GitHub Repository', url: 'https://github.com/aws-samples/example' },
        { type: 'documentation', title: 'Lambda Documentation', url: 'https://docs.aws.amazon.com/lambda' },
      ],
      trendIndicator: {
        status: TrendStatus.RISING,
        changePercentage: 25,
        message: 'Trending up 25% this month',
      },
    },
    {
      title: 'Cost Optimization Strategies for AWS: A Complete Guide',
      url: 'https://medium.com/@awsexpert/cost-optimization',
      source: ContentSource.MEDIUM,
      qualityScore: 8.2,
      scoreBreakdown: {
        recencyPoints: 8,
        authorityPoints: 7,
        validationPoints: 9,
        impactPoints: 9,
        qualityPoints: 8,
      },
      publishDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      author: {
        name: 'Sarah Chen',
        credentials: ['AWS Solutions Architect', 'FinOps Certified'],
        authorityLevel: AuthorityLevel.RECOGNIZED_CONTRIBUTOR,
      },
      estimatedReadTime: 18,
      difficultyLevel: DifficultyLevel.BEGINNER,
      keyTakeaways: [
        'Use Savings Plans for predictable workloads',
        'Implement auto-scaling to match demand',
        'Review and delete unused resources monthly',
      ],
      impactMetrics: {
        costSavings: 'Up to 70% cost reduction',
      },
      prerequisites: ['AWS Account', 'Basic AWS knowledge'],
      communityValidation: {
        upvotes: 567,
        shares: 234,
        comments: 78,
      },
      relatedLinks: [
        { type: 'article', title: 'AWS Pricing Calculator', url: 'https://calculator.aws' },
      ],
      trendIndicator: {
        status: TrendStatus.STABLE,
        changePercentage: 5,
        message: 'Stable interest',
      },
    },
    {
      title: 'Migrating from ECS to EKS: Lessons Learned',
      url: 'https://dev.to/containers/ecs-to-eks-migration',
      source: ContentSource.DEVTO,
      qualityScore: 7.5,
      scoreBreakdown: {
        recencyPoints: 7,
        authorityPoints: 6,
        validationPoints: 8,
        impactPoints: 8,
        qualityPoints: 7,
      },
      publishDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      author: {
        name: 'Mike Johnson',
        credentials: ['Senior DevOps Engineer'],
        authorityLevel: AuthorityLevel.COMMUNITY_MEMBER,
      },
      estimatedReadTime: 15,
      difficultyLevel: DifficultyLevel.ADVANCED,
      keyTakeaways: [
        'Plan for networking differences between ECS and EKS',
        'Use Helm charts for consistent deployments',
        'Implement proper monitoring from day one',
      ],
      prerequisites: ['Docker', 'Kubernetes basics', 'ECS experience'],
      communityValidation: {
        upvotes: 189,
        comments: 34,
      },
      conflicts: [
        {
          message: 'Some recommendations conflict with AWS best practices',
          conflictingApproaches: ['Manual scaling vs Auto-scaling'],
          severity: ConflictSeverity.MEDIUM,
        },
      ],
      relatedLinks: [
        { type: 'discussion', title: 'HackerNews Discussion', url: 'https://news.ycombinator.com/item?id=example' },
      ],
      trendIndicator: {
        status: TrendStatus.DECLINING,
        changePercentage: -15,
        message: 'Interest declining as EKS matures',
      },
    },
  ];
}

function getMockRecommendations(): ResultCardType[] {
  return [
    {
      title: 'Advanced DynamoDB Patterns for Serverless',
      url: 'https://aws.amazon.com/blogs/database/dynamodb-patterns',
      source: ContentSource.AWS_BLOG,
      qualityScore: 8.5,
      scoreBreakdown: {
        recencyPoints: 8,
        authorityPoints: 9,
        validationPoints: 8,
        impactPoints: 9,
        qualityPoints: 8,
      },
      publishDate: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
      author: {
        name: 'Alex DeBrie',
        credentials: ['DynamoDB Expert', 'Author of The DynamoDB Book'],
        authorityLevel: AuthorityLevel.AWS_HERO,
      },
      estimatedReadTime: 20,
      difficultyLevel: DifficultyLevel.ADVANCED,
      keyTakeaways: [
        'Use GSIs strategically for access patterns',
        'Implement proper partition key design',
      ],
      communityValidation: {
        upvotes: 423,
        shares: 156,
      },
      relatedLinks: [],
    },
  ];
}
