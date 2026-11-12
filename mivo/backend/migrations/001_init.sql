CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE users(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  username text UNIQUE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE user_sessions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash text UNIQUE NOT NULL,
  device_name text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON user_sessions(user_id);
CREATE TABLE otp_codes(
  id bigserial PRIMARY KEY,
  phone text NOT NULL,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON otp_codes(phone, created_at DESC);
CREATE TABLE wallets(
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ledger_entries(
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  amount bigint NOT NULL CHECK (amount <> 0),
  kind text NOT NULL,
  idempotency_key text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON ledger_entries(user_id, id DESC);
CREATE FUNCTION ledger_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'ledger_entries is immutable'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_no_change BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
