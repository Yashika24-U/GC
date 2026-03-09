const db = require("../config/GCal_DBConfig");
const {
  createGoogleWatch,
  getAuthorizedClient,
} = require("./GCal_Service.service");

const setupCalendarWatch = async (calendarId) => {
  try {
    const currentTime = new Date();

    const { rows } = await db.query(
      "SELECT * FROM calendar_watches WHERE calendar_id = $1 AND expiration > $2",
      [calendarId, currentTime],
    );

    if (rows.length > 0) {
      return rows[0];
    }
    const auth = await getAuthorizedClient(calendarId);

    if (!auth) {
      throw new Error("No OAuth credentials found for calendar");
    }

    const watchData = await createGoogleWatch(calendarId, auth);

    if (!watchData || !watchData.id || !watchData.resourceId) {
      throw new Error("Google did not return required watch data.");
    }

    const expiryDate = new Date(Number(watchData.expiration));
    8;
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
