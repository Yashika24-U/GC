const express = require("express");
const router = express.Router();
const db = require("../config/GCal_DBConfig");
const { google } = require("googleapis");

// =====================================
// 🔐 GOOGLE AUTH REDIRECT
// =====================================
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

router.get("/auth/google", (req, res) => {
  try {
    const calendarId = req.query.calendarId;
    if (!calendarId) {
      return res.status(400).send("calendarId is required");
    }
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      state: calendarId,
    });
    res.redirect(url);
  } catch (err) {
    res.status(500).send("Failed to start Google OAuth");
  }
});

router.get("/auth/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send("Missing OAuth parameters");
    }

    const tokenResponse = await oauth2Client.getToken(code);
    const tokens = tokenResponse.tokens;

    const tempClient = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    tempClient.setCredentials(tokens);

    
    const oauth2 = google.oauth2({ version: "v2", auth: tempClient });
    const { data } = await oauth2.userinfo.get();
    const userEmail = data.email;

  
    if (tokens.refresh_token) {
      await db.query(
        `INSERT INTO user_tokens (calendar_id, refresh_token)
         VALUES ($1, $2)
         ON CONFLICT (calendar_id)
         DO UPDATE SET refresh_token = EXCLUDED.refresh_token`,
        [userEmail, tokens.refresh_token],
      );
    }

    const calClient = google.calendar({ version: "v3", auth: tempClient });
    const calRes = await calClient.calendarList.list();
    const calendars = calRes.data.items || [];

   
    for (const cal of calendars) {
      await db.query(
        `INSERT INTO calendar_owners (calendar_id, owner_email, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (calendar_id)
         DO UPDATE SET
           owner_email  = EXCLUDED.owner_email,
           display_name = EXCLUDED.display_name`,
        [cal.id, userEmail, cal.summary],
      );
    }
    
    return res.send(`
      <script>
        window.opener && window.opener.postMessage("oauth_success", "*");
        window.close();
      </script>
    `);
  } catch (err) {
    return res.status(500).send("OAuth authentication failed");
  }
});

router.get("/auth/status", async (req, res) => {
  try {
    const { calendarId } = req.query;

    if (!calendarId) {
      return res.status(400).json({ authorized: false });
    }

    const { rows } = await db.query(
      `SELECT ut.calendar_id AS email, co.display_name
       FROM calendar_owners co
       JOIN user_tokens ut ON co.owner_email = ut.calendar_id
       WHERE co.calendar_id = $1`,
      [calendarId],
    );

    return res.json({
      authorized: rows.length > 0,
      email: rows[0]?.email || null,
      calendarName: rows[0]?.display_name || null,
    });
  } catch (err) {
    res.status(500).json({ authorized: false });
  }
});

module.exports = router;
