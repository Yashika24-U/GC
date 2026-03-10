const db = require("../config/GCal_DBConfig");
const { createGoogleWatch } = require("./GCal_Service.service");

const setupCalendarWatch = async (calendarId, auth, userEmail) => {
  try {
    const currentTime = new Date();
    const { rows } = await db.query(
      "SELECT * FROM calendar_watches WHERE calendar_id = $1 AND expiration > $2",
      [calendarId, currentTime],
    );

    if (rows.length > 0) return rows[0];

    if (!auth) throw new Error("No OAuth credentials found for calendar");

    const watchData = await createGoogleWatch(calendarId, auth);

    if (!watchData || !watchData.id || !watchData.resourceId) {
      throw new Error("Google did not return required watch data.");
    }

    const expiryDate = new Date(Number(watchData.expiration));

    await db.query(
      `INSERT INTO calendar_watches (calendar_id, channel_id, resource_id, expiration, user_email)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (calendar_id) DO UPDATE 
       SET channel_id = EXCLUDED.channel_id, 
           resource_id = EXCLUDED.resource_id, 
           expiration = EXCLUDED.expiration,
           user_email = EXCLUDED.user_email`,
      [calendarId, watchData.id, watchData.resourceId, expiryDate, userEmail],
    );

    return watchData;
  } catch (err) {
    throw err;
  }
};

module.exports = { setupCalendarWatch };
