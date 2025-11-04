const fs = require("fs");
// Load .env file first (primary)
if (fs.existsSync(".env")) {
  require("dotenv").config({ path: "./.env" });
}
// Load config.env as fallback
if (fs.existsSync("config.env")) {
  require("dotenv").config({ path: "./config.env" });
}

function convertToBool(text, fault = "true") {
  return text === fault ? true : false;
}

module.exports = {
  SESSION_ID: process.env.SESSION_ID || "",
  PHONE_NUMBER: process.env.PHONE_NUMBER || "",
  PAIRING_CODE_BRAND: process.env.PAIRING_CODE_BRAND || "SHADOWV2",
  OWNER_NUM: process.env.OWNER_NUM || "50934960331",
  PREFIX: process.env.PREFIX || ".",
  MODE : process.env.MODE || "public", 
  // AUTO_RECORDING: convertToBool(process.env.AUTO_RECORDING || "true"), // REMOVED: Auto recording feature disabled 
  ANTI_DELETE: convertToBool(process.env.ANTI_DELETE || "true"),
  ANTIVIEW_ONCE: process.env.ANTIVIEW_ONCE || "off", // New setting for anti-view-once
  // Enhanced status features
  STATUS_READ_ENABLED: process.env.STATUS_READ_ENABLED || "true", // Enable status read notifications
  STATUS_READ_MESSAGE: process.env.STATUS_READ_MESSAGE || "✅ Your status has been viewed by shadow V2",
  AUTO_STATUS_REACT: process.env.AUTO_STATUS_REACT || "true", // Enable auto-reactions to status
  AUTO_REACT_ENABLED: process.env.AUTO_REACT_ENABLED || "true", // Enable auto-reactions to messages
  // MEGA.nz credentials for session backup
  MEGA_EMAIL: process.env.MEGA_EMAIL || "tizergameht@gmail.com",
  MEGA_PASSWORD: process.env.MEGA_PASSWORD || "mike12&&",
};
