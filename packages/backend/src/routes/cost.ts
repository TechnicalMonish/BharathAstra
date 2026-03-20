import { Router, Request, Response, NextFunction } from "express";
import { CleanupMethod, TutorialFormat } from "@aws-intel/shared";
import type { WorkshopFilter, NotificationConfig } from "@aws-intel/shared";
import { AppError } from "../middleware/errorHandler";
import { WorkshopManager } from "../services/cost-predictor/workshopManager";
import { CostAnalyzer } from "../services/cost-predictor/costAnalyzer";
import { HiddenCostDetector } from "../services/cost-predictor/hiddenCostDetector";
import { ResourceTracker } from "../services/cost-predictor/resourceTracker";
import { CleanupScriptGenerator } from "../services/cost-predictor/cleanupScriptGenerator";
import { NotificationManager } from "../services/cost-predictor/notificationManager";
import { TutorialCostDatabase } from "../services/cost-predictor/tutorialCostDatabase";

const router = Router();

// --- Service instances ---
const workshopManager = new WorkshopManager();
const costAnalyzer = new CostAnalyzer();
const hiddenCostDetector = new HiddenCostDetector();
const resourceTracker = new ResourceTracker();
const cleanupScriptGenerator = new CleanupScriptGenerator();
const notificationManager = new NotificationManager();
const tutorialCostDatabase = new TutorialCostDatabase();

const DEFAULT_USER_ID = "default-user";

// --- Helper: async route wrapper ---
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// --- Root endpoint ---
router.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Cost Predictor API" });
});

/**
 * GET /api/cost/workshops
 * List workshops with optional filters and cost badges.
 * Requirements: 29.3, 30.1
 */
router.get(
  "/workshops",
  asyncHandler(async (req, res) => {
    const { category, searchTerm, costRange } = req.query;

    const filter: WorkshopFilter = {};
    if (typeof category === "string" && category.length > 0) {
      filter.category = category;
    }
    if (typeof searchTerm === "string" && searchTerm.length > 0) {
      filter.searchTerm = searchTerm;
    }
    if (typeof costRange === "string" && costRange.length > 0) {
      filter.costRange = costRange as WorkshopFilter["costRange"];
    }

    const workshops = await workshopManager.listWorkshops(
      Object.keys(filter).length > 0 ? filter : undefined
    );

    res.json({ workshops, total: workshops.length });
  })
);

/**
 * GET /api/cost/workshops/:workshopId
 * Get workshop details with cost analysis.
 * Requirements: 29.3, 30.4, 30.5
 */
router.get(
  "/workshops/:workshopId",
  asyncHandler(async (req, res) => {
    const { workshopId } = req.params;

    if (!workshopId) {
      throw new AppError(400, "BadRequest", "Workshop ID is required");
    }

    const workshop = await workshopManager.getWorkshop(workshopId);

    res.json({ workshop });
  })
);


/**
 * POST /api/cost/scan
 * Scan a workshop or custom tutorial URL for costs.
 * Requirements: 32.1
 */
router.post(
  "/scan",
  asyncHandler(async (req, res) => {
    const { url, workshopId, content, format } = req.body;

    // Either URL, workshopId, or content must be provided
    if (!url && !workshopId && !content) {
      throw new AppError(
        400,
        "BadRequest",
        "Either url, workshopId, or content is required"
      );
    }

    let tutorialContent: string;
    let tutorialFormat: TutorialFormat | undefined;
    let tutorialTitle = "Custom Tutorial";
    let tutorialUrl: string | undefined;

    if (workshopId) {
      // Scan an existing workshop
      const workshop = await workshopManager.getWorkshop(workshopId);
      tutorialContent = workshop.instructions;
      tutorialTitle = workshop.info.title;
      tutorialUrl = workshop.sourceUrl;
    } else if (url) {
      // Add custom tutorial by URL and scan it
      const workshop = await workshopManager.addCustomTutorial(url);
      tutorialContent = workshop.instructions;
      tutorialTitle = workshop.info.title;
      tutorialUrl = url;
    } else {
      // Scan provided content directly
      tutorialContent = content;
      tutorialFormat = format as TutorialFormat | undefined;
    }

    // Analyze the tutorial for costs
    const tutorial = {
      url: tutorialUrl,
      content: tutorialContent,
      format: tutorialFormat ?? TutorialFormat.INSTRUCTIONAL_TEXT,
    };

    const costAnalysis = await costAnalyzer.analyzeTutorial(tutorial);

    // Detect hidden costs
    const hiddenCosts = hiddenCostDetector.detectHiddenCosts(tutorial, costAnalysis);

    // Merge hidden costs into the analysis
    const fullAnalysis = {
      ...costAnalysis,
      hiddenCosts: [...costAnalysis.hiddenCosts, ...hiddenCosts],
    };

    res.json({
      title: tutorialTitle,
      url: tutorialUrl,
      costAnalysis: fullAnalysis,
    });
  })
);

/**
 * GET /api/cost/tracking
 * Get user's active tracking sessions.
 * Requirements: 34.3
 */
