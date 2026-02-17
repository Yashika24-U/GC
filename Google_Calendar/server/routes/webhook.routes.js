const express = require("express");
const router = express.Router();

const { handleCalendarChange } = require("../services/googleCalendar.service");

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
    });
  }
});

module.exports = router;
