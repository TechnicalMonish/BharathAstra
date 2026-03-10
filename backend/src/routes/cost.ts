import { Router, Request, Response, NextFunction } from "express";
import { CostPredictorService } from "../services/costService";
import { CostPredictionRequest } from "../types";

const router = Router();
const costService = new CostPredictorService();

/**
 * POST /api/cost/predict
 * Accepts a natural language cost specification and returns estimated AWS costs,
 * free tier info, and optimization suggestions for identified services.
 */
router.post(
  "/predict",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { specification } = req.body as CostPredictionRequest;

      const result = await costService.predict(specification);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
