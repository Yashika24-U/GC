-- ==========================================
-- Migration: 003_grant_sdp_sync_user_permissions.sql
-- Purpose : Grant privileges to sdp_sync_user
-- ==========================================

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.calendar_watches
TO sdp_sync_user;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.event_mappings
TO sdp_sync_user;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.google_events
TO sdp_sync_user;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.user_tokens
TO sdp_sync_user;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.calendar_owners
TO sdp_sync_user;

GRANT USAGE, SELECT, UPDATE
ON SEQUENCE public.calendar_watches_id_seq
TO sdp_sync_user;

GRANT USAGE, SELECT, UPDATE
ON SEQUENCE public.event_mappings_id_seq
TO sdp_sync_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLES TO sdp_sync_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT, UPDATE
ON SEQUENCES TO sdp_sync_user;

COMMIT;
