BEGIN;

-- Fast lookup when Google webhook hits backend
CREATE INDEX IF NOT EXISTS idx_google_events_calendar
ON google_events(calendar_id);

-- Two way sync lookup
CREATE INDEX IF NOT EXISTS idx_event_mappings_google_event
ON event_mappings(google_event_id);

CREATE INDEX IF NOT EXISTS idx_event_mappings_calendar
ON event_mappings(calendar_id);

-- Watch renewal queries
CREATE INDEX IF NOT EXISTS idx_calendar_watches_expiration
ON calendar_watches(expiration);

COMMIT;
