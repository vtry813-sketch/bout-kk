const { cmd } = require("../command");

cmd(
  {
    pattern: "alive",
    react: "🌸",
    desc: "Show SAKURA V2 bot status",
    category: "main",
    filename: __filename,
    fromMe: false,
  },
  async (malvin, mek, m, { reply }) => {
    try {
      const from = mek.key.remoteJid;
      const userContext = malvin.userContext || {};

      await malvin.sendPresenceUpdate("recording", from);

      // Get user info for multi-user display
      const userInfo = userContext.isMultiUser 
        ? `\n📱 *Your Number:* +${userContext.userPhone}\n🔗 *Connection:* Multi-User Session` 
        : `\n🔗 *Connection:* Legacy Session`;

      // SAKURA V2 Alive Image & Caption
      await malvin.sendMessage(
        from,
        {
          image: {
            url: "https://i.ibb.co/SDWZFh23/malvin-xd.jpg",
          },
          caption: `🌸 *SAKURA V2 IS ALIVE NOW* 🌸
  
✨ *Advanced Multi-User WhatsApp Bot*
🎯 *Creator:* Andy Mrlit | *Year:* 2025
🆔 *Version:* SAKURA V2.0
${userInfo}

🌟 *Premium Features Available:*
• 👥 Multi-User Support
• 🤖 AI Chat Integration  
• 📥 Media Downloads (YT, FB, IG)
• 🛡️ Privacy-Secure Sessions
• ⚡ Lightning Fast Responses
• 🌐 24/7 Uptime

📞 *Support:* +130469678303
💻 *Website:* Use .menu for commands

*We are not responsible for any WhatsApp bans that may occur due to the usage of this bot. Use it wisely and at your own risk* ⚠️`,
        },
        { quoted: mek }
      );

      // Delay for realistic interaction
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Enhanced voice message for SAKURA V2
      await malvin.sendMessage(
        from,
        {
          audio: {
            url: "https://files.catbox.moe/wz8rh7.mp3",
          },
          mimetype: "audio/mpeg",
          ptt: true,
        },
        { quoted: mek }
      );
    } catch (e) {
      console.error("❌ Error in .alive command:", e);
      reply("❌ Error while sending alive message!");
    }
  }
);
