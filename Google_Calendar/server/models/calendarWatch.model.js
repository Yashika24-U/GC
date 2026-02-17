const db = require("../config/db");


const getActiveWatch = async (calendarId) => {
  // Check if a watch exists and has not expired yet
  const { rows } = await db.query(
    "SELECT * FROM calendar_watches WHERE calendar_id = $1 AND expiration > NOW()",
    [calendarId],
  );
  return rows[0];
};

const upsertWatch = async (calendarId, channelId, resourceId, expiration) => {
  const query = `
    INSERT INTO calendar_watches (calendar_id, channel_id, resource_id, expiration)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (calendar_id) 
    DO UPDATE SET 
      channel_id = EXCLUDED.channel_id, 
      resource_id = EXCLUDED.resource_id, 
      expiration = EXCLUDED.expiration,
      created_at = NOW()
    RETURNING *;
  `;
  // Note: expiration should be a Date object for TIMESTAMP column
  const values = [
    calendarId,
    channelId,
    resourceId,
    new Date(Number(expiration)),
  ];
  const { rows } = await db.query(query, values);
  return rows[0];
};

module.exports = { getActiveWatch, upsertWatch };
