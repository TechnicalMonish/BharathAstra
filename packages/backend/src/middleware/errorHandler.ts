import { Request, Response, NextFunction } from "express";

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}

export class AppError extends Error {
  public statusCode: number;
  public error: string;

  constructor(statusCode: number, error: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.error = error;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.error,
      message: err.message,
      statusCode: err.statusCode,
    } satisfies ErrorResponse);
    return;
  }

  console.error("Unhandled error:", err.message, err.stack);
  res.status(500).json({
    error: "InternalServerError",
    message: err.message || "An unexpected error occurred",
    statusCode: 500,
  } satisfies ErrorResponse);
}
