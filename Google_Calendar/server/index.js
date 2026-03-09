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
var https = require("https");
var chalk = require("chalk");
var dotenv = require("dotenv");
require("dotenv").config();
dotenv.config({
  path: path.join(__dirname, ".env"),
});
process.env.PWD = process.env.PWD || process.cwd();
const db = require("./config/db");
var expressApp = express();
var port = process.env.PORT || 5000;
const eventRoutes = require("./routes/event.routes");
const webhookRoutes = require("./routes/webhook.routes");
const authRoutes = require("./routes/oauth.routes");
const {
  renewExpiringCalendarWatches,
} = require("./services/watchRenewalService.service");
const logger = require("./utils/logger");
expressApp.set("port", port);
expressApp.use(morgan("dev"));
expressApp.use(bodyParser.json());
expressApp.use(bodyParser.urlencoded({ extended: false }));
expressApp.use(errorHandler());

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
          connectDomains + " - found to be invalid URL(s) in connect-src",
        ),
      );
      next();
      return false;
    }
    connectSrc = connectDomains.join(" ");
  }
  res.setHeader(
    "Content-Security-Policy",
    "connect-src https://*.zohostatic.com https://*.sigmausercontent.com https://*.datadoghq.com" +
      connectSrc,
  );
  next();
});

expressApp.get("/plugin-manifest.json", function (req, res) {
  res.sendfile("plugin-manifest.json");
});

expressApp.use("/app", express.static("app"));
expressApp.use("/app", serveIndex("app"));

expressApp.get("/", function (req, res) {
  res.redirect("/app");
});
expressApp.use("/api", authRoutes);
expressApp.use("/api", eventRoutes);
expressApp.use("/api", webhookRoutes);

async function testConnection() {
  try {
    const res = await db.query("SELECT NOW()");
    logger.info("Connected to PostgreSQL", {
      timestamp: new Date().toISOString(),
      dbTime: res.rows[0].now,
    });
  } catch (err) {
    logger.error("Database connection failed", {
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    });
  }
}

testConnection();

// Function to safely run renewal with logs
async function runWatchRenewal() {
  try {
    const result = await renewExpiringCalendarWatches();
  } catch (err) {
    logger.error("Watch renewal failed", {
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    });
  }
}

// Run once at startup
runWatchRenewal();

// Schedule periodic renewal every 6 hours
setInterval(runWatchRenewal, 6 * 60 * 60 * 1000);

var options = {
  key: fs.readFileSync("./key.pem"),
  cert: fs.readFileSync("./cert.pem"),
};

https
  .createServer(options, expressApp)
  .listen(port, function () {
    console.log(chalk.green("Zet running at https://localhost:" + port));
    console.log(
      chalk.bold.cyan(
        "Note: Please enable the host (https://localhost:" +
          port +
          ") in a new tab and authorize the connection by clicking Advanced->Proceed to localhost (unsafe).",
      ),
    );
  })
  .on("error", function (err) {
    if (err.code === "EADDRINUSE") {
      console.log(chalk.bold.red(port + " port is already in use"));
    }
  });

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
      parsedURL.protocol !== "http" + ":" &&
      parsedURL.protocol !== "https" + ":" &&
      parsedURL.protocol !== "wss" + ":"
    ) {
      return false;
    }
  } catch (e) {
    return false;
  }

  return true;
}
