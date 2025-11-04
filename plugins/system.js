const { cmd } = require("../command");
const config = require("../config");
const database = require("../lib/database");

cmd(
  {
    pattern: "system",
    alias: ["sys", "botstatus"],
    react: "🖥️",
    desc: "Check if the bot is in public or private mode.",
    category: "main",
    filename: __filename,
  },
  async (malvin, mek, m, { reply }) => {
    try {
      const mode = (config.MODE || "").toLowerCase();
      let status;

      if (mode === "public") {
        status = "🌍 Bot is running in *Public Mode*";
      } else if (mode === "private") {
        status = "🔒 Bot is running in *Private Mode*";
      } else {
        status = `⚠️ Unknown Mode: *${config.MODE || "Not Set"}*`;
      }

      await reply(`*🖥️ SAKURA V2 SYSTEM STATUS*\n\n${status}`);
    } catch (e) {
      console.error("System Command Error:", e);
      await reply("❌ Error while checking bot status.");
    }
  }
);

cmd(
  {
    pattern: "password",
    alias: ["pwd", "mypassword"],
    react: "🔐",
    desc: "Get your unique settings password",
    category: "main",
    filename: __filename,
  },
  async (malvin, mek, m, { reply, sender }) => {
    try {
      // Extract phone number from sender
      const senderNumber = sender.split("@")[0];
      
      // Check if this is a multi-user context
      const userContext = malvin.userContext || {};
      const phoneNumber = userContext.userPhone || senderNumber;
      
      // Get user data from database
      const user = await database.getUser(phoneNumber);
      
      if (!user) {
        return reply("❌ User not found in database. Please reconnect to generate a password.");
      }

      const passwordInfo = `🔐 *Your SAKURA V2 Settings Password*

\`${user.password}\`

⚙️ *How to use:*
• Go to: https://your-domain.com/settings
• Enter this password to access your bot settings
• No phone number needed, just the password

📱 *Your Number:* +${phoneNumber}

⚠️ *IMPORTANT:*
• This is your unique 8-character password
• DO NOT SHARE this password with anyone
• Only enter it on the official settings page
• Use it to customize your bot features

🎛️ *Settings you can control:*
• Auto Status Views 👀
• Status Reactions ❤️
• Auto Recording 🎙️
• Anti-Delete Protection 🛡️
• And more...`;

      await reply(passwordInfo);
      
    } catch (e) {
      console.error("Password Command Error:", e);
      await reply("❌ Error while retrieving password. Please try again.");
    }
  }
);
