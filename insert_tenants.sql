-- Insert 10000 tenant records for stress testing
--
-- To run this script, use psql variables:
--   psql -v db_user="$DB_USER" -v db_pass="$DB_PASS" -f insert_tenants.sql
--
INSERT INTO tenants (id, name, db_url, created_at, updated_at)
SELECT
    'tenant-' || lpad(i::text, 5, '0'),
    'Tenant ' || lpad(i::text, 5, '0'),
    'postgresql://' || :'db_user' || ':' || :'db_pass' || '@localhost/tenant_' || lpad(i::text, 5, '0'),
    now(),
    now()
FROM generate_series(1, 10000) AS s(i);