router.get(
  "/tracking",
  asyncHandler(async (req, res) => {
    const userId = (req.query.userId as string) || DEFAULT_USER_ID;

    const sessions = await resourceTracker.getActiveSessions(userId);

    // Get long-running resources for each session
    const sessionsWithWarnings = sessions.map((session) => ({
      ...session,
      longRunningResources: resourceTracker.getLongRunningResources(session),
    }));

    res.json({ sessions: sessionsWithWarnings, total: sessions.length });
  })
);

/**
 * POST /api/cost/tracking/start
 * Start tracking resources for a tutorial.
 * Requirements: 34.3
 */
router.post(
  "/tracking/start",
  asyncHandler(async (req, res) => {
    const { workshopId, userId, resources, workshopTitle } = req.body;

    if (!workshopId) {
      throw new AppError(400, "BadRequest", "workshopId is required");
    }

    if (!resources || !Array.isArray(resources)) {
      throw new AppError(400, "BadRequest", "resources array is required");
    }

    const effectiveUserId = userId || DEFAULT_USER_ID;
    const effectiveTitle = workshopTitle || "Untitled Workshop";

    const session = await resourceTracker.startTracking(
      workshopId,
      effectiveUserId,
      resources,
      effectiveTitle
    );

    res.status(201).json({ session });
  })
);

/**
 * PUT /api/cost/tracking/:sessionId/resource/:resourceId/delete
 * Mark resource as deleted.
 * Requirements: 34.3
 */
router.put(
  "/tracking/:sessionId/resource/:resourceId/delete",
  asyncHandler(async (req, res) => {
    const { sessionId, resourceId } = req.params;

    if (!sessionId) {
      throw new AppError(400, "BadRequest", "Session ID is required");
    }

    if (!resourceId) {
      throw new AppError(400, "BadRequest", "Resource ID is required");
    }

    await resourceTracker.markResourceDeleted(sessionId, resourceId);

    res.json({ deleted: resourceId, sessionId });
  })
);


/**
 * GET /api/cost/cleanup/:sessionId
 * Generate cleanup script for a session.
 * Requirements: 36.4
 */
router.get(
  "/cleanup/:sessionId",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { method } = req.query;

    if (!sessionId) {
      throw new AppError(400, "BadRequest", "Session ID is required");
    }

    // Get the session first
    const userId = (req.query.userId as string) || DEFAULT_USER_ID;
    const sessions = await resourceTracker.getActiveSessions(userId);
    const session = sessions.find((s) => s.sessionId === sessionId);

    if (!session) {
      throw new AppError(404, "NotFound", `Session not found: ${sessionId}`);
    }

    // Determine cleanup method (default to AWS CLI)
    let cleanupMethod: CleanupMethod;
    switch (method) {
      case "cloudformation":
        cleanupMethod = CleanupMethod.CLOUDFORMATION;
        break;
      case "terraform":
        cleanupMethod = CleanupMethod.TERRAFORM;
        break;
      default:
        cleanupMethod = CleanupMethod.AWS_CLI;
    }

    const cleanupScript = cleanupScriptGenerator.generateScript(
      session,
      cleanupMethod
    );

    res.json({
      sessionId,
      workshopTitle: session.workshopTitle,
      cleanupScript,
    });
  })
);

/**
 * GET /api/cost/notifications
 * Get user notifications.
 * Requirements: 37.3
 */
router.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const userId = (req.query.userId as string) || DEFAULT_USER_ID;

    const notifications = await notificationManager.getUserNotifications(userId);

    // Filter to only show non-dismissed notifications by default
    const showDismissed = req.query.showDismissed === "true";
    const filteredNotifications = showDismissed
      ? notifications
      : notifications.filter((n) => !n.dismissed);

    res.json({
      notifications: filteredNotifications,
      total: filteredNotifications.length,
    });
  })
);

/**
 * PUT /api/cost/notifications/:id/dismiss
 * Dismiss a notification.
 * Requirements: 37.3
 */
router.put(
  "/notifications/:id/dismiss",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!id) {
      throw new AppError(400, "BadRequest", "Notification ID is required");
    }

    await notificationManager.dismissNotification(id);

    res.json({ dismissed: id });
  })
);

/**
 * PUT /api/cost/notifications/config
 * Configure notification thresholds.
 * Requirements: 37.3
 */
router.put(
  "/notifications/config",
  asyncHandler(async (req, res) => {
    const { userId, costThreshold, timeThreshold, enabled, channels } = req.body;

    const effectiveUserId = userId || DEFAULT_USER_ID;

    // Get current config and merge with updates
    const currentConfig = await notificationManager.getUserConfig(effectiveUserId);

    const newConfig: NotificationConfig = {
      costThreshold: costThreshold ?? currentConfig.costThreshold,
      timeThreshold: timeThreshold ?? currentConfig.timeThreshold,
      enabled: enabled ?? currentConfig.enabled,
      channels: channels ?? currentConfig.channels,
    };

    await notificationManager.configureThresholds(effectiveUserId, newConfig);

    res.json({ config: newConfig });
  })
);

export default router;
