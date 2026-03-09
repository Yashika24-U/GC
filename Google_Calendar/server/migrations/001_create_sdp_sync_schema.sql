-- ==========================================
-- Migration: 001_create_sdp_sync_schema.sql
-- Purpose : Create all tables for SDP ↔ Google Calendar Sync
-- ==========================================

BEGIN;

-- ==========================================
-- 1️⃣ calendar_watches
-- ==========================================

CREATE TABLE IF NOT EXISTS public.calendar_watches (
    id SERIAL PRIMARY KEY,
    calendar_id VARCHAR(255) NOT NULL UNIQUE,
    channel_id VARCHAR(255) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    expiration TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sync_token TEXT
);

-- ==========================================
-- 2️⃣ event_mappings
-- ==========================================

CREATE TABLE IF NOT EXISTS public.event_mappings (
    id SERIAL PRIMARY KEY,
    sdp_request_id VARCHAR(255) NOT NULL UNIQUE,
    google_event_id VARCHAR(255) NOT NULL,
    calendar_id VARCHAR(255) DEFAULT 'primary',
    source VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    last_synced_at TIMESTAMP DEFAULT now(),
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT fk_event_mapping_event
      FOREIGN KEY (google_event_id)
      REFERENCES google_events(google_event_id)
);

-- ==========================================
-- 3️⃣ google_events
-- ==========================================

CREATE TABLE IF NOT EXISTS public.google_events (
    google_event_id TEXT PRIMARY KEY,
    calendar_id TEXT NOT NULL,
    title TEXT,
    description TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw_payload JSONB,
    location TEXT,
    attendees JSONB,
    html_link TEXT,
    etag TEXT DEFAULT 'none'
);

-- ==========================================
-- 4️⃣ user_tokens
-- ==========================================

CREATE TABLE IF NOT EXISTS public.user_tokens (
    calendar_id TEXT PRIMARY KEY,
    refresh_token TEXT NOT NULL,
    access_token TEXT,
    access_token_expiry TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 5️⃣ Indexes
-- ==========================================

-- Fast lookup for webhooks
CREATE INDEX IF NOT EXISTS idx_google_events_calendar
ON google_events(calendar_id);

-- Event mapping lookups
CREATE INDEX IF NOT EXISTS idx_event_mappings_google_event
ON event_mappings(google_event_id);

CREATE INDEX IF NOT EXISTS idx_event_mappings_calendar
ON event_mappings(calendar_id);

-- Watch renewal queries
CREATE INDEX IF NOT EXISTS idx_calendar_watches_expiration
ON calendar_watches(expiration);

COMMIT;