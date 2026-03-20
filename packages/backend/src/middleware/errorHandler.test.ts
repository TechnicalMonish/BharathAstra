import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { errorHandler, AppError } from "./errorHandler";

function createTestApp() {
  const app = express();

  app.get("/app-error", (_req, _res, next) => {
    next(new AppError(400, "BadRequest", "Invalid input"));
  });

  app.get("/generic-error", (_req, _res, next) => {
    next(new Error("something broke"));
  });

  app.use(errorHandler);
  return app;
}

describe("errorHandler middleware", () => {
  const app = createTestApp();

  it("should return structured response for AppError", async () => {
    const res = await request(app).get("/app-error");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "BadRequest",
      message: "Invalid input",
      statusCode: 400,
    });
  });

  it("should return 500 for generic errors", async () => {
    const res = await request(app).get("/generic-error");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: "InternalServerError",
      message: "An unexpected error occurred",
      statusCode: 500,
    });
  });
});
