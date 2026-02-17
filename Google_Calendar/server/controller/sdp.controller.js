const { updateSDPTicket } = require("../services/sdp.service");

const syncSDPFromWebhook = async (req, res) => {
  try {
    const { sdpId, googleEvent } = req.body;

    if (!sdpId || !googleEvent) {
      return res.status(400).json({ message: "Invalid payload" });
    }

    const success = await updateSDPTicket(sdpId, googleEvent);

    if (!success) {
      return res.status(500).json({ message: "SDP sync failed" });
    }

    res.json({ status: "success", message: "SDP updated" });
  } catch (err) {
    throw err;
  }
};

module.exports = { syncSDPFromWebhook };
