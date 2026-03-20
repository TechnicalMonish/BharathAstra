'use client';

import { Skeleton } from './LoadingSpinner';
import { QualityScoreBadge } from './QualityScoreBadge';
import type { TrendingTopic, ResultCard as ResultCardType } from '@shared/types/blog-aggregator';

// ============================================
// Trending Topics Component
// ============================================

interface TrendingTopicsProps {
  topics: TrendingTopic[];
  loading: boolean;
  onTopicClick: (topic: string) => void;
}

export function TrendingTopics({ topics, loading, onTopicClick }: TrendingTopicsProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-aws-dark flex items-center gap-2">
          <span>🔥</span>
          Trending Topics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <TrendingTopicSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (topics.length === 0) {
    return null;
  }

  // Separate rising and declining topics
  const risingTopics = topics.filter((t) => t.score >= 7);
  const decliningTopics = topics.filter((t) => t.score < 5);

  return (
    <div className="space-y-6">
      {/* Rising Topics */}
      <div>
        <h2 className="text-lg font-semibold text-aws-dark flex items-center gap-2 mb-4">
          <span>📈</span>
          Trending Topics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {risingTopics.map((topic) => (
            <TrendingTopicCard
              key={topic.topic}
              topic={topic}
              onClick={() => onTopicClick(topic.topic)}
              variant="rising"
            />
          ))}
        </div>
      </div>

      {/* Declining Topics Warning */}
      {decliningTopics.length > 0 && (
        <div>
          <h3 className="text-md font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <span>📉</span>
            Declining Interest
            <span className="text-xs text-gray-500 font-normal">(Consider alternatives)</span>
          </h3>
          <div className="space-y-2">
            {decliningTopics.map((topic) => (
              <DecliningTopicWarning
                key={topic.topic}
                topic={topic}
                onClick={() => onTopicClick(topic.topic)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Trending Topic Card
interface TrendingTopicCardProps {
  topic: TrendingTopic;
  onClick: () => void;
  variant: 'rising' | 'stable';
}

function TrendingTopicCard({ topic, onClick, variant }: TrendingTopicCardProps) {
  const bgColor = variant === 'rising' ? 'bg-green-50 hover:bg-green-100' : 'bg-gray-50 hover:bg-gray-100';
  const borderColor = variant === 'rising' ? 'border-green-200' : 'border-gray-200';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border ${bgColor} ${borderColor} transition-colors group`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 group-hover:text-aws-orange transition-colors truncate">
            {topic.topic}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-green-600 font-medium">
              📈 Trending
            </span>
            <span className="text-xs text-gray-500">
              Score: {topic.score.toFixed(1)}
            </span>
          </div>
        </div>
        <svg
          className="w-5 h-5 text-gray-400 group-hover:text-aws-orange transition-colors flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

// Declining Topic Warning
function DecliningTopicWarning({
  topic,
  onClick,
}: {
  topic: TrendingTopic;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg bg-yellow-50 border border-yellow-200 hover:bg-yellow-100 transition-colors group"
    >
      <div className="flex items-center gap-3">
        <span className="text-yellow-600">⚠️</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm text-gray-700 group-hover:text-aws-orange transition-colors">
            {topic.topic}
          </span>
          <span className="text-xs text-yellow-600 ml-2">
            Interest declining - may be outdated
          </span>
        </div>
        <svg
          className="w-4 h-4 text-gray-400 group-hover:text-aws-orange transition-colors flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

// Trending Topic Skeleton
function TrendingTopicSkeleton() {
  return (
    <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 animate-pulse">
      <Skeleton variant="text" height={20} className="w-3/4" />
      <div className="flex gap-2 mt-2">
        <Skeleton variant="text" height={14} width={60} />
        <Skeleton variant="text" height={14} width={50} />
      </div>
    </div>
  );
}

// ============================================
// Recommendations Panel Component
// ============================================

interface RecommendationsPanelProps {
  recommendations: ResultCardType[];
  loading: boolean;
  selectedItemId: string | null;
  onViewArticle: (itemId: string) => void;
}

export function RecommendationsPanel({
  recommendations,
  loading,
  selectedItemId,
  onViewArticle,
}: RecommendationsPanelProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-aws-dark text-white">
        <div className="flex items-center gap-2">
          <span className="text-xl">💡</span>
          <h2 className="font-semibold">Recommendations</h2>
        </div>
        <p className="text-xs text-gray-300 mt-1">
          Related content based on your viewing
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <RecommendationCardSkeleton key={i} />
            ))}
          </div>
        ) : selectedItemId && recommendations.length > 0 ? (
          <div className="p-4 space-y-3">
            <p className="text-xs text-gray-500 mb-2">
              Based on your current article, you might also like:
            </p>
            {recommendations.slice(0, 5).map((rec, index) => (
              <RecommendationCard
                key={rec.url || index}
                recommendation={rec}
                onClick={() => onViewArticle(rec.url)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl">📚</span>
            </div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">
              No recommendations yet
            </h3>
            <p className="text-xs text-gray-500">
              Click on an article to see related content recommendations
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Recommendation Card (compact version of ResultCard)
interface RecommendationCardProps {
  recommendation: ResultCardType;
  onClick: () => void;
}

function RecommendationCard({ recommendation, onClick }: RecommendationCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-aws-orange hover:bg-orange-50 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 group-hover:text-aws-orange transition-colors line-clamp-2">
            {recommendation.title}
          </h4>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            <SourceIcon source={recommendation.source} />
            <span>{recommendation.estimatedReadTime} min</span>
            <span>•</span>
            <DifficultyDot level={recommendation.difficultyLevel} />
          </div>
          {recommendation.keyTakeaways && recommendation.keyTakeaways.length > 0 && (
            <p className="text-xs text-gray-600 mt-2 line-clamp-2">
              {recommendation.keyTakeaways[0]}
            </p>
          )}
        </div>
        <QualityScoreBadge score={recommendation.qualityScore} size="sm" />
      </div>
    </button>
  );
}

// Source Icon
function SourceIcon({ source }: { source: string }) {
  const icons: Record<string, string> = {
    aws_blog: '🔶',
    reddit: '🔴',
    hackernews: '🟠',
    medium: '🟢',
    devto: '🟣',
    youtube: '▶️',
    github: '⚫',
    twitter: '🔵',
    aws_docs: '📄',
    aws_whitepapers: '📑',
  };
  return <span>{icons[source] || '📄'}</span>;
}

// Difficulty Dot
function DifficultyDot({ level }: { level: string }) {
  const colors: Record<string, string> = {
    beginner: 'bg-green-500',
    intermediate: 'bg-yellow-500',
    advanced: 'bg-red-500',
  };
  const labels: Record<string, string> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
  };
  return (
    <span className="flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full ${colors[level] || 'bg-gray-400'}`} />
      <span>{labels[level] || level}</span>
    </span>
  );
}

// Recommendation Card Skeleton
function RecommendationCardSkeleton() {
  return (
    <div className="p-3 rounded-lg border border-gray-200 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <Skeleton variant="text" height={16} className="w-full" />
          <Skeleton variant="text" height={16} className="w-3/4 mt-1" />
          <div className="flex gap-2 mt-2">
            <Skeleton variant="text" height={12} width={40} />
            <Skeleton variant="text" height={12} width={50} />
          </div>
        </div>
        <Skeleton variant="circular" width={32} height={32} />
      </div>
    </div>
  );
}
