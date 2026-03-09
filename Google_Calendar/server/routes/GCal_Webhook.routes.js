const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const { handleCalendarChange } = require("../services/GCal_Service.service.js");

// POST /webhook
router.post("/webhook", async (req, res) => {
  const channelId = req.headers["x-goog-channel-id"];
  const resourceState = req.headers["x-goog-resource-state"];
  const resourceId = req.headers["x-goog-resource-id"];

  // 1. Respond immediately
  res.status(200).send("OK");

  // 2. Process only real changes
  if (resourceState === "exists") {
    handleCalendarChange(channelId, resourceId).catch((err) => {
      logger.error("Webhook processing failed", {
        error: err.message,
        stack: err.stack,
      });
    });
  }
});

module.exports = router;
