const express = require("express");
const router = express.Router();
const { google } = require("googleapis");
const {
  getAuthorizedClient,
} = require("../services/googleCalendar.service.js");

const {
  handleCreateEvent,
  getEventBySdpRequest,
} = require("../controller/event.controller.js");

const db = require("../config/db.js");

// GET /requests/:sdpRequestId
router.get("/requests/:sdpRequestId", getEventBySdpRequest);

// POST /events
router.post("/events", handleCreateEvent);

// DELETE

router.delete(
  "/requests/:sdpRequestId/events/:googleEventId",
  async (req, res) => {
    const { sdpRequestId, googleEventId } = req.params;

    try {
      // 1️⃣ Get calendar_id using mapping + events table
      const result = await db.query(
        `SELECT ge.calendar_id
         FROM event_mappings em
         JOIN google_events ge
         ON em.google_event_id = ge.google_event_id
         WHERE em.sdp_request_id=$1
         AND em.google_event_id=$2`,
        [sdpRequestId, googleEventId],
      );

      if (result.rows.length > 0) {
        const calendarId = result.rows[0].calendar_id;

        // 2️⃣ Get OAuth client
        const auth = await getAuthorizedClient(calendarId);

        const calendar = google.calendar({
          version: "v3",
          auth,
        });

        // 3️⃣ Delete from Google Calendar
        await calendar.events.delete({
          calendarId,
          eventId: googleEventId,
        });
      } else {
        console.warn("Mapping not found. Skipping Google deletion.");
      }

      // 4️⃣ Delete mapping
      await db.query(
        "DELETE FROM event_mappings WHERE sdp_request_id=$1 AND google_event_id=$2",
        [sdpRequestId, googleEventId],
      );

      // 5️⃣ Delete event record
      await db.query("DELETE FROM google_events WHERE google_event_id=$1", [
        googleEventId,
      ]);

      res.json({ success: true });
    } catch (err) {
      console.error("Delete failed:", err);
      res.status(500).json({ error: "Delete failed" });
    }
  },
);

module.exports = router;
