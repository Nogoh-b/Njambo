import { HttpsError, type FunctionsErrorCode } from "firebase-functions/v2/https";
import type { Response } from "express";

const STATUS_BY_CODE: Partial<Record<FunctionsErrorCode, number>> = {
  "unauthenticated": 401,
  "permission-denied": 403,
  "invalid-argument": 400,
  "out-of-range": 400,
  "not-found": 404,
  "already-exists": 409,
  "aborted": 409,
  "resource-exhausted": 429,
  "failed-precondition": 412,
  "unimplemented": 501,
  "unavailable": 503,
};

export function sendError(res: Response, error: unknown) {
  if (error instanceof HttpsError) {
    const status = STATUS_BY_CODE[error.code] ?? 500;
    res.status(status).json({ code: error.code, message: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ code: "internal", message: "INTERNAL_ERROR" });
}
