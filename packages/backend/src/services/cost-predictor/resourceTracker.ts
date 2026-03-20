import type {
  AWSResource,
  TrackingSession,
  TrackedResource,
} from "@aws-intel/shared";
import { SessionStatus, ResourceStatus } from "@aws-intel/shared";
import * as dynamodb from "../../lib/dynamodb";
import { TABLES } from "../../config/tables";
import { randomUUID } from "crypto";

// --- Constants ---

/** Hours threshold after which a resource triggers a warning */
export const LONG_RUNNING_HOURS = 24;

/** Milliseconds per hour */
const MS_PER_HOUR = 1000 * 60 * 60;

// --- Helper functions ---

/**
 * Calculate hours elapsed between two dates.
 */
export function hoursElapsed(from: Date, to: Date): number {
  const diff = to.getTime() - from.getTime();
  return Math.max(0, diff / MS_PER_HOUR);
}

/**
 * Calculate accumulated cost for a single tracked resource.
 * Cost = hourlyRate × hours elapsed (from deploy to delete or now).
 * Requirements: 34.4
 */
export function calculateResourceCost(
  resource: TrackedResource,
  now: Date = new Date()
): number {
  const endTime = resource.deletedAt ?? now;
  const hours = hoursElapsed(resource.deployedAt, endTime);
  return resource.resource.pricing.hourlyRate * hours;
}

/**
 * Determine session status based on resource states.
 * - COMPLETED: all resources deleted
 * - PARTIALLY_DELETED: some deleted, some still active
 * - ACTIVE: no resources deleted
 */
export function deriveSessionStatus(resources: TrackedResource[]): SessionStatus {
  if (resources.length === 0) return SessionStatus.ACTIVE;

  const allDeleted = resources.every((r) => r.status === ResourceStatus.DELETED);
  if (allDeleted) return SessionStatus.COMPLETED;

  const someDeleted = resources.some((r) => r.status === ResourceStatus.DELETED);
  if (someDeleted) return SessionStatus.PARTIALLY_DELETED;

  return SessionStatus.ACTIVE;
}

/**
 * Check if a resource has been running longer than the threshold.
 * Requirements: 35.2
 */
export function isLongRunning(resource: TrackedResource, now: Date = new Date()): boolean {
  if (resource.status === ResourceStatus.DELETED) return false;
  return hoursElapsed(resource.deployedAt, now) > LONG_RUNNING_HOURS;
}

/**
 * Calculate projected monthly cost for active resources.
 * Requirements: 35.3
 */
export function calculateProjectedMonthlyCost(resources: TrackedResource[]): number {
  return resources
    .filter((r) => r.status !== ResourceStatus.DELETED)
    .reduce((sum, r) => sum + r.resource.pricing.monthlyCost, 0);
}

/**
 * Group tracked resources by their workshop/tutorial ID.
 * Requirements: 35.4
 */
export function groupResourcesByTutorial(
  sessions: TrackingSession[]
): Map<string, TrackingSession[]> {
  const grouped = new Map<string, TrackingSession[]>();
  for (const session of sessions) {
    const key = session.workshopId;
    const existing = grouped.get(key) ?? [];
    existing.push(session);
    grouped.set(key, existing);
  }
  return grouped;
}

// --- ResourceTracker class ---

export class ResourceTracker {
  /**
   * Start tracking resources for a tutorial/workshop.
   * Creates a tracking session associating the tutorial with the user.
   * Requirements: 34.1, 34.2
   */
  async startTracking(
    workshopId: string,
    userId: string,
    resources: AWSResource[],
    workshopTitle: string = "Untitled Workshop"
  ): Promise<TrackingSession> {
    const now = new Date();
    const sessionId = randomUUID();

    const trackedResources: TrackedResource[] = resources.map((resource) => ({
      resource,
      deployedAt: now,
      status: ResourceStatus.RUNNING,
      accumulatedCost: 0,
    }));

    const session: TrackingSession = {
      sessionId,
      userId,
      workshopId,
      workshopTitle,
      resources: trackedResources,
      startedAt: now,
      lastUpdated: now,
      status: SessionStatus.ACTIVE,
      accumulatedCost: 0,
      projectedMonthlyCost: calculateProjectedMonthlyCost(trackedResources),
    };

    await this.saveSession(session);
    return session;
  }

  /**
   * Get all active (non-completed) tracking sessions for a user.
   * Requirements: 34.3, 35.1, 35.4
   */
  async getActiveSessions(userId: string): Promise<TrackingSession[]> {
    const items = await dynamodb.scan({
      TableName: TABLES.ResourceTracking,
      FilterExpression: "userId = :uid AND #st <> :completed",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: {
        ":uid": userId,
        ":completed": SessionStatus.COMPLETED,
      },
    });

    return items.map((item) => this.deserializeSession(item));
  }

