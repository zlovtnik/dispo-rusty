-- Insert 10000 tenant records for stress testing
INSERT INTO tenants (id, name, db_url, created_at, updated_at)
SELECT
    'tenant-' || lpad(i::text, 5, '0'),
    'Tenant ' || lpad(i::text, 5, '0'),
    'postgresql://${DB_USER}:${DB_PASS}@localhost/tenant_' || lpad(i::text, 5, '0'),
    now(),
    now()
FROM generate_series(1, 10000) AS s(i);
