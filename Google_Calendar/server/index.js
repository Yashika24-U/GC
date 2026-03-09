/*
Copyright (c) 2017, ZOHO CORPORATION
License: MIT
*/

var fs = require("fs");
var path = require("path");
var express = require("express");
var bodyParser = require("body-parser");
var errorHandler = require("errorhandler");
var morgan = require("morgan");
var serveIndex = require("serve-index");
var chalk = require("chalk");
var dotenv = require("dotenv");

require("dotenv").config();
dotenv.config({
  path: path.join(__dirname, ".env"),
});

process.env.PWD = process.env.PWD || process.cwd();

const db = require("./config/db");
var expressApp = express();

// ✅ Changed Port to 3003
var port = process.env.PORT || 3003;

const eventRoutes = require("./routes/event.routes");
const webhookRoutes = require("./routes/webhook.routes");
const authRoutes = require("./routes/oauth.routes");

const {
  renewExpiringCalendarWatches,
} = require("./services/watchRenewalService.service");

expressApp.set("port", port);
expressApp.use(morgan("dev"));
expressApp.use(bodyParser.json());
expressApp.use(bodyParser.urlencoded({ extended: false }));
expressApp.use(errorHandler());

// CORS + CSP Setup
expressApp.use("/", function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  let connectSrc = "";
  let manifest = fs
    .readFileSync(path.join(__dirname, "..", "plugin-manifest.json"))
    .toString();

  manifest = JSON.parse(manifest);

  if (
    manifest != null &&
    manifest.cspDomains != null &&
    manifest.cspDomains["connect-src"] != null
  ) {
    let connectDomains = manifest.cspDomains["connect-src"];

    if (validateDomains(connectDomains)) {
      console.log(
        chalk.bold.red(
          connectDomains + " - found to be invalid URL(s) in connect-src"
        )
      );
      next();
      return false;
    }

    connectSrc = connectDomains.join(" ");
  }

  res.setHeader(
    "Content-Security-Policy",
    "connect-src https://*.zohostatic.com https://*.sigmausercontent.com https://*.datadoghq.com " +
      connectSrc
  );

  next();
});

// Serve manifest
expressApp.get("/plugin-manifest.json", function (req, res) {
  res.sendFile(path.join(__dirname, "plugin-manifest.json"));
});

// Static files
expressApp.use("/app", express.static("app"));
expressApp.use("/app", serveIndex("app"));

expressApp.get("/", function (req, res) {
  res.redirect("/app");
});

// Routes
expressApp.use("/api", authRoutes);
expressApp.use("/api", eventRoutes);
expressApp.use("/api", webhookRoutes);

// Database Health Check
async function testConnection() {
  try {
    const res = await db.query("SELECT NOW()");
    console.log("Connected to PostgreSQL at:", res.rows[0].now);
     console.log("Connected to PostgreSQL at:", res.rows[0].now);
  } catch (err) {
    console.error("Database connection failed:", err.stack);
  }
}

testConnection();

// Google Calendar Watch Renewal Job
(async () => {
  try {
    await renewExpiringCalendarWatches();

    // Repeat every 6 hours
    setInterval(renewExpiringCalendarWatches, 6 * 60 * 60 * 1000);
  } catch (err) {
    console.error("Failed to start watch renewal job:", err.message);
  }
})();

// ✅ HTTP Server (No HTTPS)
expressApp
  .listen(port, "127.0.0.1", () => {
    console.log(
      chalk.cyan.bold(`Server running on http://127.0.0.1:${port}`)
    );
  })
  .on("error", function (err) {
    if (err.code === "EADDRINUSE") {
      console.log(chalk.bold.red(port + " port is already in use"));
    }
  });

// Validate Domains
function validateDomains(domainsList) {
  var invalidURLs = domainsList.filter(function (domain) {
    return !isValidURL(domain);
  });

  return invalidURLs && invalidURLs.length > 0;
}

function isValidURL(url) {
  try {
    var parsedURL = new URL(url);

    if (
      parsedURL.protocol !== "http:" &&
      parsedURL.protocol !== "https:" &&
      parsedURL.protocol !== "wss:"
    ) {
      return false;
    }
  } catch (e) {
    return false;
  }

  return true;
}
