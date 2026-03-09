const express = require("express");
const router = express.Router();
const { google } = require("googleapis");
const logger = require("../utils/logger.js");
const { getAuthorizedClient } = require("../services/GCal_Service.service.js");

const {
  handleCreateEvent,
  getEventBySdpRequest,
} = require("../controller/Gcal_event.controller.js");

const db = require("../config/GCal_DBConfig.js");

// GET /requests/:sdpRequestId
router.get("/requests/:sdpRequestId", getEventBySdpRequest);

// POST /events
router.post("/events", handleCreateEvent);

// Delete /requests/:sdpRequestId/events/:googleEventId
router.delete(
  "/requests/:sdpRequestId/events/:googleEventId",
  async (req, res) => {
    const { sdpRequestId, googleEventId } = req.params;

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // 1️⃣ Get calendar_id
      const result = await client.query(
        `SELECT ge.calendar_id
       FROM event_mappings em
       JOIN google_events ge
         ON em.google_event_id = ge.google_event_id
       WHERE em.sdp_request_id = $1
       AND em.google_event_id = $2`,
        [sdpRequestId, googleEventId],
      );

      let calendarId = null;

      if (result.rows.length > 0) {
        calendarId = result.rows[0].calendar_id;
      }

      // 2️⃣ Delete from Google Calendar (if mapping exists)
      if (calendarId) {
        try {
          const auth = await getAuthorizedClient(calendarId);

          if (auth) {
            const calendar = google.calendar({
              version: "v3",
              auth,
            });

            await calendar.events.delete({
              calendarId,
              eventId: googleEventId,
            });
          }
        } catch (err) {
          // Treat Google 404 as success (already deleted)
          if (err?.response?.status === 404) {
            logger.warn("Google event already deleted", {
              calendarId: watch.calendar_id,
              googleEventId: watch.google_event_id,
              timestamp: new Date().toISOString(),
            });
          } else {
            throw err;
          }
        }
      }

      // 3️⃣ Delete mapping
      await client.query(
        `DELETE FROM event_mappings
       WHERE sdp_request_id = $1
       AND google_event_id = $2`,
        [sdpRequestId, googleEventId],
      );

      // 4️⃣ Delete event record
      await client.query(
        `DELETE FROM google_events
       WHERE google_event_id = $1`,
        [googleEventId],
      );

      await client.query("COMMIT");

      res.json({
        status: "success",
        message: "Event deleted successfully",
      });
    } catch (err) {
      await client.query("ROLLBACK");

      throw err;

      res.status(500).json({
        status: "error",
        message: "Failed to delete event",
      });
    } finally {
      client.release();
    }
  },
);

module.exports = router;
