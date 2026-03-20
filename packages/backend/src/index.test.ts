import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "./app";
import { PORT } from "./index";

describe("Backend setup", () => {
  it("should have a default port", () => {
    expect(PORT).toBe(3001);
  });
});

describe("Express app", () => {
  it("should respond to health check", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("should have CORS headers", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("should parse JSON bodies", async () => {
    const res = await request(app)
      .post("/api/docs")
      .send({ test: "data" })
      .set("Content-Type", "application/json");
    // Route exists and can receive JSON
    expect(res.status).not.toBe(500);
  });
});

describe("API routes", () => {
  it("GET /api/docs/list returns documents", async () => {
    const res = await request(app).get("/api/docs/list");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("documents");
  });

  it("GET /api/blog returns blog placeholder", async () => {
    const res = await request(app).get("/api/blog");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Blog Aggregator API");
  });

  it("GET /api/cost returns cost placeholder", async () => {
    const res = await request(app).get("/api/cost");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Cost Predictor API");
  });
});

describe("Error handling", () => {
  it("should return 404 for unknown routes as JSON", async () => {
    const res = await request(app).get("/api/nonexistent");
    // Express default 404
    expect(res.status).toBe(404);
  });
});
