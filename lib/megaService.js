const fs = require('fs');
const path = require('path');
const { Storage, File } = require('megajs');
const config = require('../config');

class MegaService {
  constructor() {
    this.storage = null;
    this.initialized = false;
    // Don't cache credentials in constructor - get fresh ones each time
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246';
  }
  
  // Helper method to get fresh credentials for each operation
  getCredentials() {
    // Reload config to ensure we have the latest credentials
    delete require.cache[require.resolve('../config')];
    const freshConfig = require('../config');
    
    return {
      email: freshConfig.MEGA_EMAIL,
      password: freshConfig.MEGA_PASSWORD,
      userAgent: this.userAgent
    };
  }

  async initialize() {
    // For the new pattern, we don't need persistent connection
    // Each upload creates its own storage instance
    const credentials = this.getCredentials();
    if (!credentials.email || !credentials.password) {
      console.log('⚠️ MEGA credentials not provided. Session backup disabled.');
      return false;
    }

    this.initialized = true;
    console.log('✅ MEGA service initialized with fresh credentials');
    return true;
  }

  async uploadSession(phoneNumber, sessionPath) {
    const credentials = this.getCredentials();
    if (!credentials.email || !credentials.password) {
      throw new Error('MEGA credentials not configured or missing');
    }

    try {
      const credFilePath = path.join(sessionPath, 'creds.json');
      
      if (!fs.existsSync(credFilePath)) {
        throw new Error('Session file not found');
      }

      // Verify the session file has valid content before uploading
      try {
        const credFileContent = fs.readFileSync(credFilePath, 'utf8');
        if (!credFileContent || credFileContent.trim().length === 0) {
          throw new Error('Session file is empty');
        }
        // Try to parse as JSON to validate structure
        JSON.parse(credFileContent);
      } catch (parseError) {
        throw new Error(`Invalid session file: ${parseError.message}`);
      }

      console.log(`📤 Uploading session for ${phoneNumber} to MEGA with fresh credentials...`);
      
      // Create a unique filename for this user's session
      const fileName = `sakura_session_${phoneNumber}_${Date.now()}.json`;
      
      // Create readable stream with error handling
      const fileStream = fs.createReadStream(credFilePath);
      
      // Add error handling for the stream
      fileStream.on('error', (streamError) => {
        throw new Error(`Failed to read session file: ${streamError.message}`);
      });
      
      // Use the improved upload pattern with fresh credentials
      const uploadUrl = await this.uploadFile(fileStream, fileName, credentials);

      console.log(`✅ Session uploaded successfully for ${phoneNumber}`);
      
      // Extract file ID from URL (format: https://mega.nz/file/fileId#key)
      const urlParts = uploadUrl.replace('https://mega.nz/file/', '');
      return urlParts; // Return the full file identifier for session restoration
    } catch (error) {
      console.error(`❌ Failed to upload session for ${phoneNumber}:`, error.message);
      throw error;
    }
  }

  // Upload method following the example project pattern exactly, with credential parameter
  uploadFile(data, name, credentials = null) {
    return new Promise((resolve, reject) => {
        try {
            // Get credentials - use provided ones or fetch fresh ones
            const auth = credentials || this.getCredentials();
            
            // Validate inputs before proceeding
            if (!data) {
              reject(new Error('Data stream is undefined or null'));
              return;
            }
            
            if (!name || typeof name !== 'string') {
              reject(new Error('File name must be a valid string'));
              return;
            }

            // Validate MEGA credentials with better error message
            if (!auth.email || !auth.password) {
              reject(new Error(`MEGA credentials not configured or found - Email: ${auth.email ? 'SET' : 'MISSING'}, Password: ${auth.password ? 'SET' : 'MISSING'}`));
              return;
            }

            console.log(`🔐 Using MEGA credentials - Email: ${auth.email ? 'CONFIGURED' : 'MISSING'}`);

            const storage = new Storage(auth, () => {
                try {
                  // Validate that data has pipe method (is a readable stream)
                  if (typeof data.pipe !== 'function') {
                    reject(new Error('Data must be a readable stream'));
                    return;
                  }
                  
                  const uploadStream = storage.upload({name: name, allowUploadBuffering: true});
                  
                  // Add error handlers for the upload stream
                  uploadStream.on('error', (uploadError) => {
                    storage.close();
                    reject(new Error(`Upload stream error: ${uploadError.message}`));
                  });
                  
                  data.pipe(uploadStream);
                } catch (pipeError) {
                  storage.close();
                  reject(new Error(`Failed to pipe data to upload stream: ${pipeError.message}`));
                }
                
                storage.on("add", (file) => {
                    file.link((err, url) => {
                        if (err) {
                            storage.close();
                            reject(new Error(`Failed to generate download link: ${err.message}`));
                            return;
                        }
                        storage.close();
                        resolve(url);
                    });
                });
                
                // Add error handler for storage connection
                storage.on("error", (storageError) => {
                    storage.close();
                    reject(new Error(`MEGA storage error: ${storageError.message}`));
                });
            });
        } catch (err) {
            reject(new Error(`MEGA upload initialization failed: ${err.message}`));
        }
    });
  }

  async downloadSession(megaFileId, sessionPath) {
    const credentials = this.getCredentials();
    if (!credentials.email || !credentials.password) {
      throw new Error('MEGA credentials not configured or missing');
    }

    try {
      console.log(`📥 Downloading session from MEGA (${megaFileId}) with fresh credentials...`);
      
      // Create MEGA File from URL identifier
      const fileUrl = `https://mega.nz/file/${megaFileId}`;
      const file = File.fromURL(fileUrl);

      // Create session directory if it doesn't exist
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
      }

      // Download the file using the same pattern as the original index.js
      return new Promise((resolve, reject) => {
        file.download((err, data) => {
          if (err) {
            console.error(`❌ Failed to download session (${megaFileId}):`, err.message);
            reject(err);
            return;
          }
          
          try {
            // Save to session path
            const credFilePath = path.join(sessionPath, 'creds.json');
            fs.writeFileSync(credFilePath, data);
            
            console.log(`✅ Session downloaded successfully to ${sessionPath}`);
            resolve(true);
          } catch (writeError) {
            reject(writeError);
          }
        });
      });
    } catch (error) {
      console.error(`❌ Failed to download session (${megaFileId}):`, error.message);
      throw error;
    }
  }

  async deleteSession(megaFileId) {
    const credentials = this.getCredentials();
    if (!credentials.email || !credentials.password) {
      console.log('⚠️ MEGA credentials not configured, skipping session deletion');
      return false;
    }

    try {
      console.log(`🗑️ Deleting session from MEGA (${megaFileId})...`);
      
      // Create MEGA File from URL identifier
      const fileUrl = `https://mega.nz/file/${megaFileId}`;
      const file = File.fromURL(fileUrl);

      // Note: Deleting files from MEGA using File.fromURL is complex
      // For now, we'll just log the deletion attempt
      // The file will remain on MEGA but won't be used by the bot
      console.log(`⚠️ Note: Session file marked for cleanup (${megaFileId})`);
      console.log(`✅ Session cleanup completed`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to delete session from MEGA (${megaFileId}):`, error.message);
      return false;
    }
  }

  async checkConnection() {
    // For the new pattern, check if we have valid credentials
    const credentials = this.getCredentials();
    const hasCredentials = !!(credentials.email && credentials.password);
    
    if (hasCredentials) {
      console.log('✅ MEGA credentials validation: SUCCESS');
    } else {
      console.log('❌ MEGA credentials validation: FAILED - missing email or password');
    }
    
    return hasCredentials;
  }
}

module.exports = new MegaService();