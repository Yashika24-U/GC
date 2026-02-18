const { google } = require("googleapis");
const path = require("path");
const db = require("../config/db");
const { upsertGoogleEvent } = require("../models/googleEvent.model");
const crypto = require("crypto");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);
async function getAuthorizedClient(calendarId) {
  try {
    // 1. Fetch the refresh token for this specific technician
    const { rows } = await db.query(
      "SELECT refresh_token FROM user_tokens WHERE calendar_id = $1",
      [calendarId],
    );

    if (rows.length === 0) {
      return null;
    }

    // 2. Set the credentials
    oauth2Client.setCredentials({
      refresh_token: rows[0].refresh_token,
    });

    return oauth2Client;
  } catch (err) {
    return null;
  }
}

async function createGoogleWatch(calendarId) {
  try {
    const authClient = await getAuthorizedClient(calendarId);
    const calendar = google.calendar({ version: "v3", auth: authClient });
    // 2. Setup the Watch
    const response = await calendar.events.watch({
      calendarId: calendarId,
      requestBody: {
        id: crypto.randomUUID(), // Unique ID for this webhook channel
        type: "web_hook",
        address: "https://gc.spritle.com/app/api/webhook",
      },
    });
    return response.data;
  } catch (error) {
    // If you get 'unauthorized_client', see the checklist below.
    if (error.response) {
      throw new Error(JSON.stringify(error.response.data));
    }
    throw error;
  }
}
async function handleCalendarChange(channelId, resourceId) {
  try {
    // 1. Find calendar
    const { rows } = await db.query(
      "SELECT calendar_id FROM calendar_watches WHERE channel_id = $1",
      [channelId],
    );

    if (!rows.length) {
      return;
    }

    const calendarId = rows[0].calendar_id;

    // 2. Google client
    const auth = await getAuthorizedClient(calendarId);
    const calendar = google.calendar({ version: "v3", auth });
    // 3. Fetch changed events
    const response = await calendar.events.list({
      calendarId,
      updatedMin: new Date(Date.now() - 60000).toISOString(),
      singleEvents: true,
      showDeleted: true,
    });

    const events = response.data.items || [];
    for (const event of events) {
      if (event.status === "cancelled") {
        await db.query("DELETE FROM google_events WHERE google_event_id = $1", [
          event.id,
        ]);

        continue;
      }
      await upsertGoogleEvent(event, calendarId);
    }
  } catch (err) {
    console.error("error", err);
  }
}

// async function handleCalendarChange(channelId, resourceId) {
//   try {
//     // 1. Find calendar
//     const { rows } = await db.query(
//       "SELECT calendar_id FROM calendar_watches WHERE channel_id = $1",
//       [channelId],
//     );

//     if (!rows.length) return;

//     const calendarId = rows[0].calendar_id;

//     // 2. Google client
//     const auth = await getAuthorizedClient(calendarId);
//     const calendar = google.calendar({ version: "v3", auth });

//     // 3. Fetch changed + deleted events
//     const response = await calendar.events.list({
//       calendarId,
//       updatedMin: new Date(Date.now() - 60000).toISOString(),
//       singleEvents: true,
//       showDeleted: true, //
//     });

//     const events = response.data.items || [];

//     for (const event of events) {
//       if (event.status === "cancelled") {
//         await db.query("DELETE FROM google_events WHERE google_event_id = $1", [
//           event.id,
//         ]);

//         continue;
//       }

//       // 🔄 Existing logic untouched
//       await upsertGoogleEvent(event, calendarId);
//     }
//   } catch (err) {
//     throw err;
//   }
// }

module.exports = {
  getAuthorizedClient,
  createGoogleWatch,
  handleCalendarChange,
  oauth2Client,
};
