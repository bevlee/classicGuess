import { error, isHttpError } from '@sveltejs/kit';
export function apiFailure(cause: unknown): never {
  if (isHttpError(cause)) throw cause;
  console.error('Daily API request failed:', cause instanceof Error ? cause.name : 'Unknown error');
  error(503, 'The daily service is temporarily unavailable. Please try again.');
}
