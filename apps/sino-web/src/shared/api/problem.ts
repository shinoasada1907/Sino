export interface FieldError {
  field: string
  message: string
}

/** `code` of a request that never got an answer (no network, server down). */
export const NETWORK_ERROR = 'NETWORK_ERROR'

const STANDARD_MEMBERS = new Set(['type', 'title', 'status', 'detail', 'instance', 'code', 'errors'])

/**
 * Every failed API call, whatever went wrong: the HTTP status (0 when there was no answer), the stable `code` of the
 * backend catalog, its `detail`, the field errors of a validation failure, and any other member of the Problem Details
 * body (`remainingAttempts`, `retryAfterSeconds`…) in `extra`.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly detail: string | null
  readonly errors: FieldError[]
  readonly extra: Record<string, unknown>

  constructor(status: number, code: string, detail: string | null, errors: FieldError[] = [], extra: Record<string, unknown> = {}) {
    super(detail ?? code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
    this.errors = errors
    this.extra = extra
  }
}

/** Reads an error response. A body that is not Problem Details (a proxy page, an empty body) is named by its status. */
export async function toApiError(response: Response): Promise<ApiError> {
  const type = response.headers.get('Content-Type') ?? ''
  const body: unknown = type.includes('json') ? await response.json().catch(() => null) : null
  if (!isRecord(body) || typeof body.code !== 'string') {
    return new ApiError(response.status, `HTTP_${response.status}`, null)
  }
  const extra = Object.fromEntries(Object.entries(body).filter(([name]) => !STANDARD_MEMBERS.has(name)))
  return new ApiError(
    response.status,
    body.code,
    typeof body.detail === 'string' ? body.detail : null,
    Array.isArray(body.errors) ? body.errors.filter(isFieldError) : [],
    extra,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFieldError(value: unknown): value is FieldError {
  return isRecord(value) && typeof value.field === 'string' && typeof value.message === 'string'
}
