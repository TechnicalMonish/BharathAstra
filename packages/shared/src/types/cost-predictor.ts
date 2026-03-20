// Cost Surprise Predictor types

import {
  CleanupMethod,
  CostRange,
  DifficultyLevel,
  NotificationChannel,
  NotificationType,
  ResourceStatus,
  SessionStatus,
  TutorialFormat,
} from "./enums";

// === Workshop ===

export interface WorkshopFilter {
  category?: string;
  searchTerm?: string;
  costRange?: CostRange;
}

export interface WorkshopInfo {
  workshopId: string;
  title: string;
  description: string;
  category: string;
  difficulty: DifficultyLevel;
  estimatedDuration: number;
  costBadge: CostRange;
  lastUpdated: Date;
  sourceUrl?: string;
}

export interface Workshop {
  workshopId?: string;
  info: WorkshopInfo;
  resources: AWSResource[];
  costAnalysis: CostAnalysis;
  instructions: string;
  sourceUrl?: string;
  lastAnalyzed?: Date;
  popularity?: number;
}

// === Cost Analysis ===

export interface Tutorial {
  url?: string;
  content: string;
  format: TutorialFormat;
}

export interface CostScenario {
  name: string;
  totalCost: number;
  description: string;
}

export interface CostBreakdown {
  hourlyRate: number;
  dailyCost: number;
  monthlyCost: number;
  scenarios: CostScenario[];
}

export interface ResourceConfig {
  region: string;
  instanceType?: string;
  storageSize?: number;
  availabilityZones?: number;
  [key: string]: unknown;
}

export interface ResourcePricing {
  hourlyRate: number;
  dailyCost: number;
  monthlyCost: number;
  pricingModel: string;
}

export interface AWSResource {
  resourceId: string;
  resourceType: string;
  configuration: ResourceConfig;
  pricing: ResourcePricing;
  freeTierEligible: boolean;
  deploymentMethod: string;
}

export interface HiddenCost {
  resource: AWSResource;
  reason: string;
  impact: number;
  severity: "high" | "medium" | "low";
}

export interface CostWarning {
  message: string;
  affectedResources: string[];
  severity: "critical" | "warning" | "info";
}

export interface CostAnalysis {
  totalCosts: CostBreakdown;
  resources: AWSResource[];
  hiddenCosts: HiddenCost[];
  freeTierEligible: boolean;
  warnings: CostWarning[];
  generatedAt: Date;
}

// === Resource Tracking ===

export interface TrackedResource {
  resource: AWSResource;
  deployedAt: Date;
  deletedAt?: Date;
  status: ResourceStatus;
  accumulatedCost: number;
}

export interface TrackingSession {
  sessionId: string;
  userId: string;
  workshopId: string;
  workshopTitle: string;
  resources: TrackedResource[];
  startedAt: Date;
  lastUpdated?: Date;
  status: SessionStatus;
  accumulatedCost: number;
  projectedMonthlyCost: number;
  notifications?: CostNotification[];
}

// === Cleanup ===

export interface CostSavings {
  dailySavings: number;
  monthlySavings: number;
  totalAccumulatedCost: number;
}

export interface CleanupScript {
  method: CleanupMethod;
  script: string;
  verificationCommands: string[];
  estimatedTime: number;
  costSavings: CostSavings;
  warnings: string[];
}

// === Notifications ===

export interface NotificationConfig {
  costThreshold: number;
  timeThreshold: number;
  enabled: boolean;
  channels: NotificationChannel[];
}

export interface CostNotification {
  notificationId: string;
  userId: string;
  sessionId: string;
  type: NotificationType;
  message: string;
  severity: "critical" | "warning" | "info";
  actionUrl: string;
  sentAt: Date;
  dismissed: boolean;
}

// === Pricing Database ===

export interface UserCostReport {
  userId: string;
  actualCost: number;
  duration: number;
  region: string;
  reportedAt: Date;
  notes?: string;
}

export interface CostDatabase {
  workshopId: string;
  costAnalysis: CostAnalysis;
  analyzedAt: Date;
  pricingVersion: string;
  userReports: UserCostReport[];
}
