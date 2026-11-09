export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'unsupported_document'
  | 'internal';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly extra?: Record<string, unknown>;
  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
    extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.extra = extra;
  }
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, 'bad_request', message, details);
}

export function unauthorized(message = 'Unauthorized'): ApiError {
  return new ApiError(401, 'unauthorized', message);
}

export function notFound(message = 'Not found'): ApiError {
  return new ApiError(404, 'not_found', message);
}

export function conflict(message: string, extra?: Record<string, unknown>): ApiError {
  return new ApiError(409, 'conflict', message, undefined, extra);
}

export function unsupportedDocument(message: string, details?: unknown): ApiError {
  return new ApiError(422, 'unsupported_document', message, details);
}
