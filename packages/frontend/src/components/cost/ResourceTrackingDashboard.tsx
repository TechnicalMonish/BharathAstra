'use client';

import { useState, useCallback } from 'react';
import { CodeBlock } from '@/components/CodeBlock';
import { costApi } from '@/lib/api';
import type { TrackingSession, TrackedResource, CleanupScript } from '@shared/types/cost-predictor';
import { ResourceStatus, SessionStatus, CleanupMethod } from '@shared/types/enums';

interface ResourceTrackingDashboardProps {
  sessions: TrackingSession[];
  loading?: boolean;
  onRefresh: () => void;
}

export function ResourceTrackingDashboard({
  sessions,
  loading = false,
  onRefresh,
}: ResourceTrackingDashboardProps) {
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [cleanupScript, setCleanupScript] = useState<{ sessionId: string; script: CleanupScript } | null>(null);
  const [loadingCleanup, setLoadingCleanup] = useState<string | null>(null);

  const handleToggleSession = useCallback((sessionId: string) => {
    setExpandedSession((prev) => (prev === sessionId ? null : sessionId));
  }, []);

  const handleGenerateCleanup = useCallback(async (sessionId: string) => {
    setLoadingCleanup(sessionId);
    try {
      const response = await costApi.getCleanupScript(sessionId) as { cleanupScript?: CleanupScript };
      if (response.cleanupScript) {
        setCleanupScript({ sessionId, script: response.cleanupScript });
      } else {
        // Use mock data if no script returned
        setCleanupScript({
          sessionId,
          script: getMockCleanupScript(),
        });
      }
    } catch (error) {
      console.error('Failed to generate cleanup script:', error);
      setCleanupScript({
        sessionId,
        script: getMockCleanupScript(),
      });
    } finally {
      setLoadingCleanup(null);
    }
  }, []);

  const handleCloseCleanup = useCallback(() => {
    setCleanupScript(null);
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <SessionCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-1">No active tracking sessions</h3>
        <p className="text-gray-500 mb-4">Start a workshop to begin tracking your AWS resources.</p>
        <button onClick={onRefresh} className="btn-secondary">
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-aws-dark">Active Tracking Sessions</h2>
          <p className="text-sm text-gray-500">{sessions.length} session(s) with deployed resources</p>
        </div>
        <button onClick={onRefresh} className="btn-secondary text-sm">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Session Cards */}
      {sessions.map((session) => (
        <SessionCard
          key={session.sessionId}
          session={session}
          isExpanded={expandedSession === session.sessionId}
          onToggle={() => handleToggleSession(session.sessionId)}
          onGenerateCleanup={() => handleGenerateCleanup(session.sessionId)}
          loadingCleanup={loadingCleanup === session.sessionId}
        />
      ))}

      {/* Cleanup Script Modal */}
      {cleanupScript && (
        <CleanupScriptModal
          script={cleanupScript.script}
          onClose={handleCloseCleanup}
        />
      )}
    </div>
  );
}

