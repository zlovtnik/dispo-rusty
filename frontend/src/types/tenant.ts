export interface Tenant {
  id: string;
  name: string;
  db_url: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTenantDTO {
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
