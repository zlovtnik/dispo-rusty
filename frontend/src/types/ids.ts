import type { Brand } from './fp';

export type UserId = Brand<string, 'UserId'>;
export type TenantId = Brand<string, 'TenantId'>;
export type ContactId = Brand<string, 'ContactId'>;

export const asUserId = (value: string): UserId => value as UserId;
export const asTenantId = (value: string): TenantId => value as TenantId;
export const asContactId = (value: string): ContactId => value as ContactId;
