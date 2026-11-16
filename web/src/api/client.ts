import axios, { isAxiosError, type AxiosInstance } from 'axios'

const API_ORIGIN = String(import.meta.env.VITE_API_URL ?? 'http://localhost:8081').replace(/\/+$/, '')

// One shared axios instance: every request goes to <API_ORIGIN>/api/v1/...
export const api: AxiosInstance = axios.create({
  baseURL: `${API_ORIGIN}/api/v1`,
  timeout: 40_000, // the Go API gives up on Business Central after 30 seconds
  headers: { Accept: 'application/json' },
})

// Every failure becomes an ApiError so the UI can handle errors the same way everywhere.
export class ApiError extends Error {
  status: number
  code: string
  fields: Record<string, string>
  requestId?: string

  constructor(
    status: number,
    code: string,
    message: string,
    fields: Record<string, string> = {},
    requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
    this.requestId = requestId
  }
}

// The error shape the Go API returns: {"error":{"code","message","fields","requestId"}}
interface ErrorBody {
  error?: {
    code?: string
    message?: string
    fields?: Record<string, string>
    requestId?: string
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  // A plain object (axios converts it to JSON) or an already-serialised JSON string.
  body?: unknown
  // Lets TanStack Query cancel a request that is no longer needed.
  signal?: AbortSignal
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    const response = await api.request<T>({
      url: path,
      method: options.method ?? 'GET',
      data: options.body,
      signal: options.signal,
      // Needed when the body is a JSON string: axios would otherwise label a
      // string body as a form post.
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    })
    return response.data
  } catch (error) {
    // A request cancelled on purpose is not a failure; let TanStack Query handle it.
    if (axios.isCancel(error)) throw error
    throw toApiError(error)
  }
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (isAxiosError(error)) {
    const response = error.response

    // No response at all: the API is down, the URL is wrong, CORS blocked it, or it timed out.
    if (!response) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return new ApiError(0, 'TIMEOUT', 'The server took too long to respond. Please try again.')
      }
      return new ApiError(
        0,
        'NETWORK_ERROR',
        'Cannot reach the portal server. Check that the API is running and try again.',
      )
    }

    // The server answered with an error status. Read our error shape if present;
    // anything else (such as an HTML error page from a proxy) gets a generic message.
    const data: unknown = response.data
    const detail = typeof data === 'object' && data !== null ? (data as ErrorBody).error : undefined
    return new ApiError(
      response.status,
      detail?.code ?? 'HTTP_ERROR',
      detail?.message ?? `The request failed (HTTP ${response.status}).`,
      detail?.fields ?? {},
      detail?.requestId,
    )
  }

  return new ApiError(0, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.')
}