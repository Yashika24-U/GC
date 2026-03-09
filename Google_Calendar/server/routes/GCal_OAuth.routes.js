const express = require("express");
const router = express.Router();
const db = require("../config/GCal_DBConfig");
const { google } = require("googleapis");
const {
  oauth2Client,
  getAuthorizedClient,
} = require("../services/GCal_Service.service.js");

// =====================================
// 🔐 GOOGLE AUTH REDIRECT
// =====================================
router.get("/auth/google", (req, res) => {
  try {
    const calendarId = req.query.calendarId;
    if (!calendarId) {
      return res.status(400).send("calendarId is required");
    }
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/calendar"],
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

    if (tokens.refresh_token) {
      await db.query(
        `INSERT INTO user_tokens (calendar_id, refresh_token)
         VALUES ($1,$2)
         ON CONFLICT (calendar_id)
         DO UPDATE SET refresh_token = EXCLUDED.refresh_token`,
        [state, tokens.refresh_token],
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
