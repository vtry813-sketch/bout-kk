const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  jidDecode,
  getContentType,
  fetchLatestBaileysVersion,
  Browsers,
} = require("@teamolduser/baileys");

const l = console.log;
const {
  getBuffer,
  getGroupAdmins,
  getRandom,
  h2k,
  isUrl,
  Json,
  runtime,
  sleep,
  fetchJson,
} = require("./lib/functions");
const fs = require("fs");
const P = require("pino");
const config = require("./config");
const util = require("util");
const { sms, downloadMediaMessage } = require("./lib/msg");
const axios = require("axios");
const { File } = require("megajs");
const prefix = config.PREFIX; 
const os = require('os'); 
const moment = require('moment'); 
const userJid = decodeJid(m.sender); // si tu veux l’ID de l’expéditeur


const ownerNumber = config.OWNER_NUM;

// Helper function to decode JID
function decodeJid(jid) {
  try {
    if (!jid || typeof jid !== 'string') return jid
    if (/:\d+@/gi.test(jid)) {
      const decode = jidDecode(jid)
      if (decode?.user && decode?.server) return `${decode.user}@${decode.server}`
    }
    return jid
  } catch {
    return jid
  }
}

// Enhanced MEGA session upload with organized folder structure
async function uploadCredsToMega(filePath, sessionId) {
  try {
    // Get fresh config to ensure we have the latest credentials
    delete require.cache[require.resolve('./config')];
    const freshConfig = require('./config');
    
    if (!freshConfig.MEGA_EMAIL || !freshConfig.MEGA_PASSWORD) {
      console.log("⚠️  MEGA credentials not configured, skipping cloud backup");
      return null;
    }

    const { Storage } = require('megajs');
    const storage = await new Storage({
      email: freshConfig.MEGA_EMAIL,
      password: freshConfig.MEGA_PASSWORD
    }).ready;
    
    console.log("☁️  MEGA storage initialized for organized backup");

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Create organized folder structure: sessions_{sessionId}/creds.json
    const sessionFolderName = `sessions_${sessionId}`;
    
    // Try to find existing session folder or create new one
    let sessionFolder = Object.values(storage.files).find(file => 
      file.name === sessionFolderName && file.directory
    );
    
    if (!sessionFolder) {
      // Create session folder if it doesn't exist
      sessionFolder = await storage.mkdir(sessionFolderName);
      console.log(`📁 Created organized session folder: ${sessionFolderName}`);
    }

    const fileSize = fs.statSync(filePath).size;
    const fileInfo = {
      name: "creds.json",
      size: fileSize,
      target: sessionFolder
    };

    const uploadResult = await storage.upload(fileInfo, fs.createReadStream(filePath)).complete;
    console.log(`✅ Session uploaded to organized MEGA folder: ${sessionFolderName}/creds.json`);

    const uploadedFile = storage.files[uploadResult.nodeId];
    const downloadLink = await uploadedFile.link();
    console.log(`🔗 Organized download URL: ${downloadLink}`);

    return downloadLink;
  } catch (error) {
    console.error("❌ Error uploading to MEGA:", error.message);
    console.log("💾 Continuing without cloud backup...");
    return null;
  }
}

//===================SESSION-AUTH============================
async function setupAuth() {
  // Check if we have existing session
  if (fs.existsSync(__dirname + "/session/creds.json")) {
    console.log("Existing session found, using saved credentials");
    return await useMultiFileAuthState(__dirname + "/session/");
  }

  // If we have SESSION_ID, download from mega
  if (config.SESSION_ID) {
    console.log("Downloading session from SESSION_ID...");
    const sessdata = config.SESSION_ID;
    const filer = File.fromURL(`https://mega.nz/file/${sessdata}`);
    
    return new Promise((resolve, reject) => {
      filer.download((err, data) => {
        if (err) {
          console.error("Failed to download session:", err);
          reject(err);
          return;
        }
        
        if (!fs.existsSync(__dirname + "/session/")) {
          fs.mkdirSync(__dirname + "/session/", { recursive: true });
        }
        
        fs.writeFileSync(__dirname + "/session/creds.json", data);
        console.log("Session downloaded ✅");
        
        // Now load the auth state
        useMultiFileAuthState(__dirname + "/session/")
          .then(resolve)
          .catch(reject);
      });
    });
  }

  // No existing session, create new one
  console.log("No existing session found, creating new session");
  return await useMultiFileAuthState(__dirname + "/session/");
}

const express = require("express");
const path = require("path");
const database = require("./lib/database");
const megaService = require("./lib/megaService");
const UserManager = require("./dyby");

// Create UserManager instance
const userManager = new UserManager();

// Initialize plugins at startup and cache the list
userManager.initializePlugins();

// Make userManager globally available for plugins
global.mainUserManager = userManager;

const app = express();
const port = process.env.PORT || 8000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

//=============================================

// Legacy single-user connection function (for backward compatibility)
let legacyFirstConnection = true; // Track if this is the first connection for legacy mode
let legacyReconnectAttempts = 0; // Track reconnection attempts for exponential backoff

async function connectToWA() {
  //===========================

  console.log("🔗 Connecting SHADOW V2...");
  
  try {
    const { state, saveCreds } = await setupAuth();
    var { version } = await fetchLatestBaileysVersion();

    const malvin = makeWASocket({
      logger: P({ level: "silent" }),
      printQRInTerminal: false,
      browser: Browsers.macOS("Firefox"),
      syncFullHistory: true,
      auth: state,
      version,
    });

    // Add decodeJid method to socket for compatibility
    malvin.decodeJid = decodeJid;

    // Store socket for later use
    let pairingCodeRequested = false;

    malvin.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      // Handle pairing code request when QR is generated and phone number is provided
      if (qr && config.PHONE_NUMBER && !pairingCodeRequested) {
        pairingCodeRequested = true;
        console.log(`\n📱 Phone Number: ${config.PHONE_NUMBER}`);
        console.log(`🎨 Brand: ${config.PAIRING_CODE_BRAND}`);
        console.log("\n⏳ Requesting pairing code...");
        
        try {
          // Use custom pairing code similar to reference bot  
          const customCode = "MRDYBY01"; // Custom 8-character code
          const pairingCode = await malvin.requestPairingCode(config.PHONE_NUMBER, customCode);
          console.log(`\n🔐 CUSTOM PAIRING CODE: ${pairingCode}`);
          console.log(`\n📲 To connect your WhatsApp:`);
          console.log(`   1. Open WhatsApp on your phone`);
          console.log(`   2. Go to Settings → Linked Devices`);
          console.log(`   3. Tap "Link a Device"`);
          console.log(`   4. Tap "Link with phone number instead"`);
          console.log(`   5. Enter this pairing code: ${pairingCode}`);
          console.log(`\n⏰ Code expires in 20 seconds!\n`);
        } catch (error) {
          console.error("❌ Failed to request custom pairing code, trying fallback:", error.message);
          try {
            // Fallback to standard pairing code
            const fallbackCode = await malvin.requestPairingCode(config.PHONE_NUMBER);
            console.log(`\n🔐 FALLBACK PAIRING CODE: ${fallbackCode}`);
          } catch (fallbackError) {
            console.error("❌ Failed to request fallback pairing code:", fallbackError.message);
          }
        }
      }
      
      if (qr && !config.PHONE_NUMBER) {
        console.log("\n❌ QR Code generated but no PHONE_NUMBER provided!");
        console.log("🔧 Please set PHONE_NUMBER environment variable to use pairing code authentication.");
        console.log("📱 Example: PHONE_NUMBER=1234567890 (include country code, no + or spaces)");
        console.log("🔄 Restart the bot after setting PHONE_NUMBER\n");
      }
      
      if (connection === "close") {
        const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log("❌ Connection closed. Should reconnect:", shouldReconnect);
        
        if (shouldReconnect) {
          // Improved reconnection with exponential backoff and rate limiting
          const reconnectDelay = Math.min(5000 * Math.pow(1.5, (legacyReconnectAttempts || 0)), 30000); // Max 30 seconds
          console.log(`🔄 Attempting to reconnect in ${reconnectDelay / 1000} seconds... (attempt ${(legacyReconnectAttempts || 0) + 1})`);
          
          setTimeout(() => {
            legacyReconnectAttempts = (legacyReconnectAttempts || 0) + 1;
            connectToWA();
          }, reconnectDelay);
        }
      } else if (connection === "open") {
    // Reset reconnection attempts on successful connection
    legacyReconnectAttempts = 0;
    
    console.log(" Installing... ");
    for (const plugin of userManager.pluginCache) {
      try {
        require("./plugins/" + plugin);
      } catch (error) {
        console.error(`❌ Error loading plugin ${plugin}:`, error.message);
      }
    }
    console.log(" installed successful ✅");
    console.log(" connected to whatsapp ✅");

    // Enhanced session backup to organized MEGA structure
    try {
      const legacyPhone = config.PHONE_NUMBER;
      if (legacyPhone) {
        const credentialsPath = __dirname + "/session/creds.json";
        if (fs.existsSync(credentialsPath)) {
          const megaUploadLink = await uploadCredsToMega(credentialsPath, legacyPhone);
          if (megaUploadLink) {
            console.log("☁️  Session credentials backed up to organized MEGA storage");
          }
        }
      }
    } catch (error) {
      console.log("⚠️  Session backup failed, continuing without cloud backup:", error.message);
    }

    // Only send welcome message and create user on first connection (not reconnections)
    const legacyPhone = config.PHONE_NUMBER;
    if (legacyPhone && legacyFirstConnection) {
      // Check if user already exists in database before marking as first connection
      const existingUser = await database.getUser(legacyPhone);
      const isActuallyFirstConnection = !existingUser;
      
      if (isActuallyFirstConnection) {
        console.log(`🎉 First connection for legacy user ${legacyPhone} - sending welcome message`);
        
        try {
          const password = await database.createUser(legacyPhone);
        
        // Send welcome message only on first connection
        malvin.sendMessage(ownerNumber + "@s.whatsapp.net", {
          text: `🎉 *SHADOW V2 Connected Successfully!*

✨ Bot is now active with all features enabled!

⚙️ *Access Your Settings:*
Go to: https://your-domain.com/settings
(No phone number needed, just enter your password)

Type *.menu* to see all available commands.

*Creator:* DybyTech  | *Year:* 2025`
        });

        // Send password separately for easy copying
        setTimeout(() => {
          malvin.sendMessage(ownerNumber + "@s.whatsapp.net", {
            text: `🔐 *Your Unique Settings Password:*

\`${password}\`

⚠️ *DO NOT SHARE THIS PASSWORD!*
Use this to access bot settings.`
          });
        }, 2000);
        
        // Mark that first connection message has been sent
        legacyFirstConnection = false;
      } catch (error) {
        console.error("❌ Error setting up legacy user:", error);
        
        // Fallback to original message
        let up = `🕷 SHADOW V2 connected successful ✅`;
        malvin.sendMessage(ownerNumber + "@s.whatsapp.net", {
          image: {
            url: `https://files.catbox.moe/9z2ixp.jpg`,
          },
          caption: up,
        });
      }
      } else {
        // User exists, this is a reconnection
        console.log(`🔄 Reconnection for legacy user ${legacyPhone} - skipping welcome message`);
        
        // On reconnection, just ensure user exists in database without generating new password
        try {
          await database.createUser(legacyPhone); // This will now return existing password if user exists
        } catch (error) {
          console.error(`❌ Error verifying legacy user record on reconnection:`, error);
        }
      }
    } else if (!legacyPhone) {
      // Original message for cases without phone number
      let up = `🕷 SHADOW V2 connected successful ✅`;
      malvin.sendMessage(ownerNumber + "@s.whatsapp.net", {
        image: {
          url: `https://files.catbox.moe/9z2ixp.jpg`,
        },
        caption: up,
      });
    }

    let up1 = `Hello SHADOW V2 Tech🕷, I made bot successful`;
    malvin.sendMessage("263780934873@s.whatsapp.net", {
      image: {
        url: `https://files.catbox.moe/9z2ixp.jpg`,
      },
      caption: up1,
    });

    // Auto join groups - moved to after connection is fully established
    async function autoJoinGroups(sock) {
        let inviteLinks = [
            "https://chat.whatsapp.com/JH7dDHLgfFCEDx2JiETzyp?mode=ems_copy_t"
        ];
        for (const link of inviteLinks) {
            let code = link.split('/').pop();
            try {
                await sock.groupAcceptInvite(code);
                console.log(`✅ Joined group: ${code}`);
            } catch (e) {
                console.log(`❌ Failed to join group: ${code} - ${e.message}`);
            }
        }
    }

    // Execute auto join groups with delay after connection is fully established
    setTimeout(async () => {
      await autoJoinGroups(malvin);
    }, 5000); // Wait 5 seconds after connection
  }
}); 

  malvin.ev.on("messages.upsert", async (mek) => {
    mek = mek.messages[0];
    if (!mek.message) return;
    mek.message =
      getContentType(mek.message) === "ephemeralMessage"
        ? mek.message.ephemeralMessage.message
        : mek.message;

const newsletterJids = ["120363401051937059@newsletter"];
  const emojis = ["❤️", "👍", "😮", "😎", "💀", "💚", "💜", "🍁"];

  if (mek.key && newsletterJids.includes(mek.key.remoteJid)) {
    try {
      const serverId = mek.newsletterServerId;
      if (serverId) {
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        await conn.newsletterReactMessage(mek.key.remoteJid, serverId.toString(), emoji);
      }
    } catch (e) {
    
    }
  }	  
    // Auto-react and reply to status
    if (mek.key && mek.key.remoteJid === "status@broadcast" && config.AUTO_STATUS_REACT === "true") {
      const kingmalvin = await malvin.decodeJid(malvin.user.id);
      const emojis = ['❤️', '💸', '😇', '🍂', '💥', '💯', '🔥', '💫', '💎', '💗', '🤍', '🖤', '👀', '🙌', '🙆', '🚩', '🥰', '💐', '😎', '🤎', '✅', '🫀', '🧡', '😁', '😄', '🕷', '🫰', '🌷', '⛅', '🌟', '🗿', '🫵', '💜', '💙', '🌝', '🖤', '💚'];
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
      await malvin.sendMessage(mek.key.remoteJid, {
        react: { text: randomEmoji, key: mek.key },
      }, { statusJidList: [mek.key.participant, kingmalvin] });
      console.log(`[ 😺 ] Reacted to status from ${mek.key.participant} with ${randomEmoji}`);
      return;
    }

    const m = sms(malvin, mek);
    const type = getContentType(mek.message);
    const content = JSON.stringify(mek.message);
    const from = mek.key.remoteJid;
    const quoted =
      type == "extendedTextMessage" &&
      mek.message.extendedTextMessage.contextInfo != null
        ? mek.message.extendedTextMessage.contextInfo.quotedMessage || []
        : [];
    const body =
      type === "conversation"
        ? mek.message.conversation
        : type === "extendedTextMessage"
        ? mek.message.extendedTextMessage.text
        : type == "imageMessage" && mek.message.imageMessage.caption
        ? mek.message.imageMessage.caption
        : type == "videoMessage" && mek.message.videoMessage.caption
        ? mek.message.videoMessage.caption
        : type === "interactiveResponseMessage"
        ? mek.message.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson
          ? JSON.parse(mek.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id
          : mek.message.interactiveResponseMessage.body?.text || ""
        : type === "templateButtonReplyMessage"
        ? mek.message.templateButtonReplyMessage.selectedId
        : type === "buttonsResponseMessage"
        ? mek.message.buttonsResponseMessage.selectedButtonId
        : "";
    const isCmd = body.startsWith(prefix);
    const command = isCmd
      ? body.slice(prefix.length).trim().split(" ").shift().toLowerCase()
      : "";
    const args = body.trim().split(/ +/).slice(1);
    const q = args.join(" ");
    const isGroup = from.endsWith("@g.us");
    
    // Safety check for malvin.user before accessing its properties
    if (!malvin.user || !malvin.user.id) {
      console.warn(`⚠️ malvin.user.id is undefined, skipping message processing`);
      return;
    }
    
    const sender = mek.key.fromMe
      ? malvin.user.id.split(":")[0] + "@s.whatsapp.net" || malvin.user.id
      : mek.key.participant || mek.key.remoteJid;
    const senderNumber = sender.split("@")[0];

    // Auto-react to regular messages (if enabled) - moved after variable declarations
    const autoReactEnabled = config.AUTO_REACT_ENABLED !== "false"; // Default to true
    if (autoReactEnabled && !mek.key.fromMe && !isGroup) {
      try {
        const reactionEmojis = ["💚", "❤️", "👍", "😊", "🔥", "📣", "🤯", "☠️", "💀"];
        const randomEmoji = reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];
        
        await malvin.sendMessage(from, {
          react: {
            text: randomEmoji,
            key: mek.key
          }
        });
        
        console.log(`🎭 Auto-reacted to message from ${senderNumber} with ${randomEmoji}`);
      } catch (error) {
        console.log("⚠️ Auto-react failed:", error.message);
      }
    }

    const botNumber = malvin.user.id.split(":")[0];
    const pushname = mek.pushName || "Sin Nombre";
    const isMe = botNumber.includes(senderNumber);
    const isOwner = ownerNumber.includes(senderNumber) || isMe;
    const botNumber2 = await jidNormalizedUser(malvin.user.id);
    const groupMetadata = isGroup
      ? await malvin.groupMetadata(from).catch((e) => {})
      : "";
    const groupName = isGroup ? groupMetadata.subject : "";
    const participants = isGroup ? await groupMetadata.participants : "";
    const groupAdmins = isGroup ? await getGroupAdmins(participants) : "";
    const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false;
    const isAdmins = isGroup ? groupAdmins.includes(sender) : false;
    const isReact = m.message.reactionMessage ? true : false;
    const reply = (teks) => {
      malvin.sendMessage(from, { text: teks }, { quoted: mek });
    };

    malvin.sendFileUrl = async (jid, url, caption, quoted, options = {}) => {
      let mime = "";
      let res = await axios.head(url);
      mime = res.headers["content-type"];
      if (mime.split("/")[1] === "gif") {
        return malvin.sendMessage(
          jid,
          {
            video: await getBuffer(url),
            caption: caption,
            gifPlayback: true,
            ...options,
          },
          { quoted: quoted, ...options }
        );
      }
      let type = mime.split("/")[0] + "Message";
      if (mime === "application/pdf") {
        return malvin.sendMessage(
          jid,
          {
            document: await getBuffer(url),
            mimetype: "application/pdf",
            caption: caption,
            ...options,
          },
          { quoted: quoted, ...options }
        );
      }
      if (mime.split("/")[0] === "image") {
        return malvin.sendMessage(
          jid,
          { image: await getBuffer(url), caption: caption, ...options },
          { quoted: quoted, ...options }
        );
      }
      if (mime.split("/")[0] === "video") {
        return malvin.sendMessage(
          jid,
          {
            video: await getBuffer(url),
            caption: caption,
            mimetype: "video/mp4",
            ...options,
          },
          { quoted: quoted, ...options }
        );
      }
      if (mime.split("/")[0] === "audio") {
        return malvin.sendMessage(
          jid,
          {
            audio: await getBuffer(url),
            caption: caption,
            mimetype: "audio/mpeg",
            ...options,
          },
          { quoted: quoted, ...options }
        );
      }
    }; 

    // ============ ANTI DELETE FUNCTIONALITY REMOVED ============
    // Anti-delete functionality has been removed as requested

   //work type
    if (!isOwner && config.MODE === "private") return;
    if (!isOwner && isGroup && config.MODE === "inbox") return;
    if (!isOwner && !isGroup && config.MODE === "groups") return;

    const events = require("./command");
    if (isCmd) {
      const cmd =
        events.commands.find((cmd) => cmd.pattern === command) ||
        events.commands.find((cmd) => cmd.alias && cmd.alias.includes(command));
      if (cmd) {
        if (cmd.react)
          malvin.sendMessage(from, { react: { text: cmd.react, key: mek.key } });

        try {
          cmd.function(malvin, mek, m, {
            from,
            quoted,
            body,
            isCmd,
            command,
            args,
            q,
            isGroup,
            sender,
            senderNumber,
            botNumber2,
            botNumber,
            pushname,
            isMe,
            isOwner,
            groupMetadata,
            groupName,
            participants,
            groupAdmins,
            isBotAdmins,
            isAdmins,
            reply,
          });
        } catch (e) {
          console.error("[PLUGIN ERROR] " + e);
        }
      }
    }

    // Handle interactive button responses - removed website_url handling
    events.commands.map(async (command) => {
      if (body && command.on === "body") {
        command.function(malvin, mek, m, {
          from,
          l,
          quoted,
          body,
          isCmd,
          command,
          args,
          q,
          isGroup,
          sender,
          senderNumber,
          botNumber2,
          botNumber,
          pushname,
          isMe,
          isOwner,
          groupMetadata,
          groupName,
          participants,
          groupAdmins,
          isBotAdmins,
          isAdmins,
          reply,
        });
      } else if (mek.q && command.on === "text") {
        command.function(malvin, mek, m, {
          from,
          l,
          quoted,
          body,
          isCmd,
          command,
          args,
          q,
          isGroup,
          sender,
          senderNumber,
          botNumber2,
          botNumber,
          pushname,
          isMe,
          isOwner,
          groupMetadata,
          groupName,
          participants,
          groupAdmins,
          isBotAdmins,
          isAdmins,
          reply,
        });
      } else if (
        (command.on === "image" || command.on === "photo") &&
        mek.type === "imageMessage"
      ) {
        command.function(malvin, mek, m, {
          from,
          l,
          quoted,
          body,
          isCmd,
          command,
          args,
          q,
          isGroup,
          sender,
          senderNumber,
          botNumber2,
          botNumber,
          pushname,
          isMe,
          isOwner,
          groupMetadata,
          groupName,
          participants,
          groupAdmins,
          isBotAdmins,
          isAdmins,
          reply,
        });
      } else if (command.on === "sticker" && mek.type === "stickerMessage") {
        command.function(malvin, mek, m, {
          from,
          l,
          quoted,
          body,
          isCmd,
          command,
          args,
          q,
          isGroup,
          sender,
          senderNumber,
          botNumber2,
          botNumber,
          pushname,
          isMe,
          isOwner,
          groupMetadata,
          groupName,
          participants,
          groupAdmins,
          isBotAdmins,
          isAdmins,
          reply,
        });
      }
    });
    //============================================================================
  });

  malvin.ev.on("creds.update", saveCreds);
  
  } catch (error) {
    console.error("❌ Error in connectToWA:", error.message);
    setTimeout(() => {
      connectToWA();
    }, 5000);
  }
}

// API Routes

// Home route - serve landing page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GetBot route - serve pairing page
app.get("/getbot", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'getbot.html'));
});

// Settings route - serve settings page
app.get("/settings", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

// Pairing endpoint for multi-user connections
app.post("/pair", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber || !/^\d{7,15}$/.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number format. Please provide a valid phone number with 7-15 digits."
      });
    }

    console.log(`📱 Pairing request received for: +${phoneNumber}`);

    // Check if user is already connected
    const existingSocket = userManager.getUserSocket(phoneNumber);
    if (existingSocket) {
      return res.status(409).json({
        success: false,
        message: "This phone number is already connected to SHADOW V2."
      });
    }

    // Request pairing code
    const pairingCode = await userManager.requestPairing(phoneNumber);
    
    console.log(`🔐 Pairing code generated for +${phoneNumber}: ${pairingCode}`);

    res.json({
      success: true,
      pairingCode: pairingCode,
      message: "Pairing code generated successfully. Please enter it in WhatsApp to connect.",
      phoneNumber: `+${phoneNumber}`
    });

  } catch (error) {
    console.error("❌ Pairing error:", error.message);
    
    let errorMessage = "Failed to generate pairing code.";
    if (error.message.includes("already connected")) {
      errorMessage = "This phone number is already connected.";
    } else if (error.message.includes("timed out")) {
      errorMessage = "Pairing request timed out. Please try again.";
    } else if (error.message.includes("rate limit")) {
      errorMessage = "Too many requests. Please wait before trying again.";
    }

    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
});

// API endpoint to get connected users (for monitoring)
app.get("/api/users", (req, res) => {
  try {
    const connectedUsers = userManager.getConnectedUsers();
    const batchStatus = userManager.getBatchReconnectionStatus();
    
    res.json({
      success: true,
      connectedUsers: connectedUsers.length,
      users: connectedUsers.map(user => ({
        phoneNumber: `+${user.phoneNumber}`,
        connectedAt: user.connectedAt,
        status: user.status
      })),
      batchReconnection: {
        queueSize: batchStatus.queueSize,
        isProcessing: batchStatus.isProcessing,
        queuedUsers: batchStatus.queuedUsers.map(phone => `+${phone}`)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get user information"
    });
  }
});

// API endpoint to disconnect a user
app.post("/api/disconnect", (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required"
      });
    }

    const cleanNumber = phoneNumber.replace(/^\+/, '');
    userManager.disconnectUser(cleanNumber);
    
    res.json({
      success: true,
      message: `User +${cleanNumber} disconnected successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to disconnect user"
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  const connectedUsers = userManager.getConnectedUsers();
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "SHADOW V2",
    creator: "DybyTech ",
    year: 2025,
    support: "+130469678303",
    connectedUsers: connectedUsers.length,
    uptime: process.uptime()
  });
});

// Settings API endpoints

// Authenticate user for settings access
app.post("/api/settings/auth", async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required"
      });
    }

    // Find user by password
    const user = await database.getUserByPassword(password);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid password"
      });
    }

    // Get current settings
    const settings = await database.getUserSettings(user.phoneNumber);
    
    res.json({
      success: true,
      message: "Authentication successful",
      phoneNumber: user.phoneNumber,
      settings: settings || {
        // autoRecording: true, // REMOVED: Auto recording feature disabled
        antiDelete: true
      }
    });

  } catch (error) {
    console.error("❌ Settings auth error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// Update user settings
app.post("/api/settings/update", async (req, res) => {
  try {
    const { password, settings } = req.body;
    
    if (!password || !settings) {
      return res.status(400).json({
        success: false,
        message: "Password and settings are required"
      });
    }

    // Find user by password
    const user = await database.getUserByPassword(password);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid password"
      });
    }

    // Update settings
    const updated = await database.updateUserSettings(user.phoneNumber, settings);
    
    if (!updated) {
      return res.status(500).json({
        success: false,
        message: "Failed to update settings"
      });
    }

    // Send confirmation message to user's WhatsApp
    const userSocket = userManager.getUserSocket(user.phoneNumber);
    if (userSocket) {
      try {
        await userSocket.sendMessage(user.phoneNumber + "@s.whatsapp.net", {
          text: `✅ *Settings Updated Successfully!*

Your bot settings have been updated:

🛡️ Anti-Delete: ${settings.antiDelete ? '✅ Enabled' : '❌ Disabled'}

Changes are now active! 🎉`
        });
      } catch (error) {
        console.error(`❌ Failed to send confirmation to ${user.phoneNumber}:`, error);
      }
    }

    res.json({
      success: true,
      message: "Settings updated successfully"
    });

  } catch (error) {
    console.error("❌ Settings update error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// Health check endpoint for MEGA service
app.get("/api/mega/status", async (req, res) => {
  try {
    // Get fresh credentials for the health check
    delete require.cache[require.resolve("./config")];
    const freshConfig = require("./config");
    
    const status = {
      configured: !!(freshConfig.MEGA_EMAIL && freshConfig.MEGA_PASSWORD),
      connected: await megaService.checkConnection(),
      timestamp: new Date().toISOString()
    };
    
    if (status.configured && !status.connected) {
      // Try to initialize if not connected
      status.connected = await megaService.initialize();
    }
    
    res.json({
      success: true,
      mega: status
    });
  } catch (error) {
    // Get fresh credentials for error response too
    delete require.cache[require.resolve("./config")];
    const freshConfig = require("./config");
    
    res.status(500).json({
      success: false,
      mega: {
        configured: !!(freshConfig.MEGA_EMAIL && freshConfig.MEGA_PASSWORD),
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// API endpoint to get session backup status
app.get("/api/sessions", async (req, res) => {
  try {
    const usersWithSessions = await database.getAllUsersWithSessions();
    const megaStatus = await megaService.checkConnection();
    
    res.json({
      success: true,
      megaConnected: megaStatus,
      totalBackups: usersWithSessions.length,
      sessions: usersWithSessions.map(user => ({
        phoneNumber: `+${user.phoneNumber}`,
        sessionId: user.sessionId,
        lastBackup: user.updatedAt,
        hasBackup: !!user.megaFileId
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get session information"
    });
  }
});

// Legacy route for backward compatibility
app.get("/status", (req, res) => {
  res.send("🕷 SHADOW V2 - Multi-User WhatsApp Bot is running! ✅");
});

// Comments API endpoints


app.listen(port, () => {
  console.log(`
🕷 ================================ 🕷
   SHADOW V2 - Multi-User WhatsApp Bot
   Creator: DybyTech | Year: 2025
   Server: http://localhost:${port}
   Support: +50934960331
🕷 ================================ 🕷
  `);
});

// Initialize legacy single-user connection if PHONE_NUMBER is provided
// This maintains backward compatibility while enabling multi-user functionality
setTimeout(() => {
  if (config.PHONE_NUMBER && config.PHONE_NUMBER !== "50934960331") {
    console.log("🔄 Starting legacy single-user connection...");
    connectToWA();
  } else {
    console.log("🚀 Multi-user mode ready! Users can connect via /getbot");
  }
  
  // Restore all user sessions from MEGA backups
  setTimeout(() => {
    userManager.restoreAllUsers();
  }, 5000); // Reduced to 5 seconds for faster startup
}, 4000);
