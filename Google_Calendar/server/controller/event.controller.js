const { upsertGoogleEvent } = require("../models/googleEvent.model");
const { createEventMapping } = require("../models/eventMapping.model");
const { setupCalendarWatch } = require("../services/calendarWatch.service");
const { getAuthorizedClient } = require("../services/googleCalendar.service");
const db = require("../config/db");

/**
 * Create Google Event → Save → Map → Watch
 */
const handleCreateEvent = async (req, res) => {
  try {
    const { googleEvent, calendarId, sdpRequestId, source } = req.body;

    if (!googleEvent || !calendarId || !sdpRequestId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // 1. Save Google event in DB
    await upsertGoogleEvent(googleEvent, calendarId);

    // 2. Create mapping
    await createEventMapping({
      sdpRequestId,
      googleEventId: googleEvent.id,
      calendarId,
      source: source || "SDP",
    });

    // 3. Ensure watch exists
    const auth = await getAuthorizedClient(calendarId);

    await setupCalendarWatch(calendarId, auth);

    res.status(201).json({
      status: "success",
      message: "Event created & synced",
    });
  } catch (err) {
    throw err;
    res.status(500).json({ error: err.message });
  }
};

/**
 * Fetch event using SDP Request ID
 */
const getEventBySdpRequest = async (req, res) => {
  try {
    const { sdpRequestId } = req.params;

    if (!sdpRequestId) {
      return res.status(400).json({ message: "sdpRequestId is required" });
    }

    const { rows } = await db.query(
      `
      SELECT
        ge."google_event_id",
        ge."calendar_id",
        ge."title",
        ge."description",
        ge."start_time",
        ge."end_time",
        ge."location",
        ge."attendees",
        ge."html_link",
        ge."updated_at"
      FROM "google_events" ge
      JOIN "event_mappings" em
        ON ge."google_event_id" = em."google_event_id"
      WHERE em."sdp_request_id" = $1
      `,
      [sdpRequestId],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No event found" });
    }

    res.json({ status: "success", events: rows });
  } catch (err) {
    throw err;
  }
};

module.exports = {
  handleCreateEvent,
  getEventBySdpRequest,
};
