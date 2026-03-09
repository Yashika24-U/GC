const { google } = require("googleapis");
const path = require("path");
const db = require("../config/db");
const { upsertGoogleEvent } = require("../models/googleEvent.model");
const crypto = require("crypto");

async function getAuthorizedClient(calendarId) {
  const { rows } = await db.query(
    `SELECT refresh_token, access_token, access_token_expiry
      FROM user_tokens
      WHERE calendar_id = $1`,
    [calendarId],
  );

  if (!rows.length) return null;

  const token = rows[0];

  // Create OAuth client (do NOT reuse global client)
  const oauthClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

  // 1️⃣ If access token exists and not expired → use it
  if (
    token.access_token &&
    token.access_token_expiry &&
    new Date(token.access_token_expiry) > new Date()
  ) {
    oauthClient.setCredentials({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
    });

    return oauthClient;
  }

  // 2️⃣ Otherwise refresh the token
  oauthClient.setCredentials({
    refresh_token: token.refresh_token,
  });

  const { credentials } = await oauthClient.refreshAccessToken();

  // 3️⃣ Save new token
  await db.query(
    `UPDATE user_tokens
      SET access_token = $1,
          access_token_expiry = $2
      WHERE calendar_id = $3`,
    [credentials.access_token, new Date(credentials.expiry_date), calendarId],
  );

  oauthClient.setCredentials(credentials);

  return oauthClient;
}

async function createGoogleWatch(calendarId, auth) {
  try {
    const calendar = google.calendar({
      version: "v3",
      auth,
    });

    const response = await calendar.events.watch({
      calendarId,
      requestBody: {
        id: crypto.randomUUID(),
        type: "web_hook",
        address: "https://gc.spritle.com/api/webhook",
        token: crypto.randomUUID(),
      },
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(
        `Google watch creation failed: ${JSON.stringify(error.response.data)}`,
      );
    }

    throw error;
  }
}

async function handleCalendarChange(channelId, resourceId) {
  try {
    // 1️⃣ Find calendar + stored sync token
    const { rows } = await db.query(
      `SELECT calendar_id, sync_token
       FROM calendar_watches
       WHERE channel_id = $1`,
      [channelId],
    );

    if (!rows.length) {
      return;
    }

    const calendarId = rows[0].calendar_id;
    const syncToken = rows[0].sync_token;

    // 2️⃣ Google client
    const auth = await getAuthorizedClient(calendarId);

    const calendar = google.calendar({
      version: "v3",
      auth,
    });

    let response;

    try {
      if (syncToken) {
        // Incremental sync
        response = await calendar.events.list({
          calendarId,
          syncToken: syncToken,
          showDeleted: true,
          singleEvents: true,
        });
      } else {
        // First sync (fallback for existing users)
        response = await calendar.events.list({
          calendarId,
          showDeleted: true,
          singleEvents: true,
        });
      }
    } catch (err) {
      // sync token expired → full resync
      if (err?.response?.status === 410) {
        response = await calendar.events.list({
          calendarId,
          showDeleted: true,
          singleEvents: true,
        });
      } else {
        throw err;
      }
    }

    const events = response.data.items || [];

    // 3️⃣ Process events (existing logic preserved)
    for (const event of events) {
      if (event.status === "cancelled") {
        await db.query(
          "DELETE FROM event_mappings WHERE google_event_id = $1",
          [event.id],
        );

        await db.query("DELETE FROM google_events WHERE google_event_id = $1", [
          event.id,
        ]);

        continue;
      }

      await upsertGoogleEvent(event, calendarId);
    }

    // 4️⃣ Save next sync token
    const nextToken = response.data.nextSyncToken;

    if (nextToken) {
      await db.query(
        `UPDATE calendar_watches
         SET sync_token = $1
         WHERE channel_id = $2`,
        [nextToken, channelId],
      );
    }
  } catch (err) {
    throw err;
  }
}
module.exports = {
  getAuthorizedClient,
  createGoogleWatch,
  handleCalendarChange,
};
