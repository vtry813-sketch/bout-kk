const {
  default: makeWASocket,
  useMultiFileAuthState,
  jidDecode,
  DisconnectReason,
  jidNormalizedUser,
  getContentType,
  fetchLatestBaileysVersion,
  Browsers,
} = require("baileys");

const fs = require("fs");
const path = require("path");
const P = require("pino");
const config = require("./config");
const database = require("./lib/database");
const megaService = require("./lib/megaService");
const { getBuffer, getGroupAdmins } = require("./lib/functions");
const axios = require("axios");
const { sms } = require("./lib/msg");

// UserManager class definition  
class UserManager {
  constructor() {
    this.users = new Map(); // phoneNumber -> { socket, session, status, isFirstConnection }
    this.pendingPairings = new Map(); // phoneNumber -> { resolve, reject, timeout }
    this.connectionAttempts = new Map(); // phoneNumber -> count
    this.pluginCache = []; // Cached list of plugin filenames
    this.activeSessions = new Map(); // sessionId -> session info (similar to reference bot)
    
    // Batch reconnection system
    this.reconnectionQueue = new Set(); // phoneNumber set for pending reconnections
    this.batchReconnectionTimer = null;
    this.isProcessingBatch = false;
    this.batchConfig = {
      batchSize: 50, // Reconnect 3 users at a time
      batchDelay: 5000, // 15 seconds between batches
      individualDelay: 5000, // 5 seconds between individual connections in a batch
      maxRetries: 3
    };
  }

  // Load available plugins once at startup and cache the list
  async initializePlugins() {
    try {
      const pluginDir = path.join(__dirname, "plugins");
      const files = await fs.promises.readdir(pluginDir);
      this.pluginCache = files.filter(
        (file) => path.extname(file).toLowerCase() === ".js"
      );
      console.log(`📦 Cached ${this.pluginCache.length} plugins`);
    } catch (error) {
      console.error("❌ Failed to load plugins:", error.message);
      this.pluginCache = [];
    }
  }

  // Auto join groups with improved error handling and retry logic
  async autoJoinGroups(sock, phoneNumber) {
    let inviteLinks = [
      "https://chat.whatsapp.com/C5KEaVREff12xkkcfm01Lj?mode=ems_copy_c"
    ];
    
    for (const link of inviteLinks) {
      // Extract group code properly, handling different URL formats
      let code = link.split('/').pop();
      if (code.includes('?')) {
        code = code.split('?')[0]; // Remove query parameters
      }
      
      let attempts = 0;
      const maxAttempts = 3;
      let success = false;
      
      while (attempts < maxAttempts && !success) {
        try {
          attempts++;
          console.log(`🔄 User ${phoneNumber} attempting to join group ${code} (attempt ${attempts}/${maxAttempts})...`);
          
          await sock.groupAcceptInvite(code);
          console.log(`✅ User ${phoneNumber} joined group: ${code}`);
          success = true;
          
        } catch (e) {
          console.log(`❌ User ${phoneNumber} failed to join group: ${code} (attempt ${attempts}) - ${e.message}`);
          
          if (attempts < maxAttempts) {
            console.log(`🔄 Retrying in ${attempts * 2} seconds...`);
            await new Promise(resolve => setTimeout(resolve, attempts * 2000)); // Progressive delay
          } else {
            console.log(`💔 User ${phoneNumber} exhausted all attempts to join group: ${code}`);
          }
        }
      }
    }
  }

  // Batch reconnection system methods
  addToReconnectionQueue(phoneNumber) {
    console.log(`📋 Adding ${phoneNumber} to batch reconnection queue`);
    this.reconnectionQueue.add(phoneNumber);
    
    // If we're not currently processing batches, start the batch timer
    if (!this.batchReconnectionTimer && !this.isProcessingBatch) {
      console.log(`⏰ Starting batch reconnection timer`);
      this.batchReconnectionTimer = setTimeout(() => {
        this.processBatchReconnections();
      }, this.batchConfig.batchDelay);
    }
  }

