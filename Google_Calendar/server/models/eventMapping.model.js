const db = require("../config/db");

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

const getMappingBySdpId = async (sdpRequestId) => {
  const { rows } = await db.query(
    `SELECT * FROM event_mappings WHERE sdp_request_id = $1 AND status = 'ACTIVE'`,
    [sdpRequestId],
  );
  return rows[0];
};

const getMappingByGoogleId = async (googleEventId) => {
  const { rows } = await db.query(
    `SELECT * FROM event_mappings WHERE google_event_id = $1`,
    [googleEventId],
  );
  return rows[0];
};

const markMappingDeleted = async (googleEventId) => {
  await db.query(
    `UPDATE event_mappings SET status='DELETED', updated_at=NOW() WHERE google_event_id=$1`,
    [googleEventId],
  );
};

module.exports = {
  createEventMapping,
  getMappingBySdpId,
  getMappingByGoogleId,
  markMappingDeleted,
};
