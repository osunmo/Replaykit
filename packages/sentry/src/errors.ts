export type SentryErrorCode =
  | 'INVALID_SENTRY_URL'
  | 'INVALID_ISSUE_ID'
  | 'INVALID_EVENT_ID'
  | 'UNAPPROVED_ORIGIN'
  | 'INVALID_SELF_HOSTED_BASE'
  | 'PRIVATE_ADDRESS'
  | 'DNS_FAILED'
  | 'MISSING_TOKEN'
  | 'INVALID_TOKEN'
  | 'REQUEST_TIMEOUT'
  | 'NETWORK_ERROR'
  | 'REDIRECT_REJECTED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'API_ERROR'
  | 'RESPONSE_TOO_LARGE'
  | 'INVALID_RESPONSE'
  | 'UNSUPPORTED_REVISION'
  | 'INVALID_REVISION_MAPPING'
  | 'UNSAFE_FIXTURE'
  | 'NO_APPLICATION_FRAME'
  | 'EVENT_ID_MISMATCH';

// Never include server response bodies, URLs, supplied input or nested transport errors.
export class SentryImportError extends Error {
  override name = 'SentryImportError';
  constructor(readonly code: SentryErrorCode) {
    super(`Sentry import failed: ${code}`);
  }
}
