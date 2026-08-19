import { AxiosError } from 'axios';

import type { ApiErrorBody } from '../types/api';

/**
 * Every agent error response is either {detail: string} (most 4xx/500) or
 * {detail: [{loc, msg, type}, ...]} (422 Pydantic validation errors).
 */
export function getApiErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const body = err.response?.data as ApiErrorBody | undefined;
    if (body?.detail) {
      if (typeof body.detail === 'string') return body.detail;
      return body.detail.map((d) => d.msg).join('; ');
    }
    if (err.message) return err.message;
  }
  return 'Something went wrong';
}
