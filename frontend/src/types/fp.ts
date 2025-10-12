import type { Result as NeverthrowResult, ResultAsync as NeverthrowResultAsync } from 'neverthrow';

export type Result<T, E> = NeverthrowResult<T, E>;
export type AsyncResult<T, E> = NeverthrowResultAsync<T, E>;
export type Option<T> = T | null | undefined;

export type Brand<T, Identifier extends string> = T & { readonly __brand: Identifier };
