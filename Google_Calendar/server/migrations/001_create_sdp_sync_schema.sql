-- ==========================================
-- Migration: 001_create_sdp_sync_schema.sql
-- Purpose : Create all tables for SDP ↔ Google Calendar Sync
-- ==========================================

BEGIN;

-- ==========================================
-- calendar_watches
-- ==========================================

CREATE TABLE IF NOT EXISTS public.calendar_watches (
    id SERIAL PRIMARY KEY,
    calendar_id VARCHAR(255) NOT NULL UNIQUE,
    channel_id VARCHAR(255) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    expiration TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMP DEFAULT now()
);

-- ==========================================
-- event_mappings
-- ==========================================

CREATE TABLE IF NOT EXISTS public.event_mappings (
    id SERIAL PRIMARY KEY,
    sdp_request_id VARCHAR(255) NOT NULL UNIQUE,
    google_event_id VARCHAR(255) NOT NULL,
    calendar_id VARCHAR(255) DEFAULT 'primary',
    source VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    last_synced_at TIMESTAMP DEFAULT now(),
    created_at TIMESTAMP DEFAULT now()
);

-- ==========================================
-- google_events
-- ==========================================

CREATE TABLE IF NOT EXISTS public.google_events (
    google_event_id TEXT PRIMARY KEY,
    calendar_id TEXT NOT NULL,
    title TEXT,
    description TEXT,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    updated_at TIMESTAMP,
    raw_payload JSONB,
    location TEXT,
    attendees JSONB,
    html_link TEXT,
    etag TEXT DEFAULT 'none'
);

-- ==========================================
-- user_tokens
-- ==========================================

CREATE TABLE IF NOT EXISTS public.user_tokens (
    calendar_id TEXT PRIMARY KEY,
    refresh_token TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
