const db = require("../config/db");
const { google } = require("googleapis");
const { getAuthorizedClient } = require("../services/googleCalendar.service");
const crypto = require("crypto");

async function renewExpiringCalendarWatches() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // 1. Get watches expiring in the next 24 hours
    const { rows } = await client.query(`
      SELECT * FROM calendar_watches
      WHERE expiration < NOW() + INTERVAL '24 hours'
      FOR UPDATE SKIP LOCKED
    `);

    if (rows.length === 0) {
      await client.query("COMMIT");
      return;
    }

    for (const watch of rows) {
      // 2. Use OAuth2 instead of Service Account
      const authClient = await getAuthorizedClient(watch.calendar_id);
      const calendar = google.calendar({ version: "v3", auth: authClient });

      const channelId = crypto.randomUUID(); // Cleaner than Buffer base64

      const response = await calendar.events.watch({
        calendarId: watch.calendar_id,
        requestBody: {
          id: channelId,
          type: "web_hook",
          address: "https://gc.spritle.com/api/webhook", // Match your index.js route
        },
      });

      const expiryDate = new Date(Number(response.data.expiration));

      await client.query(
        `UPDATE calendar_watches SET channel_id = $1, resource_id = $2, expiration = $3 WHERE calendar_id = $4`,
        [
          response.data.id,
          response.data.resourceId,
          expiryDate,
          watch.calendar_id,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Watch renewal failed:", err.message);
  } finally {
    client.release();
  }
}

module.exports = { renewExpiringCalendarWatches };
