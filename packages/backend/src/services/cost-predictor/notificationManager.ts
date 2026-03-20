import type {
  CostNotification,
  NotificationConfig,
  TrackingSession,
} from "@aws-intel/shared";
import { NotificationChannel, NotificationType } from "@aws-intel/shared";
import * as dynamodb from "../../lib/dynamodb";
import { TABLES } from "../../config/tables";
import { randomUUID } from "crypto";

// --- Constants ---

/** Default cost threshold in dollars */
export const DEFAULT_COST_THRESHOLD = 5;

/** Default time threshold in days */
export const DEFAULT_TIME_THRESHOLD = 7;

/** DynamoDB sort key for notification config records */
const CONFIG_SORT_KEY = "NOTIFICATION_CONFIG";

/** DynamoDB sort key prefix for notification records */
const NOTIFICATION_PREFIX = "NOTIF#";

/** Hours per day */
const HOURS_PER_DAY = 24;

/** Milliseconds per hour */
const MS_PER_HOUR = 1000 * 60 * 60;

// --- Helper functions ---

/**
 * Calculate days elapsed between two dates.
 */
export function daysElapsed(from: Date, to: Date): number {
  const diffMs = to.getTime() - from.getTime();
  return Math.max(0, diffMs / (MS_PER_HOUR * HOURS_PER_DAY));
}

/**
 * Build a notification message for cost threshold alerts.
 * Requirements: 37.3
 */
export function buildCostAlertMessage(
  workshopTitle: string,
  currentCost: number,
  threshold: number
): string {
  return `Cost alert: "${workshopTitle}" has accumulated $${currentCost.toFixed(2)}, exceeding the $${threshold.toFixed(2)} threshold. Please review and clean up resources.`;
}

/**
 * Build a notification message for time threshold alerts.
 * Requirements: 37.3
 */
export function buildTimeAlertMessage(
  workshopTitle: string,
  currentCost: number,
  days: number
): string {
  return `Time alert: "${workshopTitle}" resources have been running for ${Math.floor(days)} days (current cost: $${currentCost.toFixed(2)}). Consider cleaning up.`;
}

/**
 * Determine severity based on cost relative to threshold.
 */
export function determineCostSeverity(
  cost: number,
  threshold: number
): "critical" | "warning" | "info" {
  if (cost >= threshold * 3) return "critical";
  if (cost >= threshold * 1.5) return "warning";
  return "info";
}

/**
 * Determine severity based on days running relative to threshold.
 */
export function determineTimeSeverity(
  days: number,
  threshold: number
): "critical" | "warning" | "info" {
  if (days >= threshold * 3) return "critical";
  if (days >= threshold * 1.5) return "warning";
  return "info";
}

/**
 * Build the cleanup action URL for a session.
 * Requirements: 37.3
 */
export function buildCleanupUrl(sessionId: string): string {
  return `/api/cost/cleanup/${sessionId}`;
}

/**
 * Create a default notification config.
 */
export function createDefaultConfig(): NotificationConfig {
  return {
    costThreshold: DEFAULT_COST_THRESHOLD,
    timeThreshold: DEFAULT_TIME_THRESHOLD,
    enabled: true,
    channels: [NotificationChannel.IN_APP],
  };
}

// --- NotificationManager class ---

export class NotificationManager {
  /**
   * Send a cost alert notification when accumulated cost exceeds the threshold.
   * Requirements: 37.1, 37.3, 37.5
   */
  async sendCostAlert(
    session: TrackingSession,
    threshold: number = DEFAULT_COST_THRESHOLD
  ): Promise<CostNotification | null> {
    if (session.accumulatedCost <= threshold) {
      return null;
    }

    // Check for dismissed duplicate
    const existing = await this.getSessionNotifications(session.sessionId);
    const dismissed = existing.find(
      (n) =>
        n.type === NotificationType.COST_THRESHOLD &&
        n.dismissed === true
    );
    if (dismissed) {
      return null;
    }

    // Check for already-sent active notification
    const active = existing.find(
      (n) =>
        n.type === NotificationType.COST_THRESHOLD &&
        n.dismissed === false
    );
    if (active) {
      return active;
    }

    const notification: CostNotification = {
      notificationId: randomUUID(),
      userId: session.userId,
      sessionId: session.sessionId,
      type: NotificationType.COST_THRESHOLD,
      message: buildCostAlertMessage(
        session.workshopTitle,
        session.accumulatedCost,
        threshold
      ),
      severity: determineCostSeverity(session.accumulatedCost, threshold),
      actionUrl: buildCleanupUrl(session.sessionId),
      sentAt: new Date(),
      dismissed: false,
    };

    await this.saveNotification(notification);
    await this.publishToChannels(notification, session.userId);
    return notification;
  }

  /**
   * Send a time alert notification when resources have been running longer than the threshold.
   * Requirements: 37.2, 37.3, 37.5
   */
  async sendTimeAlert(
    session: TrackingSession,
    days: number = DEFAULT_TIME_THRESHOLD
  ): Promise<CostNotification | null> {
    const elapsed = daysElapsed(session.startedAt, new Date());
    if (elapsed <= days) {
      return null;
    }

    // Check for dismissed duplicate
    const existing = await this.getSessionNotifications(session.sessionId);
    const dismissed = existing.find(
      (n) =>
        n.type === NotificationType.TIME_THRESHOLD &&
        n.dismissed === true
    );
    if (dismissed) {
      return null;
    }

    // Check for already-sent active notification
    const active = existing.find(
      (n) =>
        n.type === NotificationType.TIME_THRESHOLD &&
        n.dismissed === false
    );
    if (active) {
      return active;
    }

    const notification: CostNotification = {
      notificationId: randomUUID(),
      userId: session.userId,
      sessionId: session.sessionId,
      type: NotificationType.TIME_THRESHOLD,
      message: buildTimeAlertMessage(
        session.workshopTitle,
        session.accumulatedCost,
        elapsed
      ),
      severity: determineTimeSeverity(elapsed, days),
      actionUrl: buildCleanupUrl(session.sessionId),
      sentAt: new Date(),
      dismissed: false,
    };

    await this.saveNotification(notification);
    await this.publishToChannels(notification, session.userId);
    return notification;
  }