// Session Card Component
function SessionCard({
  session,
  isExpanded,
  onToggle,
  onGenerateCleanup,
  loadingCleanup,
}: {
  session: TrackingSession;
  isExpanded: boolean;
  onToggle: () => void;
  onGenerateCleanup: () => void;
  loadingCleanup: boolean;
}) {
  const activeResources = session.resources.filter((r) => r.status === ResourceStatus.RUNNING);
  const longRunningResources = session.resources.filter((r) => {
    if (r.status !== ResourceStatus.RUNNING) return false;
    const hoursRunning = (Date.now() - new Date(r.deployedAt).getTime()) / (1000 * 60 * 60);
    return hoursRunning > 24;
  });

  const hasWarnings = longRunningResources.length > 0;

  return (
    <div className={`bg-white rounded-lg border ${hasWarnings ? 'border-yellow-300' : 'border-gray-200'}`}>
      {/* Session Header */}
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-start justify-between text-left"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-aws-dark">{session.workshopTitle}</h3>
            <SessionStatusBadge status={session.status} />
          </div>
          <p className="text-sm text-gray-500">
            Started {formatDate(session.startedAt)} • {activeResources.length} active resource(s)
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Cost Summary */}
          <div className="text-right">
            <p className="text-sm text-gray-500">Accumulated</p>
            <p className="font-semibold text-aws-dark">${session.accumulatedCost.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Projected/mo</p>
            <p className="font-semibold text-yellow-600">${session.projectedMonthlyCost.toFixed(2)}</p>
          </div>

          {/* Expand Icon */}
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Warning Banner */}
      {hasWarnings && (
        <div className="px-4 pb-2">
          <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-yellow-800">
              {longRunningResources.length} resource(s) running for more than 24 hours
            </p>
          </div>
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-200">
          {/* Resource List */}
          <div className="p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Resources</h4>
            <div className="space-y-2">
              {session.resources.map((resource, index) => (
                <ResourceRow key={index} resource={resource} />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Last updated: {session.lastUpdated ? formatDate(session.lastUpdated) : 'N/A'}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onGenerateCleanup();
              }}
              disabled={loadingCleanup}
              className="btn-primary text-sm"
            >
              {loadingCleanup ? (
                <>
                  <svg className="w-4 h-4 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Generate Cleanup Script
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Resource Row Component
function ResourceRow({ resource }: { resource: TrackedResource }) {
  const hoursRunning = resource.status === ResourceStatus.RUNNING
    ? (Date.now() - new Date(resource.deployedAt).getTime()) / (1000 * 60 * 60)
    : 0;
  const isLongRunning = hoursRunning > 24;

  return (
    <div className={`p-3 rounded-lg border ${isLongRunning ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-aws-dark">
              {getResourceTypeName(resource.resource.resourceType)}
            </p>
            <ResourceStatusBadge status={resource.status} />
            {isLongRunning && (
              <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                {Math.floor(hoursRunning)}h running
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">{resource.resource.resourceId}</p>
        </div>

        <div className="text-right">
          <p className="text-sm font-medium">${resource.accumulatedCost.toFixed(2)}</p>
          <p className="text-xs text-gray-500">accumulated</p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
        <span>Deployed: {formatDate(resource.deployedAt)}</span>
        {resource.deletedAt && <span>Deleted: {formatDate(resource.deletedAt)}</span>}
      </div>
    </div>
  );
}

// Cleanup Script Modal
function CleanupScriptModal({
  script,
  onClose,
}: {
  script: CleanupScript;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-aws-dark">Cleanup Script</h2>
            <p className="text-sm text-gray-500">
              Method: {getCleanupMethodName(script.method)} • Est. time: {script.estimatedTime} min
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Cost Savings */}
        <div className="p-4 bg-green-50 border-b border-green-200">
          <h3 className="text-sm font-medium text-green-800 mb-2">Cost Savings from Cleanup</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-green-600">Daily Savings</p>
              <p className="text-lg font-bold text-green-700">${script.costSavings.dailySavings.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-green-600">Monthly Savings</p>
              <p className="text-lg font-bold text-green-700">${script.costSavings.monthlySavings.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-green-600">Total Accumulated</p>
              <p className="text-lg font-bold text-green-700">${script.costSavings.totalAccumulatedCost.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Script Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <CodeBlock
            code={script.script}
            language="bash"
            title="cleanup.sh"
            showLineNumbers
          />

          {/* Verification Commands */}
          {script.verificationCommands.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Verification Commands</h4>
              <CodeBlock
                code={script.verificationCommands.join('\n')}
                language="bash"
                title="verify.sh"
                showLineNumbers={false}
              />
            </div>
          )}

          {/* Warnings */}
          {script.warnings.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-yellow-700 mb-2">Warnings</h4>
              <ul className="space-y-1">
                {script.warnings.map((warning, index) => (
                  <li key={index} className="text-sm text-yellow-700 flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="btn-primary w-full">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Status Badge Components
function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const config: Record<SessionStatus, { bg: string; text: string; label: string }> = {
    [SessionStatus.ACTIVE]: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
    [SessionStatus.COMPLETED]: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Completed' },
    [SessionStatus.ABANDONED]: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Abandoned' },
    [SessionStatus.PARTIALLY_DELETED]: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Partially Deleted' },
  };

  const { bg, text, label } = config[status] || config[SessionStatus.ACTIVE];

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${bg} ${text}`}>
      {label}
    </span>
  );
}

function ResourceStatusBadge({ status }: { status: ResourceStatus }) {
  const config: Record<ResourceStatus, { bg: string; text: string; label: string }> = {
    [ResourceStatus.RUNNING]: { bg: 'bg-green-100', text: 'text-green-800', label: 'Running' },
    [ResourceStatus.STOPPED]: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Stopped' },
    [ResourceStatus.DELETED]: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Deleted' },
    [ResourceStatus.UNKNOWN]: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Unknown' },
  };

  const { bg, text, label } = config[status] || config[ResourceStatus.RUNNING];

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${bg} ${text}`}>
      {label}
    </span>
  );
}

// Skeleton Loader
function SessionCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="h-5 bg-gray-200 rounded w-48 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-32" />
        </div>
        <div className="flex gap-4">
          <div className="h-10 w-20 bg-gray-200 rounded" />
          <div className="h-10 w-20 bg-gray-200 rounded" />
        </div>
      </div>
    </div>
  );
}

// Helper functions
function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getResourceTypeName(resourceType: string): string {
  const typeMap: Record<string, string> = {
    'AWS::Lambda::Function': 'Lambda Function',
    'AWS::DynamoDB::Table': 'DynamoDB Table',
    'AWS::EC2::Instance': 'EC2 Instance',
    'AWS::EC2::NatGateway': 'NAT Gateway',
    'AWS::ElasticLoadBalancingV2::LoadBalancer': 'Application Load Balancer',
    'AWS::RDS::DBInstance': 'RDS Database',
    'AWS::S3::Bucket': 'S3 Bucket',
    'AWS::ECS::Cluster': 'ECS Cluster',
    'AWS::EKS::Cluster': 'EKS Cluster',
  };

  return typeMap[resourceType] || resourceType.split('::').pop() || resourceType;
}

function getCleanupMethodName(method: CleanupMethod): string {
  switch (method) {
    case CleanupMethod.AWS_CLI:
      return 'AWS CLI';
    case CleanupMethod.CLOUDFORMATION:
      return 'CloudFormation';
    case CleanupMethod.TERRAFORM:
      return 'Terraform';
    default:
      return 'Unknown';
  }
}

function getMockCleanupScript(): CleanupScript {
  return {
    method: CleanupMethod.AWS_CLI,
    script: `#!/bin/bash
# Cleanup script for workshop resources
# Generated by AWS Cost Predictor

set -e

echo "Starting cleanup..."

# Delete NAT Gateway
aws ec2 delete-nat-gateway --nat-gateway-id nat-0123456789abcdef0

# Wait for NAT Gateway deletion
echo "Waiting for NAT Gateway deletion..."
aws ec2 wait nat-gateway-deleted --nat-gateway-ids nat-0123456789abcdef0

# Delete Application Load Balancer
aws elbv2 delete-load-balancer --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/1234567890123456

# Delete RDS Instance
aws rds delete-db-instance --db-instance-identifier my-db-instance --skip-final-snapshot

# Delete Lambda Function
aws lambda delete-function --function-name my-lambda-function

# Delete DynamoDB Table
aws dynamodb delete-table --table-name my-table

echo "Cleanup complete!"`,
    verificationCommands: [
      'aws ec2 describe-nat-gateways --nat-gateway-ids nat-0123456789abcdef0',
      'aws elbv2 describe-load-balancers --names my-alb',
      'aws rds describe-db-instances --db-instance-identifier my-db-instance',
    ],
    estimatedTime: 10,
    costSavings: {
      dailySavings: 3.60,
      monthlySavings: 108.00,
      totalAccumulatedCost: 15.50,
    },
    warnings: [
      'Ensure no other resources depend on the NAT Gateway before deletion',
      'RDS deletion is irreversible - make sure you have backups if needed',
    ],
  };
}
