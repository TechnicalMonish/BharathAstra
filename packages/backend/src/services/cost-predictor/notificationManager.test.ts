import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  NotificationManager,
  daysElapsed,
  buildCostAlertMessage,
  buildTimeAlertMessage,
  determineCostSeverity,
  determineTimeSeverity,
  buildCleanupUrl,
  createDefaultConfig,
  DEFAULT_COST_THRESHOLD,
  DEFAULT_TIME_THRESHOLD,
} from "./notificationManager";
import {
  NotificationChannel,
  NotificationType,
  SessionStatus,
  ResourceStatus,
} from "@aws-intel/shared";
import type {
  TrackingSession,
  TrackedResource,
  AWSResource,
  CostNotification,
  NotificationConfig,
} from "@aws-intel/shared";

// --- Mock dynamodb ---
vi.mock("../../lib/dynamodb", () => ({
  put: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue([]),
  scan: vi.fn().mockResolvedValue([]),
  del: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
}));

// --- Mock crypto for deterministic UUIDs ---
vi.mock("crypto", () => ({
  randomUUID: vi.fn().mockReturnValue("test-notification-id"),
}));

import * as dynamodb from "../../lib/dynamodb";

// --- Helpers ---

function createMockResource(overrides: Partial<AWSResource> = {}): AWSResource {
  return {
    resourceId: "res-ec2-001",
    resourceType: "EC2",
    configuration: { region: "us-east-1", instanceType: "t3.micro" },
    pricing: {
      hourlyRate: 0.0104,
      dailyCost: 0.2496,
      monthlyCost: 7.49,
      pricingModel: "On-Demand",
    },
    freeTierEligible: false,
    deploymentMethod: "CloudFormation",
    ...overrides,
  };
}

function createMockTrackedResource(
  overrides: Partial<TrackedResource> = {}
): TrackedResource {
  return {
    resource: createMockResource(),
    deployedAt: new Date("2025-01-01T00:00:00Z"),
    status: ResourceStatus.RUNNING,
    accumulatedCost: 0,
    ...overrides,
  };
}

function createMockSession(
  overrides: Partial<TrackingSession> = {}
): TrackingSession {
  return {
    sessionId: "session-001",
    userId: "user-001",
    workshopId: "ws-001",
    workshopTitle: "Test Workshop",
    resources: [createMockTrackedResource()],
    startedAt: new Date("2025-01-01T00:00:00Z"),
    lastUpdated: new Date("2025-01-01T00:00:00Z"),
    status: SessionStatus.ACTIVE,
    accumulatedCost: 0,
    projectedMonthlyCost: 7.49,
    ...overrides,
  };
}

function createSerializedNotification(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    sessionId: "session-001",
    resourceId: "NOTIF#notif-001",
    notificationId: "notif-001",
    userId: "user-001",
    type: NotificationType.COST_THRESHOLD,
    message: "Cost alert: test",
    severity: "warning",
    actionUrl: "/api/cost/cleanup/session-001",
    sentAt: "2025-01-10T00:00:00.000Z",
    dismissed: false,
    ...overrides,
  };
}

// ============================================================
// Helper function tests
// ============================================================

describe("daysElapsed", () => {
  it("returns 0 when from and to are the same", () => {
    const d = new Date("2025-01-01T00:00:00Z");
    expect(daysElapsed(d, d)).toBe(0);
  });

  it("calculates days correctly for a 7-day span", () => {
    const from = new Date("2025-01-01T00:00:00Z");
    const to = new Date("2025-01-08T00:00:00Z");
    expect(daysElapsed(from, to)).toBe(7);
  });

  it("returns 0 when to is before from", () => {
    const from = new Date("2025-01-08T00:00:00Z");
    const to = new Date("2025-01-01T00:00:00Z");
    expect(daysElapsed(from, to)).toBe(0);
  });

  it("handles fractional days", () => {
    const from = new Date("2025-01-01T00:00:00Z");
    const to = new Date("2025-01-01T12:00:00Z");
    expect(daysElapsed(from, to)).toBe(0.5);
  });
});

describe("buildCostAlertMessage", () => {
  it("includes tutorial name, cost, and threshold", () => {
    const msg = buildCostAlertMessage("My Workshop", 7.5, 5);
    expect(msg).toContain("My Workshop");
    expect(msg).toContain("$7.50");
    expect(msg).toContain("$5.00");
  });
});

describe("buildTimeAlertMessage", () => {
  it("includes tutorial name, cost, and days", () => {
    const msg = buildTimeAlertMessage("My Workshop", 3.25, 10);
    expect(msg).toContain("My Workshop");
    expect(msg).toContain("$3.25");
    expect(msg).toContain("10 days");
  });
});

describe("determineCostSeverity", () => {
  it("returns critical when cost >= 3x threshold", () => {
    expect(determineCostSeverity(15, 5)).toBe("critical");
  });

  it("returns warning when cost >= 1.5x threshold", () => {
    expect(determineCostSeverity(8, 5)).toBe("warning");
  });

  it("returns info when cost is just above threshold", () => {
    expect(determineCostSeverity(6, 5)).toBe("info");
  });
});

