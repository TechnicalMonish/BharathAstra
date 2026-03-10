import { Router, Request, Response, NextFunction } from "express";
import { ResourceAggregatorService } from "../services/resourceService";
import { ResourceSearchRequest } from "../types";

const router = Router();
const resourceService = new ResourceAggregatorService();

/**
 * POST /api/resources/search
 * Searches external web sources for AWS-related content matching the query.
 * Returns ranked SearchResults categorized by resource type (blog, video, article).
 */
router.post(
  "/search",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = req.body as ResourceSearchRequest;

      const result = await resourceService.search(query);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
