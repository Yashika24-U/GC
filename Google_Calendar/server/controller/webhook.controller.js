const { upsertGoogleEvent } = require("../models/googleEvent.model");
const {
  getMappingByGoogleId,
  markMappingDeleted,
} = require("../models/eventMapping.model");
const { updateSDPTicket } = require("../services/sdp.service");

const webhookHandler = async (req, res) => {
  try {
    const resourceState = req.headers["x-goog-resource-state"];
    const eventId = req.headers["x-goog-resource-id"];

    

    // Always ACK immediately
    res.status(200).send("OK");

    if (!eventId) return;

    const mapping = await getMappingByGoogleId(eventId);
    if (!mapping) return;

    if (resourceState === "deleted") {
      await markMappingDeleted(eventId);
      return;
    }

    // For sync logic (simplified example)
    await updateSDPTicket(mapping.sdp_request_id, { id: eventId });
  } catch (err) {
    throw err;
  }
};

module.exports = { webhookHandler };
