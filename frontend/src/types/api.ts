import type { AppError } from './errors';

export interface ApiSuccessResponse<T> {
  readonly status: 'success';
  readonly data: T;
  readonly message?: string;
}

export interface ApiErrorResponse {
  readonly status: 'error';
  readonly error: AppError;
  readonly message?: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export const createSuccessResponse = <T>(data: T, message?: string): ApiSuccessResponse<T> => ({
  status: 'success',
  data,
  message,
});

export const createErrorResponse = (error: AppError, message?: string): ApiErrorResponse => ({
  status: 'error',
  error,
  message,
});

export const isApiSuccess = <T>(response: ApiResponse<T>): response is ApiSuccessResponse<T> =>
  response.status === 'success';
export const isApiError = <T>(response: ApiResponse<T>): response is ApiErrorResponse =>
  response.status === 'error';