  async processBatchReconnections() {
    if (this.isProcessingBatch) {
      console.log(`🔄 Batch processing already in progress, skipping`);
      return;
    }

    this.isProcessingBatch = true;
    this.batchReconnectionTimer = null;

    try {
      const queueArray = Array.from(this.reconnectionQueue);
      
      if (queueArray.length === 0) {
        console.log(`📭 No users in reconnection queue`);
        this.isProcessingBatch = false;
        return;
      }

      console.log(`🚀 Processing batch reconnection for ${queueArray.length} user(s)`);

      // Process users in batches
      for (let i = 0; i < queueArray.length; i += this.batchConfig.batchSize) {
        const batch = queueArray.slice(i, i + this.batchConfig.batchSize);
        console.log(`📦 Processing batch ${Math.floor(i / this.batchConfig.batchSize) + 1} with ${batch.length} user(s)`);

        // Process each user in the current batch with individual delays
        for (let j = 0; j < batch.length; j++) {
          const phoneNumber = batch[j];
          
          try {
            console.log(`🔌 Reconnecting user ${phoneNumber} (${j + 1}/${batch.length} in batch)`);
            
            // Remove from queue before attempting reconnection
            this.reconnectionQueue.delete(phoneNumber);
            
            // Attempt reconnection
            await this.connectUser(phoneNumber);
            
            // Individual delay between connections in the same batch
            if (j < batch.length - 1) {
              await new Promise(resolve => setTimeout(resolve, this.batchConfig.individualDelay));
            }
            
          } catch (error) {
            console.error(`❌ Batch reconnection failed for ${phoneNumber}:`, error.message);
            
            // Check if we should retry
            const attempts = this.connectionAttempts.get(phoneNumber) || 0;
            if (attempts < this.batchConfig.maxRetries) {
              console.log(`🔄 Will retry ${phoneNumber} in next batch cycle`);
              this.reconnectionQueue.add(phoneNumber);
            } else {
              console.log(`❌ Max retries reached for ${phoneNumber}, removing from queue`);
              this.connectionAttempts.delete(phoneNumber);
            }
          }
        }

        // Delay between batches (except for the last batch)
        if (i + this.batchConfig.batchSize < queueArray.length) {
          console.log(`⏳ Waiting ${this.batchConfig.batchDelay / 1000} seconds before next batch`);
          await new Promise(resolve => setTimeout(resolve, this.batchConfig.batchDelay));
        }
      }

      // If there are still users in the queue (from retries), schedule another batch
      if (this.reconnectionQueue.size > 0) {
        console.log(`🔄 ${this.reconnectionQueue.size} user(s) still in queue, scheduling next batch in ${this.batchConfig.batchDelay / 1000} seconds`);
        this.batchReconnectionTimer = setTimeout(() => {
          this.processBatchReconnections();
        }, this.batchConfig.batchDelay);
      } else {
        console.log(`✅ Batch reconnection processing completed`);
      }

    } catch (error) {
      console.error(`❌ Error in batch reconnection processing:`, error.message);
    } finally {
      this.isProcessingBatch = false;
    }
  }

  // Remove user from reconnection queue if they connect successfully elsewhere
  removeFromReconnectionQueue(phoneNumber) {
    if (this.reconnectionQueue.has(phoneNumber)) {
      this.reconnectionQueue.delete(phoneNumber);
      console.log(`✅ Removed ${phoneNumber} from reconnection queue (connected successfully)`);
    }
  }

  async createUserSession(phoneNumber) {
    const userSessionPath = path.join(__dirname, `sessions/user_${phoneNumber}`);
    
    // Create user session directory if it doesn't exist
    if (!fs.existsSync(userSessionPath)) {
      fs.mkdirSync(userSessionPath, { recursive: true });
    }

    return await useMultiFileAuthState(userSessionPath);
  }

