-- ==========================================
-- Migration: 002_seed_data_template.sql
-- Purpose : Optional initial data load
-- ==========================================
BEGIN;

INSERT INTO calendar_watches
(calendar_id, channel_id, resource_id, expiration)
VALUES
($1, $2, $3, now() + interval '7 days')
ON CONFLICT DO NOTHING;

INSERT INTO user_tokens
(calendar_id, refresh_token)
VALUES
($1, $2)
ON CONFLICT DO NOTHING;

COMMIT;