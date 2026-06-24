/** Canonical application error codes and their HTTP status mapping. */

export const ErrorCode = {
  VALIDATION: "VALIDATION",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNAUTHORIZED: "UNAUTHORIZED",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  INTERNAL: 500,
};

export const statusForCode = (code: ErrorCode): number => STATUS_BY_CODE[code];

/**
 * Throw this anywhere in a handler; the central error middleware maps it to the
 * typed API envelope and the right HTTP status. This is the single place where
 * domain failures (e.g. a DynamoDB ConditionalCheckFailed) become HTTP codes.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusForCode(code);
    this.details = details;
  }

  static notFound(message = "Resource not found", details?: unknown): AppError {
    return new AppError(ErrorCode.NOT_FOUND, message, details);
  }

  static conflict(message = "Resource already exists", details?: unknown): AppError {
    return new AppError(ErrorCode.CONFLICT, message, details);
  }
}
