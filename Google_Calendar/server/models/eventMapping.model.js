const db = require("../config/db");

// Create or Update mapping between SDP Request ID and Google Event ID
const createEventMapping = async ({
  sdpRequestId,
  googleEventId,
  calendarId,
  source,
}) => {
  const query = `
  INSERT INTO event_mappings 
    (sdp_request_id, google_event_id, calendar_id, source, last_synced_at)
  VALUES 
    ($1, $2, $3, $4, NOW())
  ON CONFLICT (sdp_request_id) 
  DO UPDATE SET 
    google_event_id = EXCLUDED.google_event_id,
    calendar_id = EXCLUDED.calendar_id,
    source = EXCLUDED.source,
    last_synced_at = NOW()
  RETURNING *;
 `;
  const values = [sdpRequestId, googleEventId, calendarId, source];

  const { rows } = await db.query(query, values);
  return rows[0];
};

module.exports = {
  createEventMapping,
  
};