  /**
   * Update a session: recalculate accumulated costs and status.
   * Called daily via EventBridge scheduled rule.
   * Requirements: 34.4, 34.5, 35.3
   */
  async updateSession(sessionId: string): Promise<TrackingSession> {
    const item = await dynamodb.get({
      TableName: TABLES.ResourceTracking,
      Key: { sessionId, resourceId: "SESSION" },
    });

    if (!item) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const session = this.deserializeSession(item);
    const now = new Date();

    // Recalculate costs for each resource
    for (const resource of session.resources) {
      resource.accumulatedCost = calculateResourceCost(resource, now);
    }

    session.accumulatedCost = this.calculateAccumulatedCost(session);
    session.projectedMonthlyCost = calculateProjectedMonthlyCost(session.resources);
    session.status = deriveSessionStatus(session.resources);
    session.lastUpdated = now;

    await this.saveSession(session);
    return session;
  }

  /**
   * Mark a specific resource as deleted within a session.
   * Requirements: 35.5
   */
  async markResourceDeleted(sessionId: string, resourceId: string): Promise<void> {
    const item = await dynamodb.get({
      TableName: TABLES.ResourceTracking,
      Key: { sessionId, resourceId: "SESSION" },
    });

    if (!item) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const session = this.deserializeSession(item);
    const now = new Date();

    const resource = session.resources.find(
      (r) => r.resource.resourceId === resourceId
    );

    if (!resource) {
      throw new Error(`Resource not found: ${resourceId} in session ${sessionId}`);
    }

    resource.status = ResourceStatus.DELETED;
    resource.deletedAt = now;
    resource.accumulatedCost = calculateResourceCost(resource, now);

    // Recalculate session totals
    session.accumulatedCost = this.calculateAccumulatedCost(session);
    session.projectedMonthlyCost = calculateProjectedMonthlyCost(session.resources);
    session.status = deriveSessionStatus(session.resources);
    session.lastUpdated = now;

    await this.saveSession(session);
  }

  /**
   * Calculate total accumulated cost across all resources in a session.
   * Requirements: 34.4
   */
  calculateAccumulatedCost(session: TrackingSession): number {
    const now = new Date();
    return session.resources.reduce(
      (total, r) => total + calculateResourceCost(r, now),
      0
    );
  }

  /**
   * Get resources that have been running longer than 24 hours.
   * Requirements: 35.2
   */
  getLongRunningResources(session: TrackingSession): TrackedResource[] {
    const now = new Date();
    return session.resources.filter((r) => isLongRunning(r, now));
  }

  // --- Persistence helpers ---

  private async saveSession(session: TrackingSession): Promise<void> {
    await dynamodb.put({
      TableName: TABLES.ResourceTracking,
      Item: this.serializeSession(session),
    });
  }

  private serializeSession(
    session: TrackingSession
  ): Record<string, unknown> {
    return {
      sessionId: session.sessionId,
      resourceId: "SESSION", // sort key for the session record
      userId: session.userId,
      workshopId: session.workshopId,
      workshopTitle: session.workshopTitle,
      resources: JSON.stringify(
        session.resources.map((r) => ({
          ...r,
          deployedAt: r.deployedAt instanceof Date ? r.deployedAt.toISOString() : r.deployedAt,
          deletedAt: r.deletedAt
            ? r.deletedAt instanceof Date
              ? r.deletedAt.toISOString()
              : r.deletedAt
            : undefined,
        }))
      ),
      startedAt: session.startedAt instanceof Date ? session.startedAt.toISOString() : session.startedAt,
      lastUpdated: session.lastUpdated instanceof Date ? session.lastUpdated.toISOString() : session.lastUpdated,
      status: session.status,
      accumulatedCost: session.accumulatedCost,
      projectedMonthlyCost: session.projectedMonthlyCost,
    };
  }

  private deserializeSession(item: Record<string, unknown>): TrackingSession {
    const rawResources =
      typeof item.resources === "string"
        ? JSON.parse(item.resources as string)
        : item.resources ?? [];

    const resources: TrackedResource[] = rawResources.map(
      (r: Record<string, unknown>) => ({
        resource: r.resource as AWSResource,
        deployedAt: new Date(r.deployedAt as string),
        deletedAt: r.deletedAt ? new Date(r.deletedAt as string) : undefined,
        status: (r.status as ResourceStatus) ?? ResourceStatus.RUNNING,
        accumulatedCost: (r.accumulatedCost as number) ?? 0,
      })
    );

    return {
      sessionId: item.sessionId as string,
      userId: item.userId as string,
      workshopId: item.workshopId as string,
      workshopTitle: (item.workshopTitle as string) ?? "Untitled Workshop",
      resources,
      startedAt: new Date(item.startedAt as string),
      lastUpdated: item.lastUpdated
        ? new Date(item.lastUpdated as string)
        : undefined,
      status: (item.status as SessionStatus) ?? SessionStatus.ACTIVE,
      accumulatedCost: (item.accumulatedCost as number) ?? 0,
      projectedMonthlyCost: (item.projectedMonthlyCost as number) ?? 0,
    };
  }
}
