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
    return res.send(`
      <script>
        window.opener && window.opener.postMessage("oauth_success","*");
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
      "SELECT 1 FROM user_tokens WHERE calendar_id=$1",
      [calendarId],
    );

    return res.json({
      authorized: rows.length > 0,
    });
  } catch (err) {
    res.status(500).json({ authorized: false });
  }
});

module.exports = router;
