const { google } = require("googleapis");
const path = require("path");
const db = require("../config/GCal_DBConfig");
const { upsertGoogleEvent } = require("../models/googleEvent.model");
const crypto = require("crypto");

async function getAuthorizedClient(calendarId) {
  const ownerRes = await db.query(
    `SELECT owner_email FROM calendar_owners WHERE calendar_id = $1`,
    [calendarId],
  );
  const email = ownerRes.rows[0]?.owner_email ?? calendarId;

  const { rows } = await db.query(
    `SELECT refresh_token, access_token, access_token_expiry
     FROM user_tokens
     WHERE calendar_id = $1`,
    [email],
  );

  if (!rows.length) return null;

  const token = rows[0];

  const oauthClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

  // Step 3 — if access token is still valid, use it directly (fast path)
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
  const lockKey = Math.abs(
    email.split("").reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 0) %
      2147483647,
  );

  const lockRes = await db.query(
    "SELECT pg_try_advisory_lock($1) AS acquired",
    [lockKey],
  );

  if (!lockRes.rows[0].acquired) {
    await new Promise((r) => setTimeout(r, 500));

    const { rows: freshRows } = await db.query(
      `SELECT refresh_token, access_token, access_token_expiry
       FROM user_tokens
       WHERE calendar_id = $1`,
      [email],
    );

    if (!freshRows.length) return null;

    const fresh = freshRows[0];
    oauthClient.setCredentials({
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token,
    });
    return oauthClient;
  }
  try {
    oauthClient.setCredentials({
      refresh_token: token.refresh_token,
    });

    const { credentials } = await oauthClient.refreshAccessToken();

    await db.query(
      `UPDATE user_tokens
       SET access_token = $1,
           access_token_expiry = $2
       WHERE calendar_id = $3`,
      [credentials.access_token, new Date(credentials.expiry_date), email],
    );

    oauthClient.setCredentials(credentials);
    return oauthClient;
  } finally {
    await db.query("SELECT pg_advisory_unlock($1)", [lockKey]);
  }
}

async function createGoogleWatch(calendarId, auth) {
  try {
    const calendar = google.calendar({
      version: "v3",
      auth,
    });
    const calList = await calendar.calendarList.list();
    const ids = calList.data.items.map((c) => c.id);

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
    const { rows } = await db.query(
      `SELECT calendar_id, sync_token, user_email
   FROM calendar_watches
   WHERE channel_id = $1`,
      [channelId],
    );

    if (!rows.length) {
      return;
    }

    const calendarId = rows[0].calendar_id;
    const syncToken = rows[0].sync_token;
    const userEmail = rows[0].user_email;

    // 2️⃣ Google client - use userEmail NOT calendarId
    const auth = await getAuthorizedClient(userEmail);

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
