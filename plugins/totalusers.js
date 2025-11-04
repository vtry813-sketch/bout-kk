const { cmd } = require("../command");
const config = require("../config");

cmd(
  {
    pattern: "totalusers",
    alias: ["activesessions", "userscount", "connectedusers"],
    react: "👥",
    desc: "Show total number of active user sessions",
    category: "main",
    filename: __filename,
  },
  async (malvin, mek, m, { reply, isOwner, sender }) => {
    try {
      // Only allow owner to use this command for privacy/security
      if (!isOwner) {
        return reply("❌ This command is restricted to the bot owner only.");
      }

      let connectedUsersCount = 0;
      let connectedUsers = [];
      let sessionInfo = "";

      try {
        // Try to get userManager from global scope first
        if (global.mainUserManager) {
          connectedUsers = global.mainUserManager.getConnectedUsers();
          connectedUsersCount = connectedUsers.length;
          
          // Add session type detection
          const userContext = malvin.userContext || {};
          const isMultiUserMode = userContext.isMultiUser || connectedUsersCount > 1;
          
          if (isMultiUserMode) {
            sessionInfo = `📊 *Multi-User Mode Active*\n\n`;
            sessionInfo += `👥 *Active Sessions:* ${connectedUsersCount}\n`;
            
            if (connectedUsersCount > 0) {
              // Show only count and latest connection time for privacy
              const latestConnection = connectedUsers.reduce((latest, user) => {
                const userTime = new Date(user.connectedAt || 0);
                const latestTime = new Date(latest || 0);
                return userTime > latestTime ? user.connectedAt : latest;
              }, null);
              
              if (latestConnection) {
                sessionInfo += `⏰ *Latest Connection:* ${new Date(latestConnection).toLocaleString()}\n`;
              }
            }
          } else {
            sessionInfo = `📱 *Legacy Single-User Mode*\n\n`;
            if (config.PHONE_NUMBER) {
              sessionInfo += `👤 *Active User:* +${config.PHONE_NUMBER}\n`;
              connectedUsersCount = 1; // Count the legacy user
            }
          }
        } else {
          // Fallback for legacy mode when userManager is not available
          if (config.PHONE_NUMBER) {
            connectedUsersCount = 1;
            sessionInfo = `📱 *Legacy Single-User Mode*\n\n👤 *Active User:* +${config.PHONE_NUMBER}\n`;
          } else {
            sessionInfo = `⚠️ *No active sessions detected*\n\n`;
          }
        }
      } catch (error) {
        console.error("Error getting user count:", error.message);
        
        // Ultimate fallback - check if we have a legacy user
        if (config.PHONE_NUMBER) {
          connectedUsersCount = 1;
          sessionInfo = `📱 *Legacy Mode (Fallback)*\n\n👤 *Active User:* +${config.PHONE_NUMBER}\n`;
        } else {
          sessionInfo = `❌ *Error retrieving session data*\n\n`;
        }
      }

      const totalUsersMessage = `🌸 *SAKURA V2 - Active Sessions* 🌸

${sessionInfo}
📈 *Total Active Sessions:* ${connectedUsersCount}
⏱️ *Bot Uptime:* ${Math.floor(process.uptime() / 60)} minutes
💻 *Memory Usage:* ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB

🔧 *System Info:*
• Mode: ${config.MODE || "public"}
• Prefix: ${config.PREFIX}
• Multi-User Support: ${global.mainUserManager ? "✅ Enabled" : "❌ Limited"}

*Creator:* Andy Mrlit | *Year:* 2025`;

      await reply(totalUsersMessage);
      
    } catch (e) {
      console.error("Total Users Command Error:", e);
      await reply(`❌ Error retrieving user session data:\n${e.message}`);
    }
  }
);