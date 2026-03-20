/**
 * Cost Predictor API Service
 * Provides type-safe API calls for the Cost Surprise Predictor tool
 * Requirements: 5.5, 11.5, 27.2, 27.3
 */

import { api, ApiError } from './api';
import type {
  WorkshopInfo,
  Workshop,
  CostAnalysis,
  TrackingSession,
  CleanupScript,
  CostNotification,
  NotificationConfig,
  AWSResource,
  WorkshopFilter,
} from '@shared/types/cost-predictor';
import { ResourceStatus } from '@shared/types/enums';
import type { CleanupMethod, TutorialFormat } from '@shared/types/enums';

// === Request Types ===

export interface ScanRequest {
  url?: string;
  workshopId?: string;
  content?: string;
  format?: TutorialFormat;
}

export interface StartTrackingRequest {
  workshopId: string;
  userId?: string;
  resources: AWSResource[];
  workshopTitle?: string;
}

export interface NotificationConfigRequest {
  userId?: string;
  costThreshold?: number;
  timeThreshold?: number;
  enabled?: boolean;
  channels?: string[];
}

// === Response Types ===

export interface WorkshopsResponse {
  workshops: WorkshopInfo[];
  total: number;
}

export interface WorkshopResponse {
  workshop: Workshop;
}

export interface ScanResponse {
  title: string;
  url?: string;
  costAnalysis: CostAnalysis;
}

export interface TrackingResponse {
  sessions: TrackingSession[];
  total: number;
}

export interface StartTrackingResponse {
  session: TrackingSession;
}

export interface MarkDeletedResponse {
  deleted: string;
  sessionId: string;
}

export interface CleanupResponse {
  sessionId: string;
  workshopTitle: string;
  cleanupScript: CleanupScript;
}

export interface NotificationsResponse {
  notifications: CostNotification[];
  total: number;
}

export interface DismissNotificationResponse {
  dismissed: string;
}

export interface NotificationConfigResponse {
  config: NotificationConfig;
}

// === Loading State Types ===

export interface CostLoadingState {
  isLoadingWorkshops: boolean;
  isScanning: boolean;
  isLoadingTracking: boolean;
  error: string | null;
}

// === Retry Configuration ===

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Delay execution for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY_MS
): Promise<T> {
  let lastError: ApiError | Error | undefined;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as ApiError | Error;
      
      // Don't retry on client errors (4xx)
      if ((error as ApiError).status && (error as ApiError).status! >= 400 && (error as ApiError).status! < 500) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === retries) {
        break;
      }
      
      // Exponential backoff
      await delay(delayMs * Math.pow(2, attempt));
    }
  }
  
  throw lastError;
}

/**
 * Format API error into user-friendly message
 */
export function formatCostError(error: ApiError | Error): string {
  if ('code' in error) {
    switch (error.code) {
      case 'NETWORK_ERROR':
        return 'Unable to connect to the server. Please check your internet connection.';
      case 'BadRequest':
        return error.message || 'Invalid request. Please check your input.';
      case 'NotFound':
        return 'The requested workshop or session was not found.';
      case 'PARSE_ERROR':
        return 'Unable to parse the tutorial content. Please try a different URL or format.';
      default:
        return error.message || 'An unexpected error occurred.';
    }
  }
  return error.message || 'An unexpected error occurred.';
}

// === Workshop API Functions ===

/**
 * List workshops with optional filters and cost badges
 */
export async function listWorkshops(
  filter?: WorkshopFilter
): Promise<WorkshopsResponse> {
  return withRetry(() =>
    api.get<WorkshopsResponse>('/cost/workshops', { params: filter })
  );
}

/**
 * Get workshop details with cost analysis
 */
export async function getWorkshop(workshopId: string): Promise<WorkshopResponse> {
  return withRetry(() =>
    api.get<WorkshopResponse>(`/cost/workshops/${workshopId}`)
  );
}

/**
 * Scan a workshop or custom tutorial URL for costs
 * Supports CloudFormation, Terraform, AWS CLI, and instructional text
 */
export async function scanTutorial(request: ScanRequest): Promise<ScanResponse> {
  return withRetry(() =>
    api.post<ScanResponse>('/cost/scan', request)
  );
}

// === Resource Tracking API Functions ===

/**
 * Get user's active tracking sessions
 */
export async function getTrackingSessions(
  userId?: string
): Promise<TrackingResponse> {
  return withRetry(() =>
    api.get<TrackingResponse>('/cost/tracking', { params: userId ? { userId } : undefined })
  );
}

/**
 * Start tracking resources for a tutorial
 */
export async function startTracking(
  request: StartTrackingRequest
): Promise<StartTrackingResponse> {
  return withRetry(() =>
    api.post<StartTrackingResponse>('/cost/tracking/start', request)
  );
}

/**
 * Mark a resource as deleted
 */
export async function markResourceDeleted(
  sessionId: string,
  resourceId: string
): Promise<MarkDeletedResponse> {
  return withRetry(() =>
    api.put<MarkDeletedResponse>(
      `/cost/tracking/${sessionId}/resource/${resourceId}/delete`
    )
  );
}

// === Cleanup API Functions ===

/**
 * Generate cleanup script for a session
 */
export async function getCleanupScript(
  sessionId: string,
  method?: CleanupMethod,
  userId?: string
): Promise<CleanupResponse> {
  const params: Record<string, string> = {};
  if (method) params.method = method;
  if (userId) params.userId = userId;
  
  return withRetry(() =>
    api.get<CleanupResponse>(`/cost/cleanup/${sessionId}`, { params })
  );
}

// === Notification API Functions ===

/**
 * Get user notifications
 */
export async function getNotifications(
  userId?: string,
  showDismissed?: boolean
): Promise<NotificationsResponse> {
  const params: Record<string, string> = {};
  if (userId) params.userId = userId;
  if (showDismissed) params.showDismissed = 'true';
  
  return withRetry(() =>
    api.get<NotificationsResponse>('/cost/notifications', { params })
  );
}

/**
 * Dismiss a notification
 */
export async function dismissNotification(
  notificationId: string
): Promise<DismissNotificationResponse> {
  return withRetry(() =>
    api.put<DismissNotificationResponse>(`/cost/notifications/${notificationId}/dismiss`)
  );
}

/**
 * Configure notification thresholds
 */
export async function configureNotifications(
  config: NotificationConfigRequest
): Promise<NotificationConfigResponse> {
  return withRetry(() =>
    api.put<NotificationConfigResponse>('/cost/notifications/config', config)
  );
}

// === Optimistic Update Helpers ===

/**
 * Optimistically update a resource status to deleted
 * Returns updated sessions array for immediate UI update
 */
export function optimisticMarkDeleted(
  sessions: TrackingSession[],
  sessionId: string,
  resourceId: string
): TrackingSession[] {
  return sessions.map((session) => {
    if (session.sessionId !== sessionId) return session;
    
    return {
      ...session,
      resources: session.resources.map((resource) => {
        if (resource.resource.resourceId !== resourceId) return resource;
        
        return {
          ...resource,
          status: ResourceStatus.DELETED,
          deletedAt: new Date(),
        };
      }),
    };
  });
}

/**
 * Optimistically dismiss a notification
 * Returns updated notifications array for immediate UI update
 */
export function optimisticDismissNotification(
  notifications: CostNotification[],
  notificationId: string
): CostNotification[] {
  return notifications.filter((n) => n.notificationId !== notificationId);
}

// === Cost Calculation Helpers ===

/**
 * Calculate total accumulated cost for a session
 */
export function calculateSessionCost(session: TrackingSession): number {
  return session.resources.reduce((total, resource) => {
    if (resource.status === 'deleted') return total;
    return total + resource.accumulatedCost;
  }, 0);
}

/**
 * Get resources that have been running for more than 24 hours
 */
export function getLongRunningResources(session: TrackingSession): typeof session.resources {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  return session.resources.filter((resource) => {
    if (resource.status === 'deleted') return false;
    return new Date(resource.deployedAt) < twentyFourHoursAgo;
  });
}

// === Export consolidated API object ===

export const costApiService = {
  // Workshop operations
  listWorkshops,
  getWorkshop,
  scan: scanTutorial,
  
  // Tracking operations
  getTracking: getTrackingSessions,
  startTracking,
  markResourceDeleted,
  
  // Cleanup operations
  getCleanupScript,
  
  // Notification operations
  getNotifications,
  dismissNotification,
  configureNotifications,
  
  // Helpers
  formatError: formatCostError,
  optimisticMarkDeleted,
  optimisticDismissNotification,
  calculateSessionCost,
  getLongRunningResources,
};

export default costApiService;
