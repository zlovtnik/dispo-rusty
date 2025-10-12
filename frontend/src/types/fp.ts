import type { Result as NeverthrowResult, ResultAsync as NeverthrowResultAsync } from 'neverthrow';

export type Result<T, E> = NeverthrowResult<T, E>;
export type AsyncResult<T, E> = NeverthrowResultAsync<T, E>;

export type Option<T> = SomeOption<T> | NoneOption;

export interface SomeOption<T> {
  readonly kind: 'some';
  readonly value: T;
}

export interface NoneOption {
  readonly kind: 'none';
}

const noneValue: NoneOption = { kind: 'none' } as const;

export const some = <T>(value: T): Option<T> => ({ kind: 'some', value });
export const none = <T = never>(): Option<T> => noneValue as Option<T>;

export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value === null || value === undefined ? none() : some(value);

export const isSome = <T>(option: Option<T>): option is SomeOption<T> => option.kind === 'some';
export const isNone = <T>(option: Option<T>): option is NoneOption => option.kind === 'none';

export const mapOption = <T, U>(option: Option<T>, mapper: (value: T) => U): Option<U> =>
  isSome(option) ? some(mapper(option.value)) : none();

export const unwrapOr = <T>(option: Option<T>, defaultValue: T): T =>
  isSome(option) ? option.value : defaultValue;

export type Brand<T, Identifier extends string> = T & { readonly __brand: Identifier };
