const { upsertGoogleEvent } = require("../models/googleEvent.model");
const { createEventMapping } = require("../models/GCal_EventMapping.model");
const {
  setupCalendarWatch,
} = require("../services/GCal_CalendarWatch.service");
const { getAuthorizedClient } = require("../services/GCal_Service.service.js");
const db = require("../config/GCal_DBConfig");

/**
 * Create Google Event → Save → Map → Watch
 */
const handleCreateEvent = async (req, res) => {
  try {
    const { googleEvent, calendarId, sdpRequestId, source } = req.body;

    const userEmail = googleEvent.creator?.email;

    const auth = await getAuthorizedClient(userEmail);
    if (!auth) {
      return res
        .status(401)
        .json({ error: `No OAuth credentials found for ${userEmail}` });
    }

    await upsertGoogleEvent(googleEvent, calendarId);
    await createEventMapping({
      sdpRequestId,
      googleEventId: googleEvent.id,
      calendarId,
      source: source || "SDP",
    });
    await setupCalendarWatch(calendarId, auth, userEmail);

    res
      .status(201)
      .json({ status: "success", message: "Event created & synced" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
/**
 * Fetch event using SDP Request ID
 */
const getEventBySdpRequest = async (req, res) => {
  const { sdpRequestId } = req.params;

  if (!sdpRequestId) {
    return res.status(400).json({ message: "sdpRequestId is required" });
  }

  try {
    const { rows } = await db.query(
      `SELECT DISTINCT
         ge.google_event_id,
         ge.calendar_id,
         ge.title,
         ge.description,
         ge.start_time,
         ge.end_time,
         ge.location,
         ge.attendees,
         ge.html_link,
         ge.updated_at
       FROM google_events ge
       JOIN event_mappings em
         ON ge.google_event_id = em.google_event_id
       WHERE em.sdp_request_id = $1`,
      [sdpRequestId],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No event found" });
    }

    res.json({ status: "success", total: rows.length, events: rows });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
};
module.exports = {
  handleCreateEvent,
  getEventBySdpRequest,
};
