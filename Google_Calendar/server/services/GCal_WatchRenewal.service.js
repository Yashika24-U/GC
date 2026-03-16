const db = require("../config/GCal_DBConfig");
const { google } = require("googleapis");
const { getAuthorizedClient } = require("../services/GCal_Service.service.js");
const crypto = require("crypto");
const logger = require("../utils/logger");

async function renewExpiringCalendarWatches() {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Get watches expiring in the next 24 hours, skipping already expired ones
    const { rows } = await client.query(`
      SELECT *
      FROM calendar_watches
      WHERE expiration > NOW() 
        AND expiration < NOW() + INTERVAL '24 hours'
      FOR UPDATE SKIP LOCKED
    `);

    if (rows.length === 0) {
      logger.info("Watch Renewal Service: No watches expiring soon.");
      await client.query("COMMIT");
      return;
    }

    for (const watch of rows) {
      // 2️⃣ Get authorized client
      const authClient = await getAuthorizedClient(watch.calendar_id);

      if (!authClient) {
        logger.warn(
          `Skipping watch renewal — no token for ${watch.user_email}`,
          {
            calendarId: watch.calendar_id,
            userEmail: watch.user_email,
          },
        );
        continue;
      }
      const calendar = google.calendar({ version: "v3", auth: authClient });

      // 3️⃣ Stop old channel if exists
      try {
        if (watch.channel_id && watch.resource_id) {
          await calendar.channels.stop({
            requestBody: {
              id: watch.channel_id,
              resourceId: watch.resource_id,
            },
          });
        }
      } catch (err) {
        logger.warn(
          `Failed to stop channel ${watch.channel_id} (may already be expired)`,
          {
            error: err.message,
          },
        );
      }

      // 4️⃣ Create new watch
      const channelId = crypto.randomUUID();

      const response = await calendar.events.watch({
        calendarId: watch.calendar_id,
        requestBody: {
          id: channelId,
          type: "web_hook",
          address: "https://gc.spritle.com/api/webhook",
        },
      });

      const expiryDate = new Date(Number(response.data.expiration));

      // 5️⃣ Update DB with new channel info
      await client.query(
        `UPDATE calendar_watches 
         SET channel_id = $1, resource_id = $2, expiration = $3 
         WHERE calendar_id = $4`,
        [
          response.data.id,
          response.data.resourceId,
          expiryDate,
          watch.calendar_id,
        ],
      );

      logger.info(`Watch renewed for ${watch.calendar_id}`, {
        newChannel: response.data.id,
        expiration: expiryDate.toISOString(),
      });
    }

    await client.query("COMMIT");
    logger.info(
      "Watch Renewal Service: Successfully finished renewing watches.",
    );
  } catch (err) {
    await client.query("ROLLBACK");

    logger.error("Watch Renewal Service Error:", {
      message: err.message,
      stack: err.stack,
    });
  } finally {
    client.release();
  }
}

module.exports = { renewExpiringCalendarWatches };
