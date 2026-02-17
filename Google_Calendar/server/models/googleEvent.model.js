const db = require("../config/db");

const upsertGoogleEvent = async (event, calendarId) => {
  const attendees = event.attendees
    ? JSON.stringify(
        event.attendees.map((attendee) => ({
          email: attendee.email,
          displayName: attendee.displayName || null,
          responseStatus: attendee.responseStatus || null,
        })),
      )
    : null;
  await db.query(
    `
    INSERT INTO google_events
      (
        google_event_id,
        calendar_id,
        title,
        description,
        location,
        start_time,
        end_time,
        attendees,
        html_link,
        updated_at,
        raw_payload
      )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (google_event_id)
    DO UPDATE SET
      title = COALESCE(EXCLUDED.title, google_events.title),
      description = COALESCE(EXCLUDED.description, google_events.description),
      location = COALESCE(EXCLUDED.location, google_events.location),
      start_time = COALESCE(EXCLUDED.start_time, google_events.start_time),
      end_time = COALESCE(EXCLUDED.end_time, google_events.end_time),
      attendees = COALESCE(
        NULLIF(EXCLUDED.attendees, '{}'::jsonb),
        google_events.attendees
      ),
      html_link = COALESCE(EXCLUDED.html_link, google_events.html_link),
      updated_at = EXCLUDED.updated_at,
      raw_payload = EXCLUDED.raw_payload
    `,
    [
      event.id,
      calendarId,
      event.summary || null,
      event.description || null,
      event.location || null,
      event.start?.dateTime || event.start?.date || null,
      event.end?.dateTime || event.end?.date || null,
      attendees,
      event.htmlLink || null,
      event.updated || new Date(),
      event,
    ],
  );
};

module.exports = {
  upsertGoogleEvent,
};
