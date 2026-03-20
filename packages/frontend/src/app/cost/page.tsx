'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { SearchInput, SearchSuggestion } from '@/components';
import { CostBadge, getCostLevelFromAmount } from '@/components/CostBadge';
import { costApi } from '@/lib/api';
import type { WorkshopInfo, CostAnalysis, TrackingSession, CostNotification } from '@shared/types/cost-predictor';
import { CostRange, DifficultyLevel } from '@shared/types/enums';
import { CostReportDisplay } from '@/components/cost/CostReportDisplay';
import { CustomTutorialScanner } from '@/components/cost/CustomTutorialScanner';
import { ResourceTrackingDashboard } from '@/components/cost/ResourceTrackingDashboard';
import { NotificationCenter } from '@/components/cost/NotificationCenter';

// Workshop categories for filtering
const WORKSHOP_CATEGORIES = [
  'All',
  'Serverless',
  'Containers',
  'Machine Learning',
  'Security',
  'Networking',
  'Database',
  'Analytics',
  'DevOps',
  'Storage',
] as const;

type WorkshopCategory = typeof WORKSHOP_CATEGORIES[number];

// Tab types for the main view
type TabType = 'workshops' | 'tracking' | 'notifications';

// Extended workshop info with cost analysis
interface WorkshopWithCost extends WorkshopInfo {
  costAnalysis?: CostAnalysis;
}

export default function CostPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('workshops');

  // Workshop list state
  const [workshops, setWorkshops] = useState<WorkshopWithCost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<WorkshopCategory>('All');

  // Selected workshop for cost report
  const [selectedWorkshop, setSelectedWorkshop] = useState<WorkshopWithCost | null>(null);
  const [costReport, setCostReport] = useState<CostAnalysis | null>(null);
  const [loadingCostReport, setLoadingCostReport] = useState(false);

  // Custom tutorial scanning
  const [showCustomScanner, setShowCustomScanner] = useState(false);
  const [customCostReport, setCustomCostReport] = useState<{ title: string; url?: string; costAnalysis: CostAnalysis } | null>(null);

  // Tracking sessions
  const [trackingSessions, setTrackingSessions] = useState<TrackingSession[]>([]);
  const [loadingTracking, setLoadingTracking] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState<CostNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // Search suggestions
  const searchSuggestions: SearchSuggestion[] = useMemo(() => [
    { id: '1', text: 'Lambda', category: 'Serverless' },
    { id: '2', text: 'ECS', category: 'Containers' },
    { id: '3', text: 'SageMaker', category: 'Machine Learning' },
    { id: '4', text: 'IAM', category: 'Security' },
    { id: '5', text: 'VPC', category: 'Networking' },
    { id: '6', text: 'DynamoDB', category: 'Database' },
    { id: '7', text: 'Kinesis', category: 'Analytics' },
    { id: '8', text: 'CodePipeline', category: 'DevOps' },
    { id: '9', text: 'S3', category: 'Storage' },
    { id: '10', text: 'EKS', category: 'Containers' },
  ], []);

  // Load workshops on mount
  useEffect(() => {
    loadWorkshops();
  }, []);

  // Load tracking sessions when tab changes
  useEffect(() => {
    if (activeTab === 'tracking') {
      loadTrackingSessions();
    } else if (activeTab === 'notifications') {
      loadNotifications();
    }
  }, [activeTab]);

  const loadWorkshops = async () => {
    setIsLoading(true);
    try {
      const response = await costApi.listWorkshops();
      setWorkshops((response.workshops || []) as WorkshopWithCost[]);
    } catch (error) {
      console.error('Failed to load workshops:', error);
      setWorkshops(getMockWorkshops());
    } finally {
      setIsLoading(false);
    }
  };

  const loadTrackingSessions = async () => {
    setLoadingTracking(true);
    try {
      const response = await costApi.getTracking();
      setTrackingSessions((response.sessions || []) as TrackingSession[]);
    } catch (error) {
      console.error('Failed to load tracking sessions:', error);
      setTrackingSessions([]);
    } finally {
      setLoadingTracking(false);
    }
  };

  const loadNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const response = await costApi.getNotifications();
      setNotifications((response.notifications || []) as CostNotification[]);
    } catch (error) {
      console.error('Failed to load notifications:', error);
      setNotifications([]);
    } finally {
      setLoadingNotifications(false);
    }
  };

  // Filter workshops by search and category
  const filteredWorkshops = useMemo(() => {
    return workshops.filter((workshop) => {
      const matchesSearch = !searchQuery ||
        workshop.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        workshop.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = selectedCategory === 'All' ||
        workshop.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [workshops, searchQuery, selectedCategory]);

  // Handle workshop selection for cost report
  const handleWorkshopSelect = useCallback(async (workshop: WorkshopWithCost) => {
    setSelectedWorkshop(workshop);
    setLoadingCostReport(true);
    setCustomCostReport(null);

    try {
      const response = await costApi.getWorkshop(workshop.workshopId);
      const workshopData = response.workshop as { costAnalysis?: CostAnalysis };
      setCostReport(workshopData?.costAnalysis || null);
    } catch (error) {
      console.error('Failed to load cost report:', error);
      setCostReport(getMockCostAnalysis());
    } finally {
      setLoadingCostReport(false);
    }
  }, []);

  // Handle custom tutorial scan
  const handleCustomScan = useCallback(async (url: string) => {
    setLoadingCostReport(true);
    setSelectedWorkshop(null);
    setCostReport(null);

    try {
      const response = await costApi.scan(url) as { title?: string; url?: string; costAnalysis?: CostAnalysis };
      setCustomCostReport({
        title: response.title || 'Custom Tutorial',
        url: response.url,
        costAnalysis: response.costAnalysis || getMockCostAnalysis(),
      });
    } catch (error) {
      console.error('Failed to scan tutorial:', error);
      setCustomCostReport({
        title: 'Custom Tutorial',
        url,
        costAnalysis: getMockCostAnalysis(),
      });
    } finally {
      setLoadingCostReport(false);
      setShowCustomScanner(false);
    }
  }, []);

  // Handle notification dismiss
  const handleDismissNotification = useCallback(async (notificationId: string) => {
    try {
      await costApi.dismissNotification(notificationId);
      setNotifications((prev) => prev.filter((n) => n.notificationId !== notificationId));
    } catch (error) {
      console.error('Failed to dismiss notification:', error);
    }
  }, []);

  // Handle search
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // Handle suggestion select
  const handleSuggestionSelect = useCallback((suggestion: SearchSuggestion) => {
    setSearchQuery(suggestion.text);
  }, []);

  // Close cost report
  const handleCloseCostReport = useCallback(() => {
    setSelectedWorkshop(null);
    setCostReport(null);
    setCustomCostReport(null);
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left Sidebar - Category Tabs */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-aws-dark">Categories</h2>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {WORKSHOP_CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selectedCategory === category
                  ? 'bg-aws-orange text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {category}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 bg-gray-50 overflow-hidden flex flex-col">
        {/* Header with Tabs */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-aws-dark flex items-center gap-2">
              <span>💰</span>
              Cost Predictor
            </h1>
            <button
              onClick={() => setShowCustomScanner(true)}
              className="btn-primary text-sm"
            >
              Scan Custom Tutorial
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex space-x-1 border-b border-gray-200 -mb-4">
            <TabButton
              active={activeTab === 'workshops'}
              onClick={() => setActiveTab('workshops')}
              label="Workshops"
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              }
            />
            <TabButton
              active={activeTab === 'tracking'}
              onClick={() => setActiveTab('tracking')}
              label="Resource Tracking"
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
              badge={trackingSessions.length > 0 ? trackingSessions.length : undefined}
            />
            <TabButton
              active={activeTab === 'notifications'}
              onClick={() => setActiveTab('notifications')}
              label="Notifications"
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              }
              badge={notifications.length > 0 ? notifications.length : undefined}
            />
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'workshops' && (
            <WorkshopsTab
              workshops={filteredWorkshops}
              isLoading={isLoading}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSearch={handleSearch}
              searchSuggestions={searchSuggestions}
              onSuggestionSelect={handleSuggestionSelect}
              onWorkshopSelect={handleWorkshopSelect}
              selectedWorkshop={selectedWorkshop}
            />
          )}

          {activeTab === 'tracking' && (
            <ResourceTrackingDashboard
              sessions={trackingSessions}
              loading={loadingTracking}
              onRefresh={loadTrackingSessions}
            />
          )}

          {activeTab === 'notifications' && (
            <NotificationCenter
              notifications={notifications}
              loading={loadingNotifications}
              onDismiss={handleDismissNotification}
              onRefresh={loadNotifications}
            />
          )}
        </div>
      </main>

      {/* Right Panel - Cost Report */}
      {(selectedWorkshop || customCostReport) && (
        <aside className="w-[480px] bg-white border-l border-gray-200 flex flex-col overflow-hidden">
          <CostReportDisplay
            workshop={selectedWorkshop}
            costAnalysis={costReport || customCostReport?.costAnalysis || null}
            customTitle={customCostReport?.title}
            customUrl={customCostReport?.url}
            loading={loadingCostReport}
            onClose={handleCloseCostReport}
          />
        </aside>
      )}

      {/* Custom Tutorial Scanner Modal */}
      {showCustomScanner && (
        <CustomTutorialScanner
          onScan={handleCustomScan}
          onClose={() => setShowCustomScanner(false)}
          loading={loadingCostReport}
        />
      )}
    </div>
  );
}

// Tab Button Component
function TabButton({
  active,
  onClick,
  label,
  icon,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-aws-orange text-aws-orange'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {icon}
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-aws-orange text-white rounded-full">
          {badge}
        </span>
      )}
    </button>
  );
}

// Workshops Tab Component
function WorkshopsTab({
  workshops,
  isLoading,
  searchQuery,
  onSearchChange,
  onSearch,
  searchSuggestions,
  onSuggestionSelect,
  onWorkshopSelect,
  selectedWorkshop,
}: {
  workshops: WorkshopWithCost[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearch: (value: string) => void;
  searchSuggestions: SearchSuggestion[];
  onSuggestionSelect: (suggestion: SearchSuggestion) => void;
  onWorkshopSelect: (workshop: WorkshopWithCost) => void;
  selectedWorkshop: WorkshopWithCost | null;
}) {
  return (
    <div>
      {/* Search Bar */}
      <div className="mb-6">
        <SearchInput
          value={searchQuery}
          onChange={onSearchChange}
          onSubmit={onSearch}
          suggestions={searchSuggestions}
          onSuggestionSelect={onSuggestionSelect}
          placeholder="Search workshops by name or description..."
          className="w-full max-w-xl"
        />
      </div>

      {/* Workshop Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <WorkshopCardSkeleton key={i} />
          ))}
        </div>
      ) : workshops.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workshops.map((workshop) => (
            <WorkshopCard
              key={workshop.workshopId}
              workshop={workshop}
              onClick={() => onWorkshopSelect(workshop)}
              isSelected={selectedWorkshop?.workshopId === workshop.workshopId}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No workshops found</h3>
          <p className="text-gray-500">Try adjusting your search or category filter.</p>
        </div>
      )}
    </div>
  );
}

// Workshop Card Component
function WorkshopCard({
  workshop,
  onClick,
  isSelected,
}: {
  workshop: WorkshopWithCost;
  onClick: () => void;
  isSelected: boolean;
}) {
  const costLevel = getCostLevelFromCostRange(workshop.costBadge);
  const difficultyColor = getDifficultyColor(workshop.difficulty);

  return (
    <div
      className={`text-left p-4 bg-white rounded-lg border-2 transition-all hover:shadow-md cursor-pointer ${
        isSelected ? 'border-aws-orange shadow-md' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div onClick={onClick}>
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-aws-dark line-clamp-2 flex-1 mr-2">
            {workshop.title}
          </h3>
          <CostBadge level={costLevel} showAmount={false} size="sm" />
        </div>

        <p className="text-sm text-gray-600 line-clamp-2 mb-3">
          {workshop.description}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
            {workshop.category}
          </span>
          <span className={`text-xs px-2 py-1 rounded ${difficultyColor}`}>
            {workshop.difficulty}
          </span>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {workshop.estimatedDuration} min
          </span>
        </div>

        {workshop.sourceUrl && (
          <a
            href={workshop.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-aws-orange hover:text-orange-700 flex items-center gap-1 shrink-0"
            title="Open official workshop"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Visit
          </a>
        )}
      </div>
    </div>
  );
}

// Workshop Card Skeleton
function WorkshopCardSkeleton() {
  return (
    <div className="p-4 bg-white rounded-lg border border-gray-200 animate-pulse">
      <div className="flex items-start justify-between mb-2">
        <div className="h-5 bg-gray-200 rounded w-3/4" />
        <div className="h-5 w-16 bg-gray-200 rounded-full" />
      </div>
      <div className="space-y-2 mb-3">
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-2/3" />
      </div>
      <div className="flex gap-2">
        <div className="h-6 w-20 bg-gray-200 rounded" />
        <div className="h-6 w-16 bg-gray-200 rounded" />
        <div className="h-6 w-16 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

// Helper functions
function getCostLevelFromCostRange(costRange: CostRange): 'free' | 'low' | 'medium' | 'high' {
  switch (costRange) {
    case CostRange.FREE:
      return 'free';
    case CostRange.LOW:
      return 'low';
    case CostRange.MEDIUM:
      return 'medium';
    case CostRange.HIGH:
      return 'high';
    default:
      return 'medium';
  }
}

function getDifficultyColor(difficulty: DifficultyLevel): string {
  switch (difficulty) {
    case DifficultyLevel.BEGINNER:
      return 'bg-green-100 text-green-800';
    case DifficultyLevel.INTERMEDIATE:
      return 'bg-yellow-100 text-yellow-800';
    case DifficultyLevel.ADVANCED:
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}


// Mock data functions
function getMockWorkshops(): WorkshopWithCost[] {
  return [
    {
      workshopId: 'serverless-web-app',
      title: 'Build a Serverless Web Application',
      description: 'Learn how to build a serverless web application using AWS Lambda, API Gateway, DynamoDB, and S3.',
      category: 'Serverless',
      difficulty: DifficultyLevel.BEGINNER,
      estimatedDuration: 120,
      costBadge: CostRange.FREE,
      lastUpdated: new Date(),
    },
    {
      workshopId: 'eks-workshop',
      title: 'Amazon EKS Workshop',
      description: 'Deploy and manage containerized applications on Amazon Elastic Kubernetes Service.',
      category: 'Containers',
      difficulty: DifficultyLevel.INTERMEDIATE,
      estimatedDuration: 180,
      costBadge: CostRange.MEDIUM,
      lastUpdated: new Date(),
    },
    {
      workshopId: 'sagemaker-ml',
      title: 'Machine Learning with Amazon SageMaker',
      description: 'Build, train, and deploy machine learning models using Amazon SageMaker.',
      category: 'Machine Learning',
      difficulty: DifficultyLevel.ADVANCED,
      estimatedDuration: 240,
      costBadge: CostRange.HIGH,
      lastUpdated: new Date(),
    },
    {
      workshopId: 'iam-security',
      title: 'AWS IAM Security Best Practices',
      description: 'Learn IAM best practices for securing your AWS environment.',
      category: 'Security',
      difficulty: DifficultyLevel.INTERMEDIATE,
      estimatedDuration: 90,
      costBadge: CostRange.FREE,
      lastUpdated: new Date(),
    },
    {
      workshopId: 'vpc-networking',
      title: 'Advanced VPC Networking',
      description: 'Design and implement complex VPC architectures with Transit Gateway and PrivateLink.',
      category: 'Networking',
      difficulty: DifficultyLevel.ADVANCED,
      estimatedDuration: 150,
      costBadge: CostRange.LOW,
      lastUpdated: new Date(),
    },
    {
      workshopId: 'dynamodb-deep-dive',
      title: 'DynamoDB Deep Dive',
      description: 'Master DynamoDB data modeling, performance optimization, and advanced features.',
      category: 'Database',
      difficulty: DifficultyLevel.INTERMEDIATE,
      estimatedDuration: 120,
      costBadge: CostRange.LOW,
      lastUpdated: new Date(),
    },
  ];
}

function getMockCostAnalysis(): CostAnalysis {
  return {
    totalCosts: {
      hourlyRate: 0.15,
      dailyCost: 3.60,
      monthlyCost: 108.00,
      scenarios: [
        { name: 'After workshop', totalCost: 0.50, description: 'Cost if deleted immediately after completing the workshop' },
        { name: '1 day', totalCost: 3.60, description: 'Cost if left running for 1 day' },
        { name: '1 month', totalCost: 108.00, description: 'Cost if left running for 1 month' },
      ],
    },
    resources: [
      {
        resourceId: 'lambda-1',
        resourceType: 'AWS::Lambda::Function',
        configuration: { region: 'us-east-1', memorySize: 256 },
        pricing: { hourlyRate: 0, dailyCost: 0, monthlyCost: 0, pricingModel: 'per-request' },
        freeTierEligible: true,
        deploymentMethod: 'CloudFormation',
      },
      {
        resourceId: 'dynamodb-1',
        resourceType: 'AWS::DynamoDB::Table',
        configuration: { region: 'us-east-1', billingMode: 'PAY_PER_REQUEST' },
        pricing: { hourlyRate: 0, dailyCost: 0, monthlyCost: 0, pricingModel: 'on-demand' },
        freeTierEligible: true,
        deploymentMethod: 'CloudFormation',
      },
      {
        resourceId: 'nat-gateway-1',
        resourceType: 'AWS::EC2::NatGateway',
        configuration: { region: 'us-east-1' },
        pricing: { hourlyRate: 0.045, dailyCost: 1.08, monthlyCost: 32.40, pricingModel: 'hourly' },
        freeTierEligible: false,
        deploymentMethod: 'CloudFormation',
      },
      {
        resourceId: 'alb-1',
        resourceType: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
        configuration: { region: 'us-east-1', type: 'application' },
        pricing: { hourlyRate: 0.0225, dailyCost: 0.54, monthlyCost: 16.20, pricingModel: 'hourly' },
        freeTierEligible: false,
        deploymentMethod: 'CloudFormation',
      },
      {
        resourceId: 'rds-1',
        resourceType: 'AWS::RDS::DBInstance',
        configuration: { region: 'us-east-1', instanceClass: 'db.t3.micro', multiAZ: false },
        pricing: { hourlyRate: 0.017, dailyCost: 0.41, monthlyCost: 12.24, pricingModel: 'hourly' },
        freeTierEligible: true,
        deploymentMethod: 'CloudFormation',
      },
    ],
    hiddenCosts: [
      {
        resource: {
          resourceId: 'nat-gateway-1',
          resourceType: 'AWS::EC2::NatGateway',
          configuration: { region: 'us-east-1' },
          pricing: { hourlyRate: 0.045, dailyCost: 1.08, monthlyCost: 32.40, pricingModel: 'hourly' },
          freeTierEligible: false,
          deploymentMethod: 'CloudFormation',
        },
        reason: 'NAT Gateway not mentioned in tutorial but required for private subnet internet access',
        impact: 32.40,
        severity: 'high',
      },
    ],
    freeTierEligible: false,
    warnings: [
      {
        message: 'NAT Gateway charges $0.045/hour even when idle',
        affectedResources: ['nat-gateway-1'],
        severity: 'warning',
      },
    ],
    generatedAt: new Date(),
  };
}