  async backupSessionToMega(phoneNumber) {
    try {
      // Validate MEGA credentials before proceeding
      if (!await megaService.checkConnection()) {
        console.log(`⚠️ MEGA credentials not available for ${phoneNumber}, skipping backup`);
        return false;
      }

      // Check if user already has a backup that we can verify
      const user = await database.getUser(phoneNumber);
      if (user && user.sessionId && user.megaFileId) {
        console.log(`✅ Session backup already exists for ${phoneNumber}, verifying integrity...`);
        
        // Quick integrity check - if the backup exists and is recent, skip
        const backupAge = Date.now() - new Date(user.updatedAt).getTime();
        if (backupAge < 300000) { // Less than 5 minutes old
          console.log(`✅ Recent backup found for ${phoneNumber}, skipping new backup`);
          return { sessionId: user.sessionId, megaFileId: user.megaFileId };
        }
      }

      const userSessionPath = path.join(__dirname, `sessions/user_${phoneNumber}`);
      const credFilePath = path.join(userSessionPath, 'creds.json');
      
      // Check if session file exists and has content
      if (!fs.existsSync(credFilePath)) {
        console.log(`⚠️ No session file found for ${phoneNumber}, skipping backup`);
        return false;
      }

      // Verify the session file has valid content
      try {
        const credFileContent = fs.readFileSync(credFilePath, 'utf8');
        const credData = JSON.parse(credFileContent);
        if (!credData || Object.keys(credData).length === 0) {
          console.log(`⚠️ Empty session file for ${phoneNumber}, skipping backup`);
          return false;
        }
      } catch (parseError) {
        console.log(`⚠️ Invalid session file for ${phoneNumber}, skipping backup:`, parseError.message);
        return false;
      }

      // Generate session ID and upload to MEGA with improved retry logic
      const sessionId = database.generateSessionId();
      let megaFileId = null;
      let attempts = 0;
      const maxAttempts = 5; // Increased from 3 to 5
      
      while (attempts < maxAttempts && !megaFileId) {
        try {
          attempts++;
          console.log(`📤 Backup attempt ${attempts}/${maxAttempts} for ${phoneNumber}...`);
          
          // Re-validate credentials before each attempt
          if (!await megaService.checkConnection()) {
            throw new Error('MEGA credentials became unavailable during backup process');
          }
          
          megaFileId = await megaService.uploadSession(phoneNumber, userSessionPath);
          break;
        } catch (error) {
          console.error(`❌ Backup attempt ${attempts} failed for ${phoneNumber}:`, error.message);
          if (attempts < maxAttempts) {
            const delay = Math.min(attempts * 3000, 15000); // Progressive delay, max 15 seconds
            console.log(`🔄 Retrying in ${delay / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      if (!megaFileId) {
        console.error(`❌ All backup attempts failed for ${phoneNumber}`);
        return false;
      }
      
      // Store session info in database with verification
      const updated = await database.updateUserSession(phoneNumber, sessionId, megaFileId);
      if (!updated) {
        console.error(`❌ Failed to store session info in database for ${phoneNumber}`);
        // Try to clean up the uploaded file if database update fails
        try {
          await megaService.deleteSession(megaFileId);
        } catch (cleanupError) {
          console.error(`❌ Failed to cleanup uploaded session for ${phoneNumber}:`, cleanupError.message);
        }
        return false;
      }
      
      console.log(`✅ Session backed up for ${phoneNumber} with ID: ${sessionId}`);
      return { sessionId, megaFileId };
    } catch (error) {
      console.error(`❌ Failed to backup session for ${phoneNumber}:`, error.message);
      return false;
    }
  }

  async restoreSessionFromMega(phoneNumber) {
    try {
      // Validate MEGA credentials before proceeding
      if (!await megaService.checkConnection()) {
        console.log(`⚠️ MEGA credentials not available for ${phoneNumber}, cannot restore session`);
        return false;
      }

      const user = await database.getUser(phoneNumber);
      if (!user || !user.sessionId || !user.megaFileId) {
        console.log(`⚠️ No session backup found for ${phoneNumber}`);
        return false;
      }

      const userSessionPath = path.join(__dirname, `sessions/user_${phoneNumber}`);
      
      // Download session from MEGA
      console.log(`📥 Downloading session from MEGA for ${phoneNumber}...`);
      await megaService.downloadSession(user.megaFileId, userSessionPath);
      
      console.log(`✅ Session restored for ${phoneNumber} from backup`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to restore session for ${phoneNumber}:`, error.message);
      return false;
    }
  }

  async cleanupUserSession(phoneNumber) {
    try {
      const user = await database.getUser(phoneNumber);
      if (user && user.megaFileId) {
        // Delete from MEGA
        await megaService.deleteSession(user.megaFileId);
        
        // Remove from database
        await database.deleteUserSession(phoneNumber);
        
        console.log(`✅ Session cleanup completed for ${phoneNumber}`);
      }

      // Delete local session files
      const userSessionPath = path.join(__dirname, `sessions/user_${phoneNumber}`);
      if (fs.existsSync(userSessionPath)) {
        fs.rmSync(userSessionPath, { recursive: true, force: true });
        console.log(`✅ Local session files deleted for ${phoneNumber}`);
      }
    } catch (error) {
      console.error(`❌ Failed to cleanup session for ${phoneNumber}:`, error.message);
    }
  }

  async connectUser(phoneNumber) {
    try {
      // Create session entry similar to reference bot
      const sessionId = `session_${phoneNumber}`;
      
      // Initialize session in activeSessions map
      this.activeSessions.set(sessionId, {
        phoneNumber: phoneNumber,
        connected: false,
        pairingCode: null,
        socket: null,
        createdAt: new Date(),
        lastActivity: new Date()
      });

      // Validate phone number format
      if (!phoneNumber || !/^\d{7,15}$/.test(phoneNumber)) {
        throw new Error(`Invalid phone number format: ${phoneNumber}`);
      }
      
      // Check connection attempts to prevent spam
      const attempts = this.connectionAttempts.get(phoneNumber) || 0;
      if (attempts > 5) { // Increased limit from 3 to 5
        console.log(`⚠️ Too many connection attempts for ${phoneNumber}, backing off for 1 hour...`);
        // Reset attempts after 1 hour
        setTimeout(() => {
          this.connectionAttempts.set(phoneNumber, 0);
        }, 3600000);
        return null;
      }
      
      console.log(`🔗 Connecting user ${phoneNumber}...`);
      
      let existingUserInDb = null;
      let hasLocalSession = false;
      let hasCompletedBackup = false;
      
      try {
        // Improved connection type detection - check for completed session backup
        existingUserInDb = await database.getUser(phoneNumber);
        const sessionPath = path.join(__dirname, `sessions/user_${phoneNumber}`, 'creds.json');
        hasLocalSession = fs.existsSync(sessionPath);
        
        // Check if user has completed session backup (both sessionId and megaFileId)
        hasCompletedBackup = existingUserInDb && existingUserInDb.sessionId && existingUserInDb.megaFileId;
      } catch (dbError) {
        console.log(`⚠️ Database error checking user ${phoneNumber}, treating as first connection:`, dbError.message);
        existingUserInDb = null;
        hasCompletedBackup = false;
      }
      
      // Connection is "first" if user doesn't exist OR exists but has no completed backup
      const isFirstConnection = !existingUserInDb || !hasCompletedBackup;
      
      console.log(`📊 Connection type for ${phoneNumber}: ${isFirstConnection ? 'First Connection/Incomplete Setup' : 'Session Restore'}`);
      
      // For reconnections without completed backup, try to restore session first
      if (!isFirstConnection && !hasLocalSession && hasCompletedBackup) {
        const sessionRestored = await this.restoreSessionFromMega(phoneNumber);
        if (sessionRestored) {
          console.log(`✅ Session restored from backup for ${phoneNumber}`);
        } else {
          console.log(`⚠️ Failed to restore session for ${phoneNumber}, treating as first connection`);
          // If session restore fails, treat as first connection
          this.users.set(phoneNumber, {
            ...this.users.get(phoneNumber),
            isFirstConnection: true
          });
        }
      }
      
      const { state, saveCreds } = await this.createUserSession(phoneNumber);
      const { version } = await fetchLatestBaileysVersion();

      const socket = makeWASocket({
        logger: P({ level: "silent" }),
        printQRInTerminal: false,
        browser: Browsers.macOS("Firefox"),
        syncFullHistory: false,
        auth: state,
        version,
      });

      // Add decodeJid method to socket for compatibility
      socket.decodeJid = decodeJid;

      // Store user connection with simplified flags
      this.users.set(phoneNumber, {
        socket,
        session: state,
        status: 'connecting',
        phoneNumber,
        connectedAt: new Date(),
        isFirstConnection: isFirstConnection
      });

      // Update activeSessions with socket
      if (this.activeSessions.has(sessionId)) {
        this.activeSessions.get(sessionId).socket = socket;
      }

      // Increment connection attempts
      this.connectionAttempts.set(phoneNumber, attempts + 1);

      // Set up event handlers for this user
      this.setupUserEventHandlers(phoneNumber, socket, saveCreds);

      return socket;
    } catch (error) {
      console.error(`❌ Error connecting user ${phoneNumber}:`, error.message);
      // Increment failed attempts
      const attempts = this.connectionAttempts.get(phoneNumber) || 0;
      this.connectionAttempts.set(phoneNumber, attempts + 1);
      throw error;
    }
  }

  getConnectedUsers() {
    const connected = [];
    for (const [phoneNumber, user] of this.users) {
      if (user.status === 'connected') {
        connected.push({
          phoneNumber,
          connectedAt: user.connectedAt,
          status: user.status
        });
      }
    }
    return connected;
  }

  getBatchReconnectionStatus() {
    return {
      queueSize: this.reconnectionQueue.size,
      isProcessing: this.isProcessingBatch,
      hasTimer: !!this.batchReconnectionTimer,
      queuedUsers: Array.from(this.reconnectionQueue),
      batchConfig: this.batchConfig
    };
  }

  getUserSocket(phoneNumber) {
    const user = this.users.get(phoneNumber);
    return user && user.status === 'connected' ? user.socket : null;
  }

  disconnectUser(phoneNumber) {
    const user = this.users.get(phoneNumber);
    if (user && user.socket) {
      user.socket.end();
      this.users.delete(phoneNumber);
      this.connectionAttempts.delete(phoneNumber);
      console.log(`🔌 Disconnected user ${phoneNumber}`);
    }
  }

  async requestPairing(phoneNumber) {
    return new Promise(async (resolve, reject) => {
      try {
        // Check if user is already connected
        if (this.users.has(phoneNumber) && this.users.get(phoneNumber).status === 'connected') {
          reject(new Error('User already connected'));
          return;
        }

        // Clear any existing pending pairing for this phone number
        if (this.pendingPairings.has(phoneNumber)) {
          const old = this.pendingPairings.get(phoneNumber);
          clearTimeout(old.timeout);
          this.pendingPairings.delete(phoneNumber);
        }

        // Set up timeout for new pairing request
        const timeout = setTimeout(() => {
          this.pendingPairings.delete(phoneNumber);
          reject(new Error('Pairing request timed out'));
        }, 30000); // 30 second timeout

        // Store pending pairing
        this.pendingPairings.set(phoneNumber, { resolve, reject, timeout });

        // Start connection process
        await this.connectUser(phoneNumber);
      } catch (error) {
        this.pendingPairings.delete(phoneNumber);
        reject(error);
      }
    });
  }

  async restoreAllUsers() {
    try {
      console.log('🔄 Restoring user sessions from MEGA backups...');
      
      // Initialize MEGA service
      const megaAvailable = await megaService.initialize();
      if (!megaAvailable) {
        console.log('⚠️ MEGA service not available, skipping session restoration');
        return;
      }
      console.log('✅ MEGA service initialized');

      // Get all users with session backups
      const usersWithSessions = await database.getAllUsersWithSessions();
      
      if (usersWithSessions.length === 0) {
        console.log('📝 No session backups found');
        return;
      }

      console.log(`📝 Found ${usersWithSessions.length} user(s) with session backups`);
      
  // Restore each user's session with increased delay to prevent rate limiting
      for (const user of usersWithSessions) {
        try {
          console.log(`🔄 Restoring session for ${user.phoneNumber}...`);
          await this.connectUser(user.phoneNumber);
          
          // Increased delay between connections to prevent rate limiting
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
          console.error(`❌ Failed to restore session for ${user.phoneNumber}:`, error.message);
        }
      }
      
      console.log('✅ Session restoration completed');
    } catch (error) {
      console.error('❌ Error during session restoration:', error.message);
    }
  }

  // Simplified event handlers with reduced logging
  setupUserEventHandlers(phoneNumber, socket, saveCreds) {
    const sessionId = `session_${phoneNumber}`;
    
    socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const user = this.users.get(phoneNumber);

      if (qr && this.pendingPairings.has(phoneNumber)) {
        try {
          console.log(`📱 Generating pairing code for ${phoneNumber}...`);
          // Use custom pairing code similar to reference bot
          const customCode = "MRDYBY01"; // Custom 8-character code
          const pairingCode = await socket.requestPairingCode(phoneNumber, customCode);
          console.log(`🔐 Custom pairing code for ${phoneNumber}: ${pairingCode}`);
          
          // Store the pairing code in activeSessions
          if (this.activeSessions.has(sessionId)) {
            this.activeSessions.get(sessionId).pairingCode = pairingCode;
          }
          
          // Resolve the pending pairing promise
          const pending = this.pendingPairings.get(phoneNumber);
          if (pending) {
            clearTimeout(pending.timeout);
            pending.resolve(pairingCode);
            this.pendingPairings.delete(phoneNumber);
          }
        } catch (error) {
          console.error(`❌ Failed to generate pairing code for ${phoneNumber}:`, error.message);
          // Fallback to standard pairing code
          try {
            const fallbackCode = await socket.requestPairingCode(phoneNumber);
            console.log(`🔐 Fallback pairing code for ${phoneNumber}: ${fallbackCode}`);
            
            // Store the fallback pairing code in activeSessions
            if (this.activeSessions.has(sessionId)) {
              this.activeSessions.get(sessionId).pairingCode = fallbackCode;
            }
            
            const pending = this.pendingPairings.get(phoneNumber);
            if (pending) {
              clearTimeout(pending.timeout);
              pending.resolve(fallbackCode);
              this.pendingPairings.delete(phoneNumber);
            }
          } catch (fallbackError) {
            console.error(`❌ Fallback pairing code also failed for ${phoneNumber}:`, fallbackError.message);
            const pending = this.pendingPairings.get(phoneNumber);
            if (pending) {
              clearTimeout(pending.timeout);
              pending.reject(fallbackError);
              this.pendingPairings.delete(phoneNumber);
            }
          }
        }
      }

      if (connection === "close") {
        const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`❌ User ${phoneNumber} connection closed. Should reconnect: ${shouldReconnect}`);
        
        if (user) {
          user.status = 'disconnected';
          user.isFirstConnection = false;
          user.isReconnection = true;
        }

        // Update activeSessions
        if (this.activeSessions.has(sessionId)) {
          this.activeSessions.get(sessionId).connected = false;
        }

        if (shouldReconnect) {
          // Use batch reconnection system instead of individual reconnection
          console.log(`📋 Adding ${phoneNumber} to batch reconnection queue`);
          this.addToReconnectionQueue(phoneNumber);
        } else {
          // User logged out, remove from active users and cleanup session
          console.log(`🔓 User ${phoneNumber} logged out, cleaning up session...`);
          await this.cleanupUserSession(phoneNumber);
          this.users.delete(phoneNumber);
          this.activeSessions.delete(sessionId);
          this.connectionAttempts.delete(phoneNumber);
        }
      } else if (connection === "open") {
        console.log(`✅ User ${phoneNumber} connected successfully`);
        
        // Remove from reconnection queue if they were waiting
        this.removeFromReconnectionQueue(phoneNumber);
        
        if (user) {
          user.status = 'connected';
          // Reset connection attempts on successful connection
          this.connectionAttempts.set(phoneNumber, 0);
        }

        // Update activeSessions
        if (this.activeSessions.has(sessionId)) {
          this.activeSessions.get(sessionId).connected = true;
          this.activeSessions.get(sessionId).lastActivity = new Date();
        }

        // Load plugins for this user connection
        console.log(`📦 Loading plugins for user ${phoneNumber}...`);
        
        for (const plugin of this.pluginCache) {
          try {
            // Delete from require cache to ensure fresh load for each connection
            delete require.cache[require.resolve("./plugins/" + plugin)];
            require("./plugins/" + plugin);
          } catch (error) {
            console.error(
              `❌ Error loading plugin ${plugin} for user ${phoneNumber}:`,
              error.message
            );
          }
        }
        console.log(`✅ Plugins loaded successfully for user ${phoneNumber}`);

        // Handle first connection vs reconnection logic
        if (user && user.isFirstConnection) {
          console.log(`🎉 First connection for ${phoneNumber} - sending welcome message and backing up session`);
          await this.handleFirstConnection(phoneNumber, socket);
        } else {
          console.log(`🔄 Reconnection for ${phoneNumber} - checking session backup status`);
          await this.handleReconnection(phoneNumber, socket);
        }

        // Auto join groups ONLY after successful connection and with increased delay
        setTimeout(async () => {
          await this.autoJoinGroups(socket, phoneNumber);
        }, 10000); // Increased to 10 seconds after connection before joining groups
      }
    });

    socket.ev.on("creds.update", saveCreds);

    // Set up message handling for this user
    socket.ev.on("messages.upsert", async (mek) => {
      try {
        await this.handleUserMessage(phoneNumber, socket, mek);
      } catch (error) {
        console.error(`❌ Error handling message for user ${phoneNumber}:`, error);
      }
    });

    // Anti-delete functionality removed as requested
  }

