import type { TenantId } from './ids';

export interface Tenant {
  id: TenantId;
  name: string;
  db_url: string;
  isActive?: boolean;
  settings?: {
    theme?: string;
    language?: string;
    timezone?: string;
    features?: string[];
  };
  created_at: string;
  updated_at: string;
}

export interface CreateTenantDTO {
  id: string;
  name: string;
  db_url: string;
}

export interface UpdateTenantDTO {
  name?: string;
  db_url?: string;
}

export interface TenantListParams {
  page?: number;
  limit?: number;
  search?: string;
  cursor?: number;
}

export interface PaginatedTenantResponse {
  data: Tenant[];
  total: number;
  offset?: number;
  limit?: number;
}
