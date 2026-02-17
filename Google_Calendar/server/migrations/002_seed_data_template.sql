-- ==========================================
-- Migration: 002_seed_data_template.sql
-- Purpose : Optional initial data load
-- ==========================================

BEGIN;

-- Example watch
INSERT INTO calendar_watches
(calendar_id, channel_id, resource_id, expiration)
VALUES
('primary', 'channel_demo', 'resource_demo', now() + interval '7 days')
ON CONFLICT DO NOTHING;

-- Example token
INSERT INTO user_tokens
(calendar_id, refresh_token)
VALUES
('primary', 'demo_refresh_token')
ON CONFLICT DO NOTHING;

COMMIT;
