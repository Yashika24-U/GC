const db = require("../config/db");
const { createGoogleWatch } = require("./googleCalendar.service");

const setupCalendarWatch = async (calendarId, auth) => {
  try {
    // 1. CHECK: Explicitly convert current time to a Date object for Postgres
    const currentTime = new Date();

    const { rows } = await db.query(
      "SELECT * FROM calendar_watches WHERE calendar_id = $1 AND expiration > $2",
      [calendarId, currentTime], // $2 is now a Date object, NOT a bigint
    );

    if (rows.length > 0) {
      return rows[0];
    }

    // 2. Call Google to create new watch
    const watchData = await createGoogleWatch(calendarId, auth);

    if (!watchData || !watchData.id || !watchData.resourceId) {
      throw new Error("Google did not return required watch data.");
    }

    // 3. CONVERT: Google returns expiration as string ms.
    // We MUST turn it into a JS Date object for the pg driver to handle it.
    const expiryDate = new Date(Number(watchData.expiration));

    // 4. INSERT/UPDATE
    await db.query(
      `INSERT INTO calendar_watches (calendar_id, channel_id, resource_id, expiration)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (calendar_id) DO UPDATE 
       SET channel_id = EXCLUDED.channel_id, 
           resource_id = EXCLUDED.resource_id, 
           expiration = EXCLUDED.expiration`,
      [
        calendarId,
        watchData.id,
        watchData.resourceId,
        expiryDate, // This is now a Date object
      ],
    );
    return watchData;
  } catch (err) {
    throw err;
  }
};

module.exports = { setupCalendarWatch };
