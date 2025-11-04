const { cmd, commands } = require("../command");
const config = require('../config');
const os = require('os'); // To get RAM info
const moment = require('moment'); // For uptime formatting
const database = require('../lib/database');

cmd(
  {
    pattern: "menu",
    alias: ["getmenu"],
    react: "📜",
    desc: "Get bot command list",
    category: "main",
    filename: __filename,
  },
  async (malvin, mek, m, { from, pushname, sender, reply }) => {
    try {
      // Calculate dynamic values
      const uptime = moment.duration(process.uptime() * 1000).humanize();
      const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + " GB";
      const usedRam = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + " MB";
      const owner = config.OWNER_NUMBER || "Unknown"; // fallback
      const user = pushname || sender.split("@")[0];

      // Get connected users count from userManager
      let connectedUsersCount = 0;
      try {
        // Try to get userManager from global scope or require the correct path
        let userManager;
        if (global.userManager) {
          userManager = global.userManager;
        } else {
          const UserManager = require("../andy");
          userManager = new UserManager();
        }
        const connectedUsers = userManager.getConnectedUsers();
        connectedUsersCount = connectedUsers.length;
      } catch (error) {
        console.log("Could not get connected users count:", error.message);
        // Fallback: try to get from the main index.js if available
        try {
          if (global.mainUserManager) {
            connectedUsersCount = global.mainUserManager.getConnectedUsers().length;
          }
        } catch (fallbackError) {
          // Default to 1 if we can't get the count (single user mode)
          connectedUsersCount = 1;
        }
      }

      // Check if this is a multi-user session
      const userContext = malvin.userContext || {};
      const sessionType = userContext.isMultiUser ? "Multi-User" : "Legacy";
      const userPhone = userContext.userPhone ? `+${userContext.userPhone}` : "N/A";

      // Create menu categories
      let menu = {
        main: "",
        download: "",
        group: "",
        owner: "",
        convert: "",
        search: "",
      };

      for (let i = 0; i < commands.length; i++) {
        const oneCmd = commands[i]; // <== changed cmd -> oneCmd
        if (oneCmd.pattern && !oneCmd.dontAddCommandList) {
          const line = `┃   ▪️ ${config.PREFIX}${oneCmd.pattern}\n`;
          if (menu[oneCmd.category]) {
            menu[oneCmd.category] += line;
          }
        }
      }

      const madeMenu = `𝐘𝐨𝐨  ${user}
*Wᴇʟᴄᴏᴍᴇ Tᴏ 🌸 SAKURA V2 🌸* 

╭─「 🛠️ ꜱᴛᴀᴛᴜꜱ ᴅᴇᴛᴀɪʟꜱ 」 
│🤖 *Bot*: SAKURA V2
│🙋‍♂️ *User*: ${user}
│📱 *Owner*: ${owner}
│⏳ *Uptime*: ${uptime}
│💾 *Ram*: ${usedRam} / ${totalRam}
│🛎️ *Prefix*: ${config.PREFIX}
│👥 *Connected Users*: ${connectedUsersCount}
╰──────────●●►

╭─「 📜 ᴍᴇɴᴜ ᴏᴘᴛɪᴏɴꜱ 」 
│ ⚙️ *MAIN COMMANDS*
${menu.main || '│   ➥ .alive \n│   ➥ .menu \n│   ➥ .ai <text> \n│   ➥ .system \n'}
│ 📥 *DOWNLOAD COMMANDS*
${menu.download || '│   ➥ .song <text> \n│   ➥ .video <text> \n│   ➥ .fb <link> \n│   ➥ .tiktok <link> \n│   ➥ .insta <link> \n'}
│ 👥 *GROUP COMMANDS*
${menu.group || '│   ➥ .tagall <message> \n│   ➥ .kick <reply/mention \n'}
│ 🔁 *CONVERT COMMANDS*
${menu.convert || '│   ➥ .sticker <reply img> \n│   ➥ .img <reply sticker> \n│   ➥ .tr <lang> <text>\n│   ➥ .tts <text> \n'}
╰──────────●●►`;

      // Create interactive buttons using new Baileys format
      const interactiveButtons = [
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "Creator 🔥",
            id: ".developer"
          })
        },
        {
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: "Get Free Bot 🔥",
            url: "https://sakurav2.mazxa.com"
          })
        }
      ];

      // Send interactive message with new format
      const imageInteractiveMessage = {
        image: { url: "https://files.catbox.moe/roubzi.jpg" },
        text: madeMenu,
        title: "🌸 SAKURA V2 Menu 🌸",
        footer: "> *POWERED BY 🌸 SAKURA V2 🌸*",
        interactiveButtons
      };

      const sent = await malvin.sendMessage(from, imageInteractiveMessage, { quoted: m });

    } catch (e) {
      console.error(e);
      reply("❌ Menu error:\n" + e.message);
    }
  }
);
