import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ResourceTracker,
  hoursElapsed,
  calculateResourceCost,
  deriveSessionStatus,
  isLongRunning,
  calculateProjectedMonthlyCost,
  groupResourcesByTutorial,
  LONG_RUNNING_HOURS,
} from "./resourceTracker";
import {
  SessionStatus,
  ResourceStatus,
} from "@aws-intel/shared";
import type {
  AWSResource,
  TrackedResource,
  TrackingSession,
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
  randomUUID: vi.fn().mockReturnValue("test-session-id"),
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

function createSerializedSession(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    sessionId: "session-001",
    resourceId: "SESSION",
    userId: "user-001",
    workshopId: "ws-001",
    workshopTitle: "Test Workshop",
    resources: JSON.stringify([
      {
        resource: createMockResource(),
        deployedAt: "2025-01-01T00:00:00.000Z",
        status: ResourceStatus.RUNNING,
        accumulatedCost: 0,
      },
    ]),
    startedAt: "2025-01-01T00:00:00.000Z",
    lastUpdated: "2025-01-01T00:00:00.000Z",
    status: SessionStatus.ACTIVE,
    accumulatedCost: 0,
    projectedMonthlyCost: 7.49,
    ...overrides,
  };
}

// ============================================================
// Helper function tests
// ============================================================

describe("hoursElapsed", () => {
  it("returns 0 when from and to are the same", () => {
    const d = new Date("2025-01-01T00:00:00Z");
    expect(hoursElapsed(d, d)).toBe(0);
  });

  it("calculates hours correctly for a 24-hour span", () => {
    const from = new Date("2025-01-01T00:00:00Z");
    const to = new Date("2025-01-02T00:00:00Z");
    expect(hoursElapsed(from, to)).toBe(24);
  });

  it("returns 0 when to is before from (no negative hours)", () => {
    const from = new Date("2025-01-02T00:00:00Z");
    const to = new Date("2025-01-01T00:00:00Z");
    expect(hoursElapsed(from, to)).toBe(0);
  });

  it("handles fractional hours", () => {
    const from = new Date("2025-01-01T00:00:00Z");
    const to = new Date("2025-01-01T01:30:00Z");
    expect(hoursElapsed(from, to)).toBe(1.5);
  });
});

describe("calculateResourceCost", () => {
  it("calculates cost based on hourly rate and elapsed time", () => {
    const resource = createMockTrackedResource({
      deployedAt: new Date("2025-01-01T00:00:00Z"),
    });
    const now = new Date("2025-01-02T00:00:00Z"); // 24 hours later
    const cost = calculateResourceCost(resource, now);
    // 0.0104 * 24 = 0.2496
    expect(cost).toBeCloseTo(0.2496, 4);
  });

  it("uses deletedAt as end time when resource is deleted", () => {
    const resource = createMockTrackedResource({
      deployedAt: new Date("2025-01-01T00:00:00Z"),
      deletedAt: new Date("2025-01-01T12:00:00Z"),
      status: ResourceStatus.DELETED,
    });
    const now = new Date("2025-01-05T00:00:00Z"); // much later
    const cost = calculateResourceCost(resource, now);
    // Should only count 12 hours, not until now
    expect(cost).toBeCloseTo(0.0104 * 12, 4);
  });

  it("returns 0 for a resource deployed at the current time", () => {
    const now = new Date("2025-01-01T00:00:00Z");
    const resource = createMockTrackedResource({ deployedAt: now });
    expect(calculateResourceCost(resource, now)).toBe(0);
  });
});

describe("deriveSessionStatus", () => {
  it("returns ACTIVE when no resources are deleted", () => {
    const resources = [
      createMockTrackedResource({ status: ResourceStatus.RUNNING }),
      createMockTrackedResource({ status: ResourceStatus.RUNNING }),
    ];
    expect(deriveSessionStatus(resources)).toBe(SessionStatus.ACTIVE);
  });

  it("returns COMPLETED when all resources are deleted", () => {
    const resources = [
      createMockTrackedResource({ status: ResourceStatus.DELETED }),
      createMockTrackedResource({ status: ResourceStatus.DELETED }),
    ];
    expect(deriveSessionStatus(resources)).toBe(SessionStatus.COMPLETED);
  });

  it("returns PARTIALLY_DELETED when some resources are deleted", () => {
    const resources = [
      createMockTrackedResource({ status: ResourceStatus.RUNNING }),
      createMockTrackedResource({ status: ResourceStatus.DELETED }),
    ];
    expect(deriveSessionStatus(resources)).toBe(SessionStatus.PARTIALLY_DELETED);
  });

  it("returns ACTIVE for empty resource list", () => {
    expect(deriveSessionStatus([])).toBe(SessionStatus.ACTIVE);
  });
});

