'use client';

import { useMemo } from 'react';
import { getCostLevelFromAmount } from '@/components/CostBadge';
import type { WorkshopInfo, CostAnalysis, AWSResource, HiddenCost } from '@shared/types/cost-predictor';

interface CostReportDisplayProps {
  workshop?: WorkshopInfo | null;
  costAnalysis: CostAnalysis | null;
  customTitle?: string;
  customUrl?: string;
  loading?: boolean;
  onClose: () => void;
  comparisonAnalysis?: CostAnalysis | null;
}

export function CostReportDisplay({
  workshop,
  costAnalysis,
  customTitle,
  customUrl,
  loading = false,
  onClose,
  comparisonAnalysis,
}: CostReportDisplayProps) {
  const title = workshop?.title || customTitle || 'Cost Report';

  // Sort resources by monthly cost (most expensive first)
  const sortedResources = useMemo(() => {
    if (!costAnalysis?.resources) return [];
    return [...costAnalysis.resources].sort(
      (a, b) => b.pricing.monthlyCost - a.pricing.monthlyCost
    );
  }, [costAnalysis?.resources]);

  // Get the most expensive resources (top 3)
  const mostExpensiveResources = useMemo(() => {
    return sortedResources.filter((r) => r.pricing.monthlyCost > 0).slice(0, 3);
  }, [sortedResources]);

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <CostReportHeader title="Loading..." onClose={onClose} />
        <div className="flex-1 p-4 overflow-y-auto">
          <CostReportSkeleton />
        </div>
      </div>
    );
  }

  if (!costAnalysis) {
    return (
      <div className="flex flex-col h-full">
        <CostReportHeader title={title} onClose={onClose} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500">No cost analysis available</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <CostReportHeader title={title} url={customUrl} onClose={onClose} />

      <div className="flex-1 overflow-y-auto">
        {/* Cost Scenarios */}
        <section className="p-4 border-b border-gray-200">
          <h3 className="font-semibold text-aws-dark mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-aws-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Cost Scenarios
          </h3>

          <div className="grid grid-cols-3 gap-3">
            {costAnalysis.totalCosts.scenarios.map((scenario) => (
              <CostScenarioCard
                key={scenario.name}
                name={scenario.name}
                cost={scenario.totalCost}
                description={scenario.description}
              />
            ))}
          </div>

          {comparisonAnalysis && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Comparison</h4>
              <div className="grid grid-cols-3 gap-3">
                {comparisonAnalysis.totalCosts.scenarios.map((scenario) => (
                  <CostScenarioCard
                    key={`comparison-${scenario.name}`}
                    name={scenario.name}
                    cost={scenario.totalCost}
                    description={scenario.description}
                    isComparison
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Hidden Cost Warnings */}
        {costAnalysis.hiddenCosts.length > 0 && (
          <section className="p-4 border-b border-gray-200 bg-red-50">
            <h3 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Hidden Cost Warnings
            </h3>

            <div className="space-y-3">
              {costAnalysis.hiddenCosts.map((hiddenCost, index) => (
                <HiddenCostWarning key={index} hiddenCost={hiddenCost} />
              ))}
            </div>
          </section>
        )}

        {/* Most Expensive Services */}
        {mostExpensiveResources.length > 0 && (
          <section className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-aws-dark mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Most Expensive Services
            </h3>

            <div className="space-y-2">
              {mostExpensiveResources.map((resource) => (
                <ResourceCostRow
                  key={resource.resourceId}
                  resource={resource}
                  isHighlighted
                />
              ))}
            </div>
          </section>
        )}

        {/* All Resources */}
        <section className="p-4">
          <h3 className="font-semibold text-aws-dark mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            All Resources ({sortedResources.length})
          </h3>

          <div className="space-y-2">
            {sortedResources.map((resource) => (
              <ResourceCostRow key={resource.resourceId} resource={resource} />
            ))}
          </div>
        </section>

        {/* Warnings */}
        {costAnalysis.warnings.length > 0 && (
          <section className="p-4 border-t border-gray-200">
            <h3 className="font-semibold text-aws-dark mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Warnings
            </h3>

            <div className="space-y-2">
              {costAnalysis.warnings.map((warning, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg text-sm ${
                    warning.severity === 'critical'
                      ? 'bg-red-50 text-red-800 border border-red-200'
                      : warning.severity === 'warning'
                      ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                      : 'bg-blue-50 text-blue-800 border border-blue-200'
                  }`}
                >
                  {warning.message}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// Header Component
function CostReportHeader({
  title,
  url,
  onClose,
}: {
  title: string;
  url?: string;
  onClose: () => void;
}) {
  return (
    <div className="p-4 border-b border-gray-200 bg-gray-50">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-aws-dark truncate">{title}</h2>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-aws-orange hover:underline truncate block"
            >
              {url}
            </a>
          )}
        </div>
        <button
          onClick={onClose}
          className="ml-2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close cost report"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Cost Scenario Card
function CostScenarioCard({
  name,
  cost,
  description,
  isComparison = false,
}: {
  name: string;
  cost: number;
  description: string;
  isComparison?: boolean;
}) {
  const costLevel = getCostLevelFromAmount(cost);

  return (
    <div
      className={`p-3 rounded-lg border ${
        isComparison ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'
      }`}
      title={description}
    >
      <p className="text-xs text-gray-500 mb-1">{name}</p>
      <p className={`text-lg font-bold ${getCostColor(costLevel)}`}>
        ${cost.toFixed(2)}
      </p>
    </div>
  );
}

// Hidden Cost Warning
function HiddenCostWarning({ hiddenCost }: { hiddenCost: HiddenCost }) {
  return (
    <div className="p-3 bg-white rounded-lg border border-red-200">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-medium text-red-800">
            {getResourceTypeName(hiddenCost.resource.resourceType)}
          </p>
          <p className="text-sm text-red-600">{hiddenCost.reason}</p>
        </div>
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded ${
            hiddenCost.severity === 'high'
              ? 'bg-red-100 text-red-800'
              : hiddenCost.severity === 'medium'
              ? 'bg-yellow-100 text-yellow-800'
              : 'bg-blue-100 text-blue-800'
          }`}
        >
          {hiddenCost.severity}
        </span>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-600">
          Hourly: <span className="font-medium">${hiddenCost.resource.pricing.hourlyRate.toFixed(3)}</span>
        </span>
        <span className="text-gray-600">
          Monthly: <span className="font-medium text-red-700">${hiddenCost.impact.toFixed(2)}</span>
        </span>
      </div>
    </div>
  );
}

// Resource Cost Row
function ResourceCostRow({
  resource,
  isHighlighted = false,
}: {
  resource: AWSResource;
  isHighlighted?: boolean;
}) {
  const resourceName = getResourceTypeName(resource.resourceType);

  return (
    <div
      className={`p-3 rounded-lg border ${
        isHighlighted
          ? 'bg-yellow-50 border-yellow-200'
          : 'bg-white border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-aws-dark truncate">{resourceName}</p>
          <p className="text-xs text-gray-500 truncate">{resource.resourceId}</p>
        </div>
        {resource.freeTierEligible && (
          <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded">
            Free Tier
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-xs text-gray-500">Hourly</p>
          <p className="font-medium">${resource.pricing.hourlyRate.toFixed(3)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Daily</p>
          <p className="font-medium">${resource.pricing.dailyCost.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Monthly</p>
          <p className={`font-medium ${isHighlighted ? 'text-yellow-700' : ''}`}>
            ${resource.pricing.monthlyCost.toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
}

// Skeleton Loader
function CostReportSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-3 bg-gray-100 rounded-lg h-20" />
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-3 bg-gray-100 rounded-lg h-24" />
        ))}
      </div>
    </div>
  );
}

// Helper functions
function getResourceTypeName(resourceType: string): string {
  const typeMap: Record<string, string> = {
    'AWS::Lambda::Function': 'Lambda Function',
    'AWS::DynamoDB::Table': 'DynamoDB Table',
    'AWS::EC2::Instance': 'EC2 Instance',
    'AWS::EC2::NatGateway': 'NAT Gateway',
    'AWS::ElasticLoadBalancingV2::LoadBalancer': 'Application Load Balancer',
    'AWS::RDS::DBInstance': 'RDS Database',
    'AWS::S3::Bucket': 'S3 Bucket',
    'AWS::SQS::Queue': 'SQS Queue',
    'AWS::SNS::Topic': 'SNS Topic',
    'AWS::ECS::Cluster': 'ECS Cluster',
    'AWS::EKS::Cluster': 'EKS Cluster',
    'AWS::ElastiCache::CacheCluster': 'ElastiCache Cluster',
    'AWS::Elasticsearch::Domain': 'OpenSearch Domain',
    'AWS::CloudFront::Distribution': 'CloudFront Distribution',
    'AWS::ApiGateway::RestApi': 'API Gateway',
    'AWS::Kinesis::Stream': 'Kinesis Stream',
  };

  return typeMap[resourceType] || resourceType.split('::').pop() || resourceType;
}

function getCostColor(level: 'free' | 'low' | 'medium' | 'high'): string {
  switch (level) {
    case 'free':
      return 'text-green-600';
    case 'low':
      return 'text-blue-600';
    case 'medium':
      return 'text-yellow-600';
    case 'high':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}