  /**
   * Configure notification thresholds for a user.
   * Requirements: 37.4
   */
  async configureThresholds(
    userId: string,
    config: NotificationConfig
  ): Promise<void> {
    await dynamodb.put({
      TableName: TABLES.ResourceTracking,
      Item: {
        sessionId: userId,
        resourceId: CONFIG_SORT_KEY,
        costThreshold: config.costThreshold,
        timeThreshold: config.timeThreshold,
        enabled: config.enabled,
        channels: config.channels,
      },
    });
  }

  /**
   * Dismiss a notification so duplicates are not sent.
   * Requirements: 37.5
   */
  async dismissNotification(notificationId: string): Promise<void> {
    // Find the notification first
    const items = await dynamodb.scan({
      TableName: TABLES.ResourceTracking,
      FilterExpression: "notificationId = :nid",
      ExpressionAttributeValues: { ":nid": notificationId },
    });

    if (items.length === 0) {
      throw new Error(`Notification not found: ${notificationId}`);
    }

    const item = items[0];
    await dynamodb.put({
      TableName: TABLES.ResourceTracking,
      Item: {
        ...item,
        dismissed: true,
      },
    });
  }

  /**
   * Get the notification config for a user, returning defaults if none exists.
   */
  async getUserConfig(userId: string): Promise<NotificationConfig> {
    const item = await dynamodb.get({
      TableName: TABLES.ResourceTracking,
      Key: { sessionId: userId, resourceId: CONFIG_SORT_KEY },
    });

    if (!item) {
      return createDefaultConfig();
    }

    return {
      costThreshold: (item.costThreshold as number) ?? DEFAULT_COST_THRESHOLD,
      timeThreshold: (item.timeThreshold as number) ?? DEFAULT_TIME_THRESHOLD,
      enabled: (item.enabled as boolean) ?? true,
      channels: (item.channels as NotificationChannel[]) ?? [NotificationChannel.IN_APP],
    };
  }

  /**
   * Get all notifications for a specific session.
   */
  async getSessionNotifications(sessionId: string): Promise<CostNotification[]> {
    const items = await dynamodb.query({
      TableName: TABLES.ResourceTracking,
      KeyConditionExpression:
        "sessionId = :sid AND begins_with(resourceId, :prefix)",
      ExpressionAttributeValues: {
        ":sid": sessionId,
        ":prefix": NOTIFICATION_PREFIX,
      },
    });

    return items.map((item) => this.deserializeNotification(item));
  }

  /**
   * Get all notifications for a user.
   */
  async getUserNotifications(userId: string): Promise<CostNotification[]> {
    const items = await dynamodb.scan({
      TableName: TABLES.ResourceTracking,
      FilterExpression:
        "userId = :uid AND begins_with(resourceId, :prefix)",
      ExpressionAttributeValues: {
        ":uid": userId,
        ":prefix": NOTIFICATION_PREFIX,
      },
    });

    return items.map((item) => this.deserializeNotification(item));
  }

  // --- Private helpers ---

  private async saveNotification(notification: CostNotification): Promise<void> {
    await dynamodb.put({
      TableName: TABLES.ResourceTracking,
      Item: {
        sessionId: notification.sessionId,
        resourceId: `${NOTIFICATION_PREFIX}${notification.notificationId}`,
        notificationId: notification.notificationId,
        userId: notification.userId,
        type: notification.type,
        message: notification.message,
        severity: notification.severity,
        actionUrl: notification.actionUrl,
        sentAt: notification.sentAt.toISOString(),
        dismissed: notification.dismissed,
      },
    });
  }

  /**
   * Publish notification to configured channels (in-app and email via SNS).
   * In-app notifications are stored in DynamoDB (already done via saveNotification).
   * Email notifications would be sent via SNS in production.
   */
  private async publishToChannels(
    notification: CostNotification,
    userId: string
  ): Promise<void> {
    const config = await this.getUserConfig(userId);

    if (!config.enabled) return;

    for (const channel of config.channels) {
      switch (channel) {
        case NotificationChannel.IN_APP:
          // Already persisted via saveNotification
          break;
        case NotificationChannel.EMAIL:
          // In production, publish to SNS topic for email delivery
          // await snsClient.publish({ TopicArn: ..., Message: notification.message })
          break;
        case NotificationChannel.SMS:
          // In production, publish to SNS topic for SMS delivery
          break;
      }
    }
  }

  private deserializeNotification(
    item: Record<string, unknown>
  ): CostNotification {
    return {
      notificationId: item.notificationId as string,
      userId: item.userId as string,
      sessionId: item.sessionId as string,
      type: item.type as NotificationType,
      message: item.message as string,
      severity: item.severity as "critical" | "warning" | "info",
      actionUrl: item.actionUrl as string,
      sentAt: new Date(item.sentAt as string),
      dismissed: (item.dismissed as boolean) ?? false,
    };
  }
}
