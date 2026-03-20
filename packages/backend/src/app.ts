import express from "express";
import cors from "cors";
import apiRouter from "./routes";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for large document uploads
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(requestLogger);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// API routes
app.use("/api", apiRouter);

// Error handling (must be last)
app.use(errorHandler);

export default app;