describe("determineTimeSeverity", () => {
  it("returns critical when days >= 3x threshold", () => {
    expect(determineTimeSeverity(21, 7)).toBe("critical");
  });

  it("returns warning when days >= 1.5x threshold", () => {
    expect(determineTimeSeverity(11, 7)).toBe("warning");
  });

  it("returns info when days just above threshold", () => {
    expect(determineTimeSeverity(8, 7)).toBe("info");
  });
});

describe("buildCleanupUrl", () => {
  it("returns correct cleanup URL", () => {
    expect(buildCleanupUrl("session-123")).toBe("/api/cost/cleanup/session-123");
  });
});

describe("createDefaultConfig", () => {
  it("returns default thresholds and channels", () => {
    const config = createDefaultConfig();
    expect(config.costThreshold).toBe(DEFAULT_COST_THRESHOLD);
    expect(config.timeThreshold).toBe(DEFAULT_TIME_THRESHOLD);
    expect(config.enabled).toBe(true);
    expect(config.channels).toEqual([NotificationChannel.IN_APP]);
  });
});

// ============================================================
// NotificationManager class tests
// ============================================================

describe("NotificationManager", () => {
  let manager: NotificationManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new NotificationManager();
  });

  describe("sendCostAlert", () => {
    it("sends notification when cost exceeds threshold", async () => {
      const session = createMockSession({ accumulatedCost: 10 });
      vi.mocked(dynamodb.query).mockResolvedValueOnce([]); // no existing notifications
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined); // no user config

      const notification = await manager.sendCostAlert(session, 5);

      expect(notification).not.toBeNull();
      expect(notification!.type).toBe(NotificationType.COST_THRESHOLD);
      expect(notification!.sessionId).toBe("session-001");
      expect(notification!.userId).toBe("user-001");
      expect(notification!.message).toContain("Test Workshop");
      expect(notification!.message).toContain("$10.00");
      expect(notification!.actionUrl).toBe("/api/cost/cleanup/session-001");
      expect(notification!.dismissed).toBe(false);
      expect(dynamodb.put).toHaveBeenCalled();
    });

    it("returns null when cost is below threshold", async () => {
      const session = createMockSession({ accumulatedCost: 3 });

      const notification = await manager.sendCostAlert(session, 5);

      expect(notification).toBeNull();
      expect(dynamodb.put).not.toHaveBeenCalled();
    });

    it("returns null when cost equals threshold", async () => {
      const session = createMockSession({ accumulatedCost: 5 });

      const notification = await manager.sendCostAlert(session, 5);

      expect(notification).toBeNull();
    });

    it("prevents duplicate when notification already dismissed", async () => {
      const session = createMockSession({ accumulatedCost: 10 });
      vi.mocked(dynamodb.query).mockResolvedValueOnce([
        createSerializedNotification({
          type: NotificationType.COST_THRESHOLD,
          dismissed: true,
        }),
      ]);

      const notification = await manager.sendCostAlert(session, 5);

      expect(notification).toBeNull();
    });

    it("returns existing active notification instead of creating duplicate", async () => {
      const session = createMockSession({ accumulatedCost: 10 });
      vi.mocked(dynamodb.query).mockResolvedValueOnce([
        createSerializedNotification({
          type: NotificationType.COST_THRESHOLD,
          dismissed: false,
        }),
      ]);

      const notification = await manager.sendCostAlert(session, 5);

      expect(notification).not.toBeNull();
      expect(notification!.notificationId).toBe("notif-001");
      // Should not save a new notification
      expect(dynamodb.put).not.toHaveBeenCalled();
    });

    it("uses default threshold when none provided", async () => {
      const session = createMockSession({ accumulatedCost: 6 });
      vi.mocked(dynamodb.query).mockResolvedValueOnce([]);
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const notification = await manager.sendCostAlert(session);

      expect(notification).not.toBeNull();
      expect(notification!.message).toContain("$5.00");
    });
  });

  describe("sendTimeAlert", () => {
    it("sends notification when resources running longer than threshold", async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const session = createMockSession({
        startedAt: eightDaysAgo,
        accumulatedCost: 2.5,
      });
      vi.mocked(dynamodb.query).mockResolvedValueOnce([]);
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const notification = await manager.sendTimeAlert(session, 7);

      expect(notification).not.toBeNull();
      expect(notification!.type).toBe(NotificationType.TIME_THRESHOLD);
      expect(notification!.message).toContain("Test Workshop");
      expect(notification!.message).toContain("$2.50");
      expect(notification!.actionUrl).toBe("/api/cost/cleanup/session-001");
    });

    it("returns null when resources running less than threshold", async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const session = createMockSession({ startedAt: twoDaysAgo });

      const notification = await manager.sendTimeAlert(session, 7);

      expect(notification).toBeNull();
    });

    it("prevents duplicate when time notification already dismissed", async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const session = createMockSession({ startedAt: tenDaysAgo });
      vi.mocked(dynamodb.query).mockResolvedValueOnce([
        createSerializedNotification({
          type: NotificationType.TIME_THRESHOLD,
          dismissed: true,
        }),
      ]);

      const notification = await manager.sendTimeAlert(session, 7);

      expect(notification).toBeNull();
    });

    it("uses default time threshold when none provided", async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const session = createMockSession({ startedAt: tenDaysAgo });
      vi.mocked(dynamodb.query).mockResolvedValueOnce([]);
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const notification = await manager.sendTimeAlert(session);

      expect(notification).not.toBeNull();
    });
  });

  describe("configureThresholds", () => {
    it("saves notification config to DynamoDB", async () => {
      const config: NotificationConfig = {
        costThreshold: 10,
        timeThreshold: 14,
        enabled: true,
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      };

      await manager.configureThresholds("user-001", config);

      expect(dynamodb.put).toHaveBeenCalledTimes(1);
      const putCall = vi.mocked(dynamodb.put).mock.calls[0][0];
      expect(putCall.TableName).toBe("ResourceTracking");
      expect((putCall.Item as Record<string, unknown>).costThreshold).toBe(10);
      expect((putCall.Item as Record<string, unknown>).timeThreshold).toBe(14);
      expect((putCall.Item as Record<string, unknown>).channels).toEqual([
        NotificationChannel.IN_APP,
        NotificationChannel.EMAIL,
      ]);
    });

    it("allows disabling notifications", async () => {
      const config: NotificationConfig = {
        costThreshold: 5,
        timeThreshold: 7,
        enabled: false,
        channels: [],
      };

      await manager.configureThresholds("user-001", config);

      const putCall = vi.mocked(dynamodb.put).mock.calls[0][0];
      expect((putCall.Item as Record<string, unknown>).enabled).toBe(false);
    });
  });

  describe("dismissNotification", () => {
    it("marks notification as dismissed in DynamoDB", async () => {
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([
        createSerializedNotification({ notificationId: "notif-001" }),
      ]);

      await manager.dismissNotification("notif-001");

      expect(dynamodb.put).toHaveBeenCalledTimes(1);
      const putCall = vi.mocked(dynamodb.put).mock.calls[0][0];
      expect((putCall.Item as Record<string, unknown>).dismissed).toBe(true);
    });

    it("throws when notification is not found", async () => {
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([]);

      await expect(
        manager.dismissNotification("nonexistent")
      ).rejects.toThrow("Notification not found: nonexistent");
    });
  });

  describe("getUserConfig", () => {
    it("returns stored config from DynamoDB", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce({
        sessionId: "user-001",
        resourceId: "NOTIFICATION_CONFIG",
        costThreshold: 10,
        timeThreshold: 14,
        enabled: true,
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      });

      const config = await manager.getUserConfig("user-001");

      expect(config.costThreshold).toBe(10);
      expect(config.timeThreshold).toBe(14);
      expect(config.enabled).toBe(true);
      expect(config.channels).toEqual([
        NotificationChannel.IN_APP,
        NotificationChannel.EMAIL,
      ]);
    });

    it("returns default config when none exists", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const config = await manager.getUserConfig("user-001");

      expect(config.costThreshold).toBe(DEFAULT_COST_THRESHOLD);
      expect(config.timeThreshold).toBe(DEFAULT_TIME_THRESHOLD);
      expect(config.enabled).toBe(true);
      expect(config.channels).toEqual([NotificationChannel.IN_APP]);
    });
  });

  describe("getSessionNotifications", () => {
    it("returns deserialized notifications from DynamoDB", async () => {
      vi.mocked(dynamodb.query).mockResolvedValueOnce([
        createSerializedNotification(),
        createSerializedNotification({
          notificationId: "notif-002",
          type: NotificationType.TIME_THRESHOLD,
        }),
      ]);

      const notifications = await manager.getSessionNotifications("session-001");

      expect(notifications).toHaveLength(2);
      expect(notifications[0].notificationId).toBe("notif-001");
      expect(notifications[0].sentAt).toBeInstanceOf(Date);
      expect(notifications[1].type).toBe(NotificationType.TIME_THRESHOLD);
    });

    it("returns empty array when no notifications exist", async () => {
      vi.mocked(dynamodb.query).mockResolvedValueOnce([]);

      const notifications = await manager.getSessionNotifications("session-001");

      expect(notifications).toHaveLength(0);
    });
  });

  describe("getUserNotifications", () => {
    it("returns all notifications for a user", async () => {
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([
        createSerializedNotification(),
      ]);

      const notifications = await manager.getUserNotifications("user-001");

      expect(notifications).toHaveLength(1);
      expect(notifications[0].userId).toBe("user-001");
    });
  });
});
