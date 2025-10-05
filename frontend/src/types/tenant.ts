export interface Tenant {
  id: string;
  name: string;
  db_url: string;
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

export interface TenantListResponse {
  message: string;
  data: Tenant[];
  current_cursor?: number;
  page_size?: number;
  total_elements?: number;
  next_cursor?: number;
}
