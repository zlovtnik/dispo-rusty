/**
 * Tenant Isolation Service
 * Provides database isolation and tenant-scoped data access
 */

import { ok, err } from 'neverthrow';
import type { Result } from '@/types/fp';
import type { AppError } from '@/types/errors';
import { createBusinessLogicError, createNetworkError } from '@/types/errors';
import type { Tenant } from '@/types/tenant';
import { tenantContextService } from './TenantContextService';

/**
 * Database connection interface
 */
export interface DatabaseConnection {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<void>;
  transaction<T>(callback: (conn: DatabaseConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Tenant database configuration
 */
export interface TenantDatabaseConfig {
  tenantId: string;
  dbUrl: string;
  dbName: string;
  schema?: string;
  connectionPool?: {
    min: number;
    max: number;
    idle: number;
  };
}

/**
 * SECURITY: Whitelisted table names to prevent SQL injection
 * Only add tables that should be accessible through this service
 */
const ALLOWED_TABLES = new Set([
  'tenant_contacts',
  'tenant_users',
  'tenant_audit_log',
  'tenant_activity_log',
  'tenant_metrics',
  'tenant_performance',
  'tenant_settings',
  'tenant_features',
]);

/**
 * SECURITY: Whitelisted column names to prevent SQL injection
 */
const ALLOWED_COLUMNS = new Set([
  'id',
  'tenant_id',
  'user_id',
  'first_name',
  'last_name',
  'email',
  'phone',
  'company',
  'job_title',
  'created_at',
  'updated_at',
  'is_active',
  'status',
  'role',
  'name',
  'type',
  'value',
  'count',
]);

/**
 * SECURITY: Validate and sanitize table name against whitelist
 * @throws Error if table is not in whitelist
 */
function validateTableName(table: string): void {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Invalid table name: ${table}. Table must be whitelisted.`);
  }
}

/**
 * SECURITY: Validate and sanitize column name against whitelist
 * @throws Error if column is not in whitelist
 */
function validateColumnName(column: string): void {
  if (!ALLOWED_COLUMNS.has(column)) {
    throw new Error(`Invalid column name: ${column}. Column must be whitelisted.`);
  }
}

/**
 * SECURITY: Validate order direction to prevent injection
 */
function validateOrderDirection(direction: string): 'ASC' | 'DESC' {
  const upper = direction.toUpperCase();
  if (upper !== 'ASC' && upper !== 'DESC') {
    throw new Error('Order direction must be ASC or DESC');
  }
  return upper as 'ASC' | 'DESC';
}

/**
 * Tenant isolation service class
 */
export class TenantIsolationService {
  private static instance: TenantIsolationService;
  private connections = new Map<string, DatabaseConnection>();
  private connectionConfigs = new Map<string, TenantDatabaseConfig>();

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): TenantIsolationService {
    if (!TenantIsolationService.instance) {
      TenantIsolationService.instance = new TenantIsolationService();
    }
    return TenantIsolationService.instance;
  }

  /**
   * Get database connection for tenant
   */
  async getTenantConnection(tenantId: string): Promise<Result<DatabaseConnection, AppError>> {
    try {
      // Check if connection already exists
      if (this.connections.has(tenantId)) {
        const connection = this.connections.get(tenantId)!;
        return ok(connection);
      }

      // Get tenant configuration
      const config = this.connectionConfigs.get(tenantId);
      if (!config) {
        return err(
          createBusinessLogicError(
            `No database configuration found for tenant ${tenantId}`,
            { tenantId },
            { code: 'TENANT_NOT_FOUND' }
          )
        );
      }

      // Create new connection
      const connection = await this.createConnection(config);
      this.connections.set(tenantId, connection);

      return ok(connection);
    } catch (error) {
      return err(
        createNetworkError(
          `Failed to get database connection for tenant ${tenantId}`,
          { tenantId },
          { code: 'CONNECTION_FAILED', cause: error }
        )
      );
    }
  }

  /**
   * Create database connection
   */
  private async createConnection(config: TenantDatabaseConfig): Promise<DatabaseConnection> {
    // In a real implementation, you would create an actual database connection
    // This is a mock implementation
    return {
      query: async <T = any>(sql: string, params?: any[]): Promise<T[]> => {
        // Mock query execution
        console.log(`Executing query for tenant ${config.tenantId}:`, sql, params);
        return [];
      },
      execute: async (sql: string, params?: any[]): Promise<void> => {
        // Mock query execution
        console.log(`Executing query for tenant ${config.tenantId}:`, sql, params);
      },
      transaction: async <T>(callback: (conn: DatabaseConnection) => Promise<T>): Promise<T> => {
        // Mock transaction
        console.log(`Starting transaction for tenant ${config.tenantId}`);
        const mockConn = this as unknown as DatabaseConnection;
        const result = await callback(mockConn);
        console.log(`Committing transaction for tenant ${config.tenantId}`);
        return result;
      },
      close: async (): Promise<void> => {
        console.log(`Closing connection for tenant ${config.tenantId}`);
      },
    };
  }

  /**
   * Register tenant database configuration
   */
  registerTenantDatabase(config: TenantDatabaseConfig): void {
    this.connectionConfigs.set(config.tenantId, config);
  }

  /**
   * Remove tenant database configuration
   */
  unregisterTenantDatabase(tenantId: string): void {
    this.connectionConfigs.delete(tenantId);

    // Close connection if exists
    const connection = this.connections.get(tenantId);
    if (connection) {
      connection.close();
      this.connections.delete(tenantId);
    }
  }

  /**
   * Execute query in tenant context
   */
  async executeTenantQuery<T = any>(sql: string, params?: any[]): Promise<Result<T[], AppError>> {
    try {
      const context = tenantContextService.getTenantContext();
      if (!context) {
        return err(
          createBusinessLogicError('No tenant context available', undefined, { code: 'NO_TENANT_CONTEXT' })
        );
      }

      const connectionResult = await this.getTenantConnection(context.tenant.id);
      if (connectionResult.isErr()) {
        return err(connectionResult.error);
      }

      const connection = connectionResult.value;
      const results = await connection.query<T>(sql, params);

      return ok(results);
    } catch (error) {
      return err(
        createNetworkError('Failed to execute tenant query', undefined, { code: 'QUERY_FAILED', cause: error })
      );
    }
  }

  /**
   * Execute transaction in tenant context
   */
  async executeTenantTransaction<T>(
    callback: (connection: DatabaseConnection) => Promise<T>
  ): Promise<Result<T, AppError>> {
    try {
      const context = tenantContextService.getTenantContext();
      if (!context) {
        return err(
          createBusinessLogicError('No tenant context available', undefined, { code: 'NO_TENANT_CONTEXT' })
        );
      }

      const connectionResult = await this.getTenantConnection(context.tenant.id);
      if (connectionResult.isErr()) {
        return err(connectionResult.error);
      }

      const connection = connectionResult.value;
      const result = await connection.transaction(callback);

      return ok(result);
    } catch (error) {
      return err(
        createNetworkError('Failed to execute tenant transaction', undefined, {
          code: 'TRANSACTION_FAILED',
          cause: error,
        })
      );
    }
  }

  /**
   * Get tenant-scoped data
   * SECURITY: Table, column, and filter names are validated against whitelists
   */
  async getTenantData<T>(
    table: string,
    filters: Record<string, any> = {},
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      orderDirection?: 'ASC' | 'DESC';
    } = {}
  ): Promise<Result<T[], AppError>> {
    try {
      const context = tenantContextService.getTenantContext();
      if (!context) {
        return err(
          createBusinessLogicError('No tenant context available', undefined, { code: 'NO_TENANT_CONTEXT' })
        );
      }

      // SECURITY: Validate table name
      validateTableName(table);

      // Build query with tenant isolation
      let sql = `SELECT * FROM ${table} WHERE tenant_id = $1`;
      const params: any[] = [context.tenant.id];
      let paramIndex = 2;

      // Add filters with column validation
      for (const [key, value] of Object.entries(filters)) {
        validateColumnName(key);
        sql += ` AND ${key} = $${paramIndex.toString()}`;
        params.push(value);
        paramIndex++;
      }

      // Add ordering with validation
      if (options.orderBy) {
        validateColumnName(options.orderBy);
        const direction = validateOrderDirection(options.orderDirection || 'ASC');
        sql += ` ORDER BY ${options.orderBy} ${direction}`;
      }

      // Add pagination
      if (options.limit) {
        sql += ` LIMIT $${paramIndex.toString()}`;
        params.push(options.limit);
        paramIndex++;
      }

      if (options.offset) {
        sql += ` OFFSET $${paramIndex.toString()}`;
        params.push(options.offset);
      }

      return await this.executeTenantQuery<T>(sql, params);
    } catch (error) {
      return err(
        createNetworkError('Failed to retrieve tenant data', undefined, {
          code: 'DATA_RETRIEVAL_FAILED',
          cause: error,
        })
      );
    }
  }

  /**
   * Insert tenant-scoped data
   * SECURITY: Table and column names are validated
   */
  async insertTenantData<T>(
    table: string,
    data: Record<string, any>
  ): Promise<Result<T, AppError>> {
    try {
      const context = tenantContextService.getTenantContext();
      if (!context) {
        return err(
          createBusinessLogicError('No tenant context available', undefined, { code: 'NO_TENANT_CONTEXT' })
        );
      }

      // SECURITY: Validate table name
      validateTableName(table);

      // Add tenant_id to data
      const dataWithTenant = {
        ...data,
        tenant_id: context.tenant.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Validate column names
      for (const column of Object.keys(dataWithTenant)) {
        validateColumnName(column);
      }

      // Build insert query
      const columns = Object.keys(dataWithTenant);
      const values = Object.values(dataWithTenant);
      const placeholders = values.map((_, index) => `$${(index + 1).toString()}`).join(', ');

      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;

      const result = await this.executeTenantQuery<T>(sql, values);
      if (result.isErr()) {
        return err(result.error);
      }

      const firstValue = result.value[0];
      if (!firstValue) {
        return err(
          createNetworkError('No data returned from insert', undefined, {
            code: 'NO_DATA_RETURNED',
          })
        );
      }

      return ok(firstValue);
    } catch (error) {
      return err(
        createNetworkError('Failed to insert tenant data', undefined, {
          code: 'DATA_INSERTION_FAILED',
          cause: error,
        })
      );
    }
  }

  /**
   * Update tenant-scoped data
   * SECURITY: Table and column names are validated
   */
  async updateTenantData<T>(
    table: string,
    id: string,
    data: Record<string, any>
  ): Promise<Result<T, AppError>> {
    try {
      const context = tenantContextService.getTenantContext();
      if (!context) {
        return err(
          createBusinessLogicError('No tenant context available', undefined, { code: 'NO_TENANT_CONTEXT' })
        );
      }

      // SECURITY: Validate table name
      validateTableName(table);

      // Add updated_at to data
      const dataWithUpdate = {
        ...data,
        updated_at: new Date().toISOString(),
      };

      // Validate column names
      for (const column of Object.keys(dataWithUpdate)) {
        validateColumnName(column);
      }

      // Build update query
      const columns = Object.keys(dataWithUpdate);
      const values = Object.values(dataWithUpdate);
      const setClause = columns
        .map((col, index) => `${col} = $${(index + 1).toString()}`)
        .join(', ');

      const sql = `UPDATE ${table} SET ${setClause} WHERE id = $${(values.length + 1).toString()} AND tenant_id = $${(values.length + 2).toString()} RETURNING *`;
      const params = [...values, id, context.tenant.id];

      const result = await this.executeTenantQuery<T>(sql, params);
      if (result.isErr()) {
        return err(result.error);
      }

      if (result.value.length === 0) {
        return err(
          createBusinessLogicError('Record not found or access denied', undefined, { code: 'NOT_FOUND' })
        );
      }

      const firstValue = result.value[0];
      if (!firstValue) {
        return err(
          createNetworkError('No data returned from update', undefined, {
            code: 'NO_DATA_RETURNED',
          })
        );
      }

      return ok(firstValue);
    } catch (error) {
      return err(
        createNetworkError('Failed to update tenant data', undefined, {
          code: 'DATA_UPDATE_FAILED',
          cause: error,
        })
      );
    }
  }

  /**
   * Delete tenant-scoped data
   * SECURITY: Table name is validated
   */
  async deleteTenantData(table: string, id: string): Promise<Result<void, AppError>> {
    try {
      const context = tenantContextService.getTenantContext();
      if (!context) {
        return err(
          createBusinessLogicError('No tenant context available', undefined, { code: 'NO_TENANT_CONTEXT' })
        );
      }

      // SECURITY: Validate table name
      validateTableName(table);

      const sql = `DELETE FROM ${table} WHERE id = $1 AND tenant_id = $2`;
      const params = [id, context.tenant.id];

      const result = await this.executeTenantQuery(sql, params);
      if (result.isErr()) {
        return err(result.error);
      }

      return ok(undefined);
    } catch (error) {
      return err(
        createNetworkError('Failed to delete tenant data', undefined, {
          code: 'DATA_DELETION_FAILED',
          cause: error,
        })
      );
    }
  }

  /**
   * Check tenant data access
   * SECURITY: Table name is validated
   */
  async checkTenantDataAccess(table: string, id: string): Promise<Result<boolean, AppError>> {
    try {
      const context = tenantContextService.getTenantContext();
      if (!context) {
        return err(
          createBusinessLogicError('No tenant context available', undefined, { code: 'NO_TENANT_CONTEXT' })
        );
      }

      // SECURITY: Validate table name
      validateTableName(table);

      const sql = `SELECT 1 FROM ${table} WHERE id = $1 AND tenant_id = $2 LIMIT 1`;
      const params = [id, context.tenant.id];

      const result = await this.executeTenantQuery(sql, params);
      if (result.isErr()) {
        return err(result.error);
      }

      return ok(result.value.length > 0);
    } catch (error) {
      return err(
        createBusinessLogicError('Failed to check tenant data access', undefined, {
          code: 'ACCESS_CHECK_FAILED',
          cause: error,
        })
      );
    }
  }

  /**
   * Get tenant statistics
   * SECURITY: Only whitelisted tables are queried
   */
  async getTenantStatistics(): Promise<Result<Record<string, number>, AppError>> {
    try {
      const context = tenantContextService.getTenantContext();
      if (!context) {
        return err(
          createBusinessLogicError('No tenant context available', undefined, { code: 'NO_TENANT_CONTEXT' })
        );
      }

      // Get counts for various tables (all whitelisted)
      const tables = ['tenant_contacts', 'tenant_users', 'tenant_audit_log'];
      const stats: Record<string, number> = {};

      for (const table of tables) {
        const sql = `SELECT COUNT(*) as count FROM ${table} WHERE tenant_id = $1`;
        const result = await this.executeTenantQuery<{ count: string }>(sql, [context.tenant.id]);

        if (result.isOk() && result.value.length > 0 && result.value[0]) {
          stats[table] = parseInt(result.value[0].count);
        }
      }

      return ok(stats);
    } catch (error) {
      return err(
        createNetworkError('Failed to get tenant statistics', undefined, {
          code: 'STATISTICS_FAILED',
          cause: error,
        })
      );
    }
  }

  /**
   * Close all connections
   */
  async closeAllConnections(): Promise<void> {
    const promises = Array.from(this.connections.values()).map(conn => conn.close());
    await Promise.all(promises);
    this.connections.clear();
  }
}

// Export singleton instance
export const tenantIsolationService = TenantIsolationService.getInstance();
