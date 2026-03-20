import { Router } from "express";
import docsRouter from "./docs";
import blogRouter from "./blog";
import costRouter from "./cost";

const router = Router();

router.use("/docs", docsRouter);
router.use("/blog", blogRouter);
router.use("/cost", costRouter);

export default router;