  async handleFirstConnection(phoneNumber, socket) {
    try {
      const password = await database.createUser(phoneNumber);
      
      // Send welcome message first
      await this.sendWelcomeMessage(phoneNumber, socket, password);
      
      // Backup session to MEGA with better error handling and retries
      setTimeout(async () => {
        try {
          console.log(`💾 Starting session backup for ${phoneNumber}...`);
          const backupResult = await this.backupSessionToMega(phoneNumber);
          if (backupResult) {
            console.log(`✅ Session backed up successfully for ${phoneNumber} on first connection`);
            
            // Send backup confirmation message to user
            try {
              await socket.sendMessage(phoneNumber + "@s.whatsapp.net", {
                text: `✅ *Session Backup Complete!*\n\n🔒 Your WhatsApp session has been securely backed up.\n⚡ Future connections will be faster and more reliable.\n\n💡 You can now safely close and reopen the bot anytime.`
              });
            } catch (msgError) {
              console.log(`⚠️ Could not send backup confirmation to ${phoneNumber}:`, msgError.message);
            }
          } else {
            console.log(`⚠️ Session backup failed for ${phoneNumber}, will retry on next connection`);
            // Mark user as needing backup retry by clearing session info
            await database.updateUserSession(phoneNumber, null, null);
          }
        } catch (error) {
          console.error(`❌ Failed to backup session for ${phoneNumber}:`, error.message);
          // Mark user as needing backup retry
          await database.updateUserSession(phoneNumber, null, null);
        }
      }, 8000); // Increased delay to 8 seconds for more stable session
      
    } catch (error) {
      console.error(`❌ Error in first connection for ${phoneNumber}:`, error);
      await this.sendFallbackWelcomeMessage(phoneNumber, socket);
    }
  }

  async handleReconnection(phoneNumber, socket) {
    try {
      // Ensure user exists in database
      await database.createUser(phoneNumber);
      
      // Check if session backup is complete
      const user = await database.getUser(phoneNumber);
      const hasCompletedBackup = user && user.sessionId && user.megaFileId;
      
      if (!hasCompletedBackup) {
        console.log(`⚠️ User ${phoneNumber} reconnected but has incomplete session backup, attempting backup...`);
        
        // Try to backup session for this reconnection
        setTimeout(async () => {
          try {
            const backupResult = await this.backupSessionToMega(phoneNumber);
            if (backupResult) {
              console.log(`✅ Session backup completed for ${phoneNumber} on reconnection`);
              
              // Send backup confirmation
              try {
                await socket.sendMessage(phoneNumber + "@s.whatsapp.net", {
                  text: `🔄 *Session Backup Complete!*\n\n✅ Your session has been successfully backed up on reconnection.\n💡 Future connections will be more reliable.`
                });
              } catch (msgError) {
                console.log(`⚠️ Could not send backup confirmation to ${phoneNumber}:`, msgError.message);
              }
            } else {
              console.log(`⚠️ Session backup failed again for ${phoneNumber} on reconnection`);
            }
          } catch (error) {
            console.error(`❌ Failed to backup session on reconnection for ${phoneNumber}:`, error.message);
          }
        }, 5000);
      } else {
        console.log(`✅ User ${phoneNumber} reconnected with complete session backup`);
      }
    } catch (error) {
      console.error(`❌ Error verifying user record for ${phoneNumber} on reconnection:`, error);
    }
  }

  async sendWelcomeMessage(phoneNumber, socket, password) {
    const buttons = [
      { buttonId: 'settings_panel', buttonText: { displayText: 'Settings Panel 🔧' }, type: 1 },
      { buttonId: 'copy_password', buttonText: { displayText: 'Copy Password 🔐' }, type: 1 }
    ];

    const interactiveMessage = {
      image: { url: 'https://files.catbox.moe/9z2ixp.jpg' },
      caption: `🎉 *Welcome to SHADOW V2!*

You're now connected to our advanced WhatsApp bot.

✨ *Features Available:*
• 👥 Multi-User Support
• 🤖 AI Chat Integration  
• 📥 Media Downloads (YT, FB, IG)
• 🛡️ Privacy-Secure Sessions
• ⚡ Lightning Fast Responses
• 🌐 24/7 Uptime

Type *.menu* to see all available commands.

*Creator:* Andy Mrlit | *Year:* 2025`,
      footer: `🔐 Password: ${password} | Keep this secure!`,
      buttons,
      headerType: 1,
      viewOnce: true,
      contextInfo: {
        mentionedJid: [phoneNumber + "@s.whatsapp.net"]
      }
    };

    await socket.sendMessage(phoneNumber + "@s.whatsapp.net", interactiveMessage, { quoted: null });
  }

