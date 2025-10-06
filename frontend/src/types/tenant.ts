export interface Tenant {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTenantDTO {
  name: string;
}

export interface UpdateTenantDTO {
  name?: string;
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
