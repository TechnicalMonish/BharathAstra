'use client';

import { useState } from 'react';
import { QualityScoreBadge } from './QualityScoreBadge';
import { Skeleton } from './LoadingSpinner';
import type { ResultCard as ResultCardType, UserExperience, ConflictWarning as ConflictWarningType } from '@shared/types/blog-aggregator';
import type { ScoreBreakdown } from '@shared/types/common';
import { ContentSource, DifficultyLevel, TrendStatus, ConflictSeverity } from '@shared/types/enums';

interface ResultCardProps {
  result: ResultCardType;
  onViewArticle?: () => void;
}

export function ResultCard({ result, onViewArticle }: ResultCardProps) {
  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);

  return (
    <div className="card hover:shadow-lg transition-shadow">
      {/* Header Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Title */}
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onViewArticle}
            className="text-lg font-semibold text-aws-dark hover:text-aws-orange transition-colors line-clamp-2"
          >
            {result.title}
          </a>

          {/* Meta Row */}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-gray-500">
            <SourceBadge source={result.source} />
            <span>•</span>
            <span>{formatDate(result.publishDate)}</span>
            <span>•</span>
            <span>{result.estimatedReadTime} min read</span>
            <span>•</span>
            <DifficultyBadge level={result.difficultyLevel} />
          </div>
        </div>

        {/* Quality Score with Tooltip */}
        <div className="relative">
          <button
            onMouseEnter={() => setShowScoreBreakdown(true)}
            onMouseLeave={() => setShowScoreBreakdown(false)}
            onClick={() => setShowScoreBreakdown(!showScoreBreakdown)}
            className="focus:outline-none"
          >
            <QualityScoreBadge score={result.qualityScore} size="lg" />
          </button>

          {/* Score Breakdown Tooltip */}
          {showScoreBreakdown && (
            <ScoreBreakdownTooltip breakdown={result.scoreBreakdown} />
          )}
        </div>
      </div>

      {/* Author Info */}
      <div className="flex items-center gap-2 mt-3">
        <AuthorBadge author={result.author} />
      </div>

      {/* Key Takeaways */}
      {result.keyTakeaways && result.keyTakeaways.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Key Takeaways
          </h4>
          <ul className="space-y-1">
            {result.keyTakeaways.slice(0, 3).map((takeaway, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-aws-orange mt-0.5">•</span>
                <span>{takeaway}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Impact Metrics */}
      {result.impactMetrics && (
        <div className="mt-4 flex flex-wrap gap-2">
          {result.impactMetrics.performanceImprovement && (
            <ImpactBadge
              icon="⚡"
              label="Performance"
              value={result.impactMetrics.performanceImprovement}
              color="green"
            />
          )}
          {result.impactMetrics.costSavings && (
            <ImpactBadge
              icon="💰"
              label="Cost Savings"
              value={result.impactMetrics.costSavings}
              color="blue"
            />
          )}
        </div>
      )}

      {/* Community Validation */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {result.communityValidation.upvotes !== undefined && (
          <ValidationStat icon="👍" value={result.communityValidation.upvotes} label="upvotes" />
        )}
        {result.communityValidation.stars !== undefined && (
          <ValidationStat icon="⭐" value={result.communityValidation.stars} label="stars" />
        )}
        {result.communityValidation.shares !== undefined && (
          <ValidationStat icon="🔗" value={result.communityValidation.shares} label="shares" />
        )}
        {result.communityValidation.comments !== undefined && (
          <ValidationStat icon="💬" value={result.communityValidation.comments} label="comments" />
        )}
      </div>

      {/* User Experience Quotes */}
      {result.userExperiences && result.userExperiences.length > 0 && (
        <div className="mt-4 space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            User Experiences
          </h4>
          {result.userExperiences.slice(0, 2).map((exp, index) => (
            <UserExperienceQuote key={index} experience={exp} />
          ))}
        </div>
      )}

      {/* Prerequisites */}
      {result.prerequisites && result.prerequisites.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Prerequisites
          </h4>
          <div className="flex flex-wrap gap-1">
            {result.prerequisites.map((prereq, index) => {
              // Check if this is an AWS service (common patterns)
              const isAwsService = /^(AWS|Amazon|Lambda|S3|EC2|DynamoDB|RDS|IAM|VPC|CloudFront|API Gateway|SQS|SNS|ECS|EKS|CloudWatch|CloudFormation|Kinesis|SageMaker|Bedrock)/i.test(prereq);
              
              if (isAwsService) {
                return (
                  <a
                    key={index}
                    href={`/docs?service=${encodeURIComponent(prereq)}`}
                    className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded hover:bg-blue-100 transition-colors flex items-center gap-1"
                    title={`View ${prereq} documentation`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {prereq}
                  </a>
                );
              }
              
              return (
                <span
                  key={index}
                  className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded"
                >
                  {prereq}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Conflict Warnings */}
      {result.conflicts && result.conflicts.length > 0 && (
        <div className="mt-4 space-y-2">
          {result.conflicts.map((conflict, index) => (
            <ConflictWarning key={index} conflict={conflict} />
          ))}
        </div>
      )}

      {/* Footer Row - Links and Trend */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
        {/* Related Links */}
        <div className="flex flex-wrap gap-2">
          {result.relatedLinks.map((link, index) => (
            <a
              key={index}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-aws-orange hover:text-orange-600 flex items-center gap-1"
            >
              <LinkIcon type={link.type} />
              {link.title}
            </a>
          ))}
          
          {/* Cross-tool link to Cost Predictor if this looks like a tutorial */}
          {(result.title.toLowerCase().includes('workshop') || 
            result.title.toLowerCase().includes('tutorial') ||
            result.title.toLowerCase().includes('hands-on')) && (
            <a
              href={`/cost?q=${encodeURIComponent(result.title)}`}
              className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
              title="Check costs for this tutorial"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Check Costs
            </a>
          )}
        </div>

        {/* Trend Indicator */}
        {result.trendIndicator && (
          <TrendIndicatorBadge indicator={result.trendIndicator} />
        )}
      </div>
    </div>
  );
}

// Score Breakdown Tooltip
function ScoreBreakdownTooltip({ breakdown }: { breakdown: ScoreBreakdown }) {
  const factors = [
    { label: 'Recency', value: breakdown.recencyPoints, weight: '20%' },
    { label: 'Authority', value: breakdown.authorityPoints, weight: '15%' },
    { label: 'Validation', value: breakdown.validationPoints, weight: '25%' },
    { label: 'Impact', value: breakdown.impactPoints, weight: '25%' },
    { label: 'Quality', value: breakdown.qualityPoints, weight: '15%' },
  ];

  return (
    <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 animate-fade-in">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">Score Breakdown</h4>
      <div className="space-y-2">
        {factors.map((factor) => (
          <div key={factor.label} className="flex items-center justify-between text-xs">
            <span className="text-gray-600">
              {factor.label} <span className="text-gray-400">({factor.weight})</span>
            </span>
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-aws-orange rounded-full"
                  style={{ width: `${(factor.value / 10) * 100}%` }}
                />
              </div>
              <span className="text-gray-700 font-medium w-6 text-right">{factor.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Source Badge
function SourceBadge({ source }: { source: ContentSource }) {
  const sourceConfig: Record<string, { label: string; color: string }> = {
    aws_blog: { label: 'AWS Blog', color: 'bg-orange-100 text-orange-700' },
    reddit: { label: 'Reddit', color: 'bg-red-100 text-red-700' },
    hackernews: { label: 'HackerNews', color: 'bg-yellow-100 text-yellow-700' },
    medium: { label: 'Medium', color: 'bg-green-100 text-green-700' },
    devto: { label: 'Dev.to', color: 'bg-purple-100 text-purple-700' },
    youtube: { label: 'YouTube', color: 'bg-red-100 text-red-700' },
    github: { label: 'GitHub', color: 'bg-gray-100 text-gray-700' },
    twitter: { label: 'StackOverflow', color: 'bg-amber-100 text-amber-700' },
    aws_docs: { label: 'AWS Docs', color: 'bg-orange-100 text-orange-700' },
    aws_whitepapers: { label: 'Whitepaper', color: 'bg-orange-100 text-orange-700' },
  };

  const config = sourceConfig[source] || { label: source, color: 'bg-gray-100 text-gray-700' };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${config.color}`}>
      {config.label}
    </span>
  );
}

// Difficulty Badge
function DifficultyBadge({ level }: { level: DifficultyLevel }) {
  const config: Record<DifficultyLevel, { label: string; color: string }> = {
    beginner: { label: 'Beginner', color: 'text-green-600' },
    intermediate: { label: 'Intermediate', color: 'text-yellow-600' },
    advanced: { label: 'Advanced', color: 'text-red-600' },
  };

  const { label, color } = config[level] || { label: level, color: 'text-gray-600' };

  return <span className={`text-xs font-medium ${color}`}>{label}</span>;
}

// Author Badge
function AuthorBadge({ author }: { author: ResultCardType['author'] }) {
  const authorityConfig: Record<string, { icon: string; color: string }> = {
    aws_hero: { icon: '🏆', color: 'text-yellow-600' },
    aws_employee: { icon: '🔶', color: 'text-orange-600' },
    recognized_contributor: { icon: '✓', color: 'text-blue-600' },
    community_member: { icon: '👤', color: 'text-gray-600' },
    unknown: { icon: '👤', color: 'text-gray-400' },
  };

  const config = authorityConfig[author.authorityLevel] || authorityConfig.unknown;

  return (
    <div className="flex items-center gap-2">
      <span className={config.color}>{config.icon}</span>
      <span className="text-sm font-medium text-gray-700">{author.name}</span>
      {author.credentials && author.credentials.length > 0 && (
        <span className="text-xs text-gray-500">
          ({author.credentials.slice(0, 2).join(', ')})
        </span>
      )}
    </div>
  );
}


// Impact Badge
function ImpactBadge({
  icon,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  color: 'green' | 'blue';
}) {
  const colorClasses = {
    green: 'bg-green-50 border-green-200 text-green-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
  };

  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded border ${colorClasses[color]}`}>
      <span>{icon}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

// Validation Stat
function ValidationStat({
  icon,
  value,
  label,
}: {
  icon: string;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1 text-sm text-gray-600">
      <span>{icon}</span>
      <span className="font-medium">{formatNumber(value)}</span>
      <span className="text-gray-400">{label}</span>
    </div>
  );
}

// User Experience Quote
function UserExperienceQuote({
  experience,
}: {
  experience: UserExperience;
}) {
  const sourceLabels: Record<string, string> = {
    reddit: 'Reddit',
    hackernews: 'HackerNews',
  };

  return (
    <div className="bg-gray-50 rounded-lg p-3 border-l-2 border-aws-orange">
      <p className="text-sm text-gray-700 italic">"{experience.quote}"</p>
      <div className="flex items-center justify-between mt-2">
        <a
          href={experience.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-aws-orange hover:text-orange-600"
        >
          {sourceLabels[experience.source] || experience.source} →
        </a>
        <span className="text-xs text-gray-500">👍 {experience.upvotes}</span>
      </div>
    </div>
  );
}

// Conflict Warning
function ConflictWarning({
  conflict,
}: {
  conflict: ConflictWarningType;
}) {
  const severityConfig: Record<ConflictSeverity, { bg: string; border: string; icon: string }> = {
    high: { bg: 'bg-red-50', border: 'border-red-200', icon: '⚠️' },
    medium: { bg: 'bg-yellow-50', border: 'border-yellow-200', icon: '⚡' },
    low: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'ℹ️' },
  };

  const config = severityConfig[conflict.severity] || severityConfig.medium;

  return (
    <div className={`${config.bg} ${config.border} border rounded-lg p-3`}>
      <div className="flex items-start gap-2">
        <span>{config.icon}</span>
        <div>
          <p className="text-sm font-medium text-gray-700">{conflict.message}</p>
          {conflict.conflictingApproaches && conflict.conflictingApproaches.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Conflicting approaches: {conflict.conflictingApproaches.join(' vs ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Link Icon
function LinkIcon({ type }: { type: 'article' | 'discussion' | 'code' | 'documentation' }) {
  const icons: Record<string, string> = {
    article: '📄',
    discussion: '💬',
    code: '💻',
    documentation: '📚',
  };
  return <span>{icons[type] || '🔗'}</span>;
}

// Trend Indicator Badge
function TrendIndicatorBadge({
  indicator,
}: {
  indicator: ResultCardType['trendIndicator'];
}) {
  if (!indicator) return null;

  const config: Record<TrendStatus, { icon: string; color: string; bg: string }> = {
    rising: { icon: '📈', color: 'text-green-700', bg: 'bg-green-50' },
    stable: { icon: '➡️', color: 'text-gray-700', bg: 'bg-gray-50' },
    declining: { icon: '📉', color: 'text-red-700', bg: 'bg-red-50' },
  };

  const { icon, color, bg } = config[indicator.status] || config.stable;
  const sign = indicator.changePercentage >= 0 ? '+' : '';

  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded ${bg}`}>
      <span>{icon}</span>
      <span className={`text-xs font-medium ${color}`}>
        {sign}{indicator.changePercentage}%
      </span>
    </div>
  );
}

// Skeleton for loading state
export function ResultCardSkeleton() {
  return (
    <div className="card animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <Skeleton variant="text" height={24} className="w-3/4" />
          <div className="flex gap-2 mt-2">
            <Skeleton variant="text" height={16} width={60} />
            <Skeleton variant="text" height={16} width={80} />
            <Skeleton variant="text" height={16} width={70} />
          </div>
        </div>
        <Skeleton variant="circular" width={48} height={48} />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton variant="text" height={14} />
        <Skeleton variant="text" height={14} />
        <Skeleton variant="text" height={14} className="w-2/3" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton variant="rectangular" width={80} height={24} />
        <Skeleton variant="rectangular" width={100} height={24} />
      </div>
    </div>
  );
}

// Helper functions
function formatDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return d.toLocaleDateString();
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}