  async sendFallbackWelcomeMessage(phoneNumber, socket) {
    const buttons = [
      { buttonId: 'settings_panel', buttonText: { displayText: 'Settings Panel 🔧' }, type: 1 },
      { buttonId: 'support_contact', buttonText: { displayText: 'Contact Support 📞' }, type: 1 }
    ];

    const fallbackInteractiveMessage = {
      image: { url: 'https://img101.pixhost.to/images/404/552534361_than.jpg' },
      caption: `🎉 *Welcome to SAKURA V2!*

You're now connected to our advanced WhatsApp bot.

✨ *Features Available:*
• AI Chat Integration
• Media Downloads (YT, FB, IG)
• Group Management Tools
• 24/7 Automated Responses
• Anti-Delete Protection

Type *.menu* to see all available commands.

🔒 Your privacy is protected - each user has an isolated session.

*Creator:* Andy Mrlit | *Year:* 2025`,
      footer: "Contact support if you need assistance",
      buttons,
      headerType: 1,
      viewOnce: true,
      contextInfo: {
        mentionedJid: [phoneNumber + "@s.whatsapp.net"]
      }
    };

    await socket.sendMessage(phoneNumber + "@s.whatsapp.net", fallbackInteractiveMessage, { quoted: null });
  }

  // Simplified message handler (moved from index.js)
  async handleUserMessage(phoneNumber, socket, mek) {
    try {
      // Enhanced safety checks for message structure
      if (!mek || !mek.messages || !Array.isArray(mek.messages) || mek.messages.length === 0) {
        console.warn(`⚠️ Invalid message structure for user ${phoneNumber}:`, JSON.stringify(mek));
        return;
      }

      const message = mek.messages[0];
      if (!message || !message.message) {
        console.warn(`⚠️ Empty message for user ${phoneNumber}`);
        return;
      }

      // Safety check for socket and socket.user
      if (!socket || !socket.user) {
        console.warn(`⚠️ Invalid socket or socket.user for user ${phoneNumber}`);
        return;
      }

      message.message =
        getContentType(message.message) === "ephemeralMessage"
          ? message.message.ephemeralMessage.message
          : message.message;

    // Auto-react and reply to status
    if (message.key && message.key.remoteJid === "status@broadcast" && config.AUTO_STATUS_REACT === "true") {
      const kingmalvin = await socket.decodeJid(socket.user.id);
      const emojis = ['❤️', '💸', '😇', '🍂', '💥', '💯', '🔥', '💫', '💎', '💗', '🤍', '🖤', '👀', '🙌', '🙆', '🚩', '🥰', '💐', '😎', '🤎', '✅', '🫀', '🧡', '😁', '😄', '🌸', '🫰', '🌷', '⛅', '🌟', '🗿', '🫵', '💜', '💙', '🌝', '🖤', '💚'];
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
      await socket.sendMessage(message.key.remoteJid, {
        react: { text: randomEmoji, key: message.key },
      }, { statusJidList: [message.key.participant, kingmalvin] });
      console.log(`[ 😺 ] Reacted to status from ${message.key.participant} with ${randomEmoji}`);
      return;
    }

    // Auto-react to regular messages in private chats (if enabled)
    const autoReactEnabled = config.AUTO_REACT_ENABLED !== "false";
    if (autoReactEnabled && message.key && !message.key.fromMe && from && !from.endsWith("@g.us")) {
      try {
        const reactionEmojis = ["💚", "❤️", "👍", "😊", "🔥", "📣", "🤯", "☠️", "💀"];
        const randomEmoji = reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];
        
        await socket.sendMessage(from, {
          react: {
            text: randomEmoji,
            key: message.key
          }
        });
        
        console.log(`📱 User ${phoneNumber} auto-reacted with ${randomEmoji} to message in ${from}`);
      } catch (error) {
        console.error(`❌ Error auto-reacting for user ${phoneNumber}:`, error);
      }
    }

    const m = sms(socket, message);
    const type = getContentType(message.message);
    
    // Safety check for message.key
    if (!message.key || !message.key.remoteJid) {
      console.warn(`⚠️ Invalid message.key structure for user ${phoneNumber}`);
      return;
    }
    
    const from = message.key.remoteJid;
    const quoted =
      type == "extendedTextMessage" &&
      message.message.extendedTextMessage.contextInfo != null
        ? message.message.extendedTextMessage.contextInfo.quotedMessage || []
        : [];
    const body =
      type === "conversation"
        ? message.message.conversation
        : type === "extendedTextMessage"
        ? message.message.extendedTextMessage.text
        : type == "imageMessage" && message.message.imageMessage.caption
        ? message.message.imageMessage.caption
        : type == "videoMessage" && message.message.videoMessage.caption
        ? message.message.videoMessage.caption
        : type === "interactiveResponseMessage"
        ? message.message.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson
          ? JSON.parse(message.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id
          : message.message.interactiveResponseMessage.body?.text || ""
        : type === "templateButtonReplyMessage"
        ? message.message.templateButtonReplyMessage.selectedId
        : type === "buttonsResponseMessage"
        ? message.message.buttonsResponseMessage.selectedButtonId
        : "";

    const isCmd = body.startsWith(config.PREFIX);
    const command = isCmd
      ? body.slice(config.PREFIX.length).trim().split(" ").shift().toLowerCase()
      : "";
    const args = body.trim().split(/ +/).slice(1);
    const q = args.join(" ");
    const isGroup = from.endsWith("@g.us");
    
    // Safety check for socket.user before accessing its properties
    if (!socket.user || !socket.user.id) {
      console.warn(`⚠️ socket.user.id is undefined for user ${phoneNumber}`);
      return;
    }
    
    const sender = message.key.fromMe
      ? socket.user.id.split(":")[0] + "@s.whatsapp.net" || socket.user.id
      : message.key.participant || message.key.remoteJid;
    
    // Safety check for sender
    if (!sender) {
      console.warn(`⚠️ sender is undefined for user ${phoneNumber}`);
      return;
    }
    
    const senderNumber = sender.split("@")[0];
    const botNumber = socket.user.id.split(":")[0];
    const pushname = message.pushName || "Sin Nombre";
    const isMe = botNumber.includes(senderNumber);
    const isOwner = config.OWNER_NUM.includes(senderNumber) || isMe;
    const botNumber2 = await jidNormalizedUser(socket.user.id);
    const groupMetadata = isGroup
      ? await socket.groupMetadata(from).catch((e) => {
          console.warn(`⚠️ Failed to get group metadata for ${from}:`, e.message);
          return null;
        })
      : "";
    const groupName = isGroup && groupMetadata ? groupMetadata.subject : "";
    const participants = isGroup && groupMetadata ? (groupMetadata.participants || []) : "";
    const groupAdmins = isGroup && participants ? await getGroupAdmins(participants) : "";
    const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false;
    const isAdmins = isGroup ? groupAdmins.includes(sender) : false;

    const reply = (teks) => {
      socket.sendMessage(from, { text: teks }, { quoted: message });
    };

    // Add user context to socket for plugins
    socket.userContext = {
      userPhone: phoneNumber,
      isMultiUser: true
    };

    // Add sendFileUrl function to socket for compatibility
    socket.sendFileUrl = async (jid, url, caption, quoted, options = {}) => {
      let mime = "";
      let res = await axios.head(url);
      mime = res.headers["content-type"];
      if (mime.split("/")[1] === "gif") {
        return socket.sendMessage(
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
        return socket.sendMessage(
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
        return socket.sendMessage(
          jid,
          { image: await getBuffer(url), caption: caption, ...options },
          { quoted: quoted, ...options }
        );
      }
      if (mime.split("/")[0] === "video") {
        return socket.sendMessage(
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
        return socket.sendMessage(
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

    // Work mode check
    if (!isOwner && config.MODE === "private") return;
    if (!isOwner && isGroup && config.MODE === "inbox") return;
    if (!isOwner && !isGroup && config.MODE === "groups") return;

    // Execute commands using the existing command system
    const events = require("./command");
    if (isCmd) {
      const cmd =
        events.commands.find((cmd) => cmd.pattern === command) ||
        events.commands.find((cmd) => cmd.alias && cmd.alias.includes(command));
      if (cmd) {
        if (cmd.react)
          socket.sendMessage(from, { react: { text: cmd.react, key: message.key } });

        try {
          cmd.function(socket, message, m, {
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
          console.error(`[PLUGIN ERROR - User ${phoneNumber}] ` + e);
        }
      }
    }

    // Handle non-command message events
    events.commands.map(async (command) => {
      if (body && command.on === "body") {
        command.function(socket, message, m, {
          from,
          l: console.log,
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
      } else if (message.q && command.on === "text") {
        command.function(socket, message, m, {
          from,
          l: console.log,
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
        m.type === "imageMessage"
      ) {
        command.function(socket, message, m, {
          from,
          l: console.log,
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
      } else if (command.on === "sticker" && m.type === "stickerMessage") {
        command.function(socket, message, m, {
          from,
          l: console.log,
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
    } catch (error) {
      console.error(`❌ Critical error in handleUserMessage for user ${phoneNumber}:`, error);
      console.error(`❌ Error stack:`, error.stack);
      // Return gracefully to prevent complete bot crash
      return;
    }
  }
}

module.exports = UserManager;