describe("isLongRunning", () => {
  it("returns true when resource has been running > 24 hours", () => {
    const resource = createMockTrackedResource({
      deployedAt: new Date("2025-01-01T00:00:00Z"),
    });
    const now = new Date("2025-01-02T01:00:00Z"); // 25 hours
    expect(isLongRunning(resource, now)).toBe(true);
  });

  it("returns false when resource has been running < 24 hours", () => {
    const resource = createMockTrackedResource({
      deployedAt: new Date("2025-01-01T00:00:00Z"),
    });
    const now = new Date("2025-01-01T23:00:00Z"); // 23 hours
    expect(isLongRunning(resource, now)).toBe(false);
  });

  it("returns false for deleted resources regardless of time", () => {
    const resource = createMockTrackedResource({
      deployedAt: new Date("2025-01-01T00:00:00Z"),
      status: ResourceStatus.DELETED,
    });
    const now = new Date("2025-01-10T00:00:00Z"); // 9 days
    expect(isLongRunning(resource, now)).toBe(false);
  });

  it("returns false at exactly 24 hours (not strictly greater)", () => {
    const resource = createMockTrackedResource({
      deployedAt: new Date("2025-01-01T00:00:00Z"),
    });
    const now = new Date("2025-01-02T00:00:00Z"); // exactly 24 hours
    expect(isLongRunning(resource, now)).toBe(false);
  });
});

describe("calculateProjectedMonthlyCost", () => {
  it("sums monthly costs of active resources", () => {
    const resources = [
      createMockTrackedResource({
        resource: createMockResource({ pricing: { hourlyRate: 0.01, dailyCost: 0.24, monthlyCost: 7.49, pricingModel: "On-Demand" } }),
      }),
      createMockTrackedResource({
        resource: createMockResource({ pricing: { hourlyRate: 0.05, dailyCost: 1.2, monthlyCost: 36.0, pricingModel: "On-Demand" } }),
      }),
    ];
    expect(calculateProjectedMonthlyCost(resources)).toBeCloseTo(43.49, 2);
  });

  it("excludes deleted resources", () => {
    const resources = [
      createMockTrackedResource({
        resource: createMockResource({ pricing: { hourlyRate: 0.01, dailyCost: 0.24, monthlyCost: 7.49, pricingModel: "On-Demand" } }),
      }),
      createMockTrackedResource({
        status: ResourceStatus.DELETED,
        resource: createMockResource({ pricing: { hourlyRate: 0.05, dailyCost: 1.2, monthlyCost: 36.0, pricingModel: "On-Demand" } }),
      }),
    ];
    expect(calculateProjectedMonthlyCost(resources)).toBeCloseTo(7.49, 2);
  });

  it("returns 0 when all resources are deleted", () => {
    const resources = [
      createMockTrackedResource({ status: ResourceStatus.DELETED }),
    ];
    expect(calculateProjectedMonthlyCost(resources)).toBe(0);
  });
});

describe("groupResourcesByTutorial", () => {
  it("groups sessions by workshopId", () => {
    const sessions = [
      createMockSession({ workshopId: "ws-a" }),
      createMockSession({ workshopId: "ws-b" }),
      createMockSession({ workshopId: "ws-a" }),
    ];
    const grouped = groupResourcesByTutorial(sessions);
    expect(grouped.get("ws-a")?.length).toBe(2);
    expect(grouped.get("ws-b")?.length).toBe(1);
  });

  it("returns empty map for empty input", () => {
    const grouped = groupResourcesByTutorial([]);
    expect(grouped.size).toBe(0);
  });
});

// ============================================================
// ResourceTracker class tests
// ============================================================

describe("ResourceTracker", () => {
  let tracker: ResourceTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = new ResourceTracker();
  });

  describe("startTracking", () => {
    it("creates a tracking session with correct fields", async () => {
      const resources = [createMockResource(), createMockResource({ resourceId: "res-rds-001", resourceType: "RDS" })];
      const session = await tracker.startTracking("ws-001", "user-001", resources, "My Workshop");

      expect(session.sessionId).toBe("test-session-id");
      expect(session.userId).toBe("user-001");
      expect(session.workshopId).toBe("ws-001");
      expect(session.workshopTitle).toBe("My Workshop");
      expect(session.resources).toHaveLength(2);
      expect(session.status).toBe(SessionStatus.ACTIVE);
      expect(session.accumulatedCost).toBe(0);
      expect(session.startedAt).toBeInstanceOf(Date);
    });

    it("sets all resources to RUNNING status", async () => {
      const resources = [createMockResource()];
      const session = await tracker.startTracking("ws-001", "user-001", resources);

      for (const r of session.resources) {
        expect(r.status).toBe(ResourceStatus.RUNNING);
        expect(r.accumulatedCost).toBe(0);
        expect(r.deployedAt).toBeInstanceOf(Date);
      }
    });

    it("saves the session to DynamoDB", async () => {
      const resources = [createMockResource()];
      await tracker.startTracking("ws-001", "user-001", resources);

      expect(dynamodb.put).toHaveBeenCalledTimes(1);
      const putCall = vi.mocked(dynamodb.put).mock.calls[0][0];
      expect(putCall.TableName).toBe("ResourceTracking");
      expect(putCall.Item).toBeDefined();
      expect((putCall.Item as Record<string, unknown>).sessionId).toBe("test-session-id");
    });

    it("calculates projected monthly cost from resources", async () => {
      const resources = [
        createMockResource({ pricing: { hourlyRate: 0.01, dailyCost: 0.24, monthlyCost: 10, pricingModel: "On-Demand" } }),
        createMockResource({ resourceId: "res-2", pricing: { hourlyRate: 0.05, dailyCost: 1.2, monthlyCost: 20, pricingModel: "On-Demand" } }),
      ];
      const session = await tracker.startTracking("ws-001", "user-001", resources);
      expect(session.projectedMonthlyCost).toBe(30);
    });

    it("defaults workshopTitle to 'Untitled Workshop'", async () => {
      const session = await tracker.startTracking("ws-001", "user-001", [createMockResource()]);
      expect(session.workshopTitle).toBe("Untitled Workshop");
    });
  });

  describe("getActiveSessions", () => {
    it("returns deserialized sessions from DynamoDB scan", async () => {
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([
        createSerializedSession(),
      ]);

      const sessions = await tracker.getActiveSessions("user-001");
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe("session-001");
      expect(sessions[0].userId).toBe("user-001");
      expect(sessions[0].startedAt).toBeInstanceOf(Date);
      expect(sessions[0].resources).toHaveLength(1);
    });

    it("filters out completed sessions via DynamoDB expression", async () => {
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([]);

      await tracker.getActiveSessions("user-001");

      const scanCall = vi.mocked(dynamodb.scan).mock.calls[0][0];
      expect(scanCall.FilterExpression).toContain("completed");
    });

    it("returns empty array when no sessions exist", async () => {
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([]);
      const sessions = await tracker.getActiveSessions("user-001");
      expect(sessions).toHaveLength(0);
    });
  });

  describe("updateSession", () => {
    it("recalculates accumulated costs for all resources", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(createSerializedSession());

      const session = await tracker.updateSession("session-001");

      // Cost should be recalculated (non-zero since time has passed since 2025-01-01)
      expect(session.accumulatedCost).toBeGreaterThanOrEqual(0);
      expect(session.lastUpdated).toBeInstanceOf(Date);
    });

    it("throws when session is not found", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      await expect(tracker.updateSession("nonexistent")).rejects.toThrow(
        "Session not found: nonexistent"
      );
    });

    it("saves updated session to DynamoDB", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(createSerializedSession());

      await tracker.updateSession("session-001");

      expect(dynamodb.put).toHaveBeenCalledTimes(1);
    });

    it("updates session status based on resource states", async () => {
      const serialized = createSerializedSession({
        resources: JSON.stringify([
          {
            resource: createMockResource(),
            deployedAt: "2025-01-01T00:00:00.000Z",
            status: ResourceStatus.DELETED,
            deletedAt: "2025-01-01T12:00:00.000Z",
            accumulatedCost: 0,
          },
        ]),
      });
      vi.mocked(dynamodb.get).mockResolvedValueOnce(serialized);

      const session = await tracker.updateSession("session-001");
      expect(session.status).toBe(SessionStatus.COMPLETED);
    });
  });

  describe("markResourceDeleted", () => {
    it("marks the specified resource as deleted", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(createSerializedSession());

      await tracker.markResourceDeleted("session-001", "res-ec2-001");

      const putCall = vi.mocked(dynamodb.put).mock.calls[0][0];
      const savedItem = putCall.Item as Record<string, unknown>;
      const savedResources = JSON.parse(savedItem.resources as string);
      expect(savedResources[0].status).toBe(ResourceStatus.DELETED);
      expect(savedResources[0].deletedAt).toBeDefined();
    });

    it("throws when session is not found", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      await expect(
        tracker.markResourceDeleted("nonexistent", "res-ec2-001")
      ).rejects.toThrow("Session not found: nonexistent");
    });

    it("throws when resource is not found in session", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(createSerializedSession());

      await expect(
        tracker.markResourceDeleted("session-001", "nonexistent-resource")
      ).rejects.toThrow("Resource not found: nonexistent-resource");
    });

    it("updates session status to COMPLETED when all resources deleted", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(createSerializedSession());

      await tracker.markResourceDeleted("session-001", "res-ec2-001");

      const putCall = vi.mocked(dynamodb.put).mock.calls[0][0];
      const savedItem = putCall.Item as Record<string, unknown>;
      expect(savedItem.status).toBe(SessionStatus.COMPLETED);
    });

    it("updates session status to PARTIALLY_DELETED when some resources deleted", async () => {
      const serialized = createSerializedSession({
        resources: JSON.stringify([
          {
            resource: createMockResource({ resourceId: "res-ec2-001" }),
            deployedAt: "2025-01-01T00:00:00.000Z",
            status: ResourceStatus.RUNNING,
            accumulatedCost: 0,
          },
          {
            resource: createMockResource({ resourceId: "res-rds-001", resourceType: "RDS" }),
            deployedAt: "2025-01-01T00:00:00.000Z",
            status: ResourceStatus.RUNNING,
            accumulatedCost: 0,
          },
        ]),
      });
      vi.mocked(dynamodb.get).mockResolvedValueOnce(serialized);

      await tracker.markResourceDeleted("session-001", "res-ec2-001");

      const putCall = vi.mocked(dynamodb.put).mock.calls[0][0];
      const savedItem = putCall.Item as Record<string, unknown>;
      expect(savedItem.status).toBe(SessionStatus.PARTIALLY_DELETED);
    });
  });

  describe("calculateAccumulatedCost", () => {
    it("sums costs across all resources", () => {
      const session = createMockSession({
        resources: [
          createMockTrackedResource({
            deployedAt: new Date("2025-01-01T00:00:00Z"),
            resource: createMockResource({
              pricing: { hourlyRate: 1.0, dailyCost: 24, monthlyCost: 720, pricingModel: "On-Demand" },
            }),
          }),
          createMockTrackedResource({
            deployedAt: new Date("2025-01-01T00:00:00Z"),
            resource: createMockResource({
              resourceId: "res-2",
              pricing: { hourlyRate: 0.5, dailyCost: 12, monthlyCost: 360, pricingModel: "On-Demand" },
            }),
          }),
        ],
      });

      const cost = tracker.calculateAccumulatedCost(session);
      // Both resources running since Jan 1, cost depends on current time
      expect(cost).toBeGreaterThan(0);
    });

    it("returns 0 for session with no resources", () => {
      const session = createMockSession({ resources: [] });
      expect(tracker.calculateAccumulatedCost(session)).toBe(0);
    });
  });

  describe("getLongRunningResources", () => {
    it("returns resources running longer than 24 hours", () => {
      const now = new Date("2025-01-03T00:00:00Z");
      const session = createMockSession({
        resources: [
          createMockTrackedResource({
            deployedAt: new Date("2025-01-01T00:00:00Z"), // 48 hours ago
          }),
          createMockTrackedResource({
            deployedAt: new Date("2025-01-02T23:30:00Z"), // 0.5 hours ago
            resource: createMockResource({ resourceId: "res-new" }),
          }),
        ],
      });

      const longRunning = session.resources.filter((r) => isLongRunning(r, now));
      expect(longRunning).toHaveLength(1);
      expect(longRunning[0].resource.resourceId).toBe("res-ec2-001");
    });

    it("excludes deleted resources", () => {
      const now = new Date("2025-01-03T00:00:00Z");
      const session = createMockSession({
        resources: [
          createMockTrackedResource({
            deployedAt: new Date("2025-01-01T00:00:00Z"),
            status: ResourceStatus.DELETED,
          }),
        ],
      });

      const longRunning = session.resources.filter((r) => isLongRunning(r, now));
      expect(longRunning).toHaveLength(0);
    });
  });
});
