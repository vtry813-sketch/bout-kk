const { Pool } = require('pg');
const crypto = require('crypto');

class Database {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/sakura_bot',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    this.initDatabase();
  }

  async initDatabase() {
    try {
      const client = await this.pool.connect();
      
      // Create users table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          phone_number VARCHAR(20) UNIQUE NOT NULL,
          password VARCHAR(8) NOT NULL,
          session_id VARCHAR(16) UNIQUE,
          mega_file_id VARCHAR(255),
          auto_read_status BOOLEAN DEFAULT true,
          auto_react_status BOOLEAN DEFAULT false,
          auto_status_like BOOLEAN DEFAULT true,
          -- auto_recording BOOLEAN DEFAULT true, -- REMOVED: Auto recording feature disabled
          anti_delete BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create comments table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS comments (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          comment TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Check if we need to migrate existing table schema
      await this.migrateSchema(client);

      console.log('✅ Database initialized successfully');
      client.release();
    } catch (error) {
      console.error('❌ Database initialization error:', error);
      // Fallback to in-memory storage if PostgreSQL is not available
      this.fallbackMode = true;
      this.memoryStorage = new Map();
      console.log('⚠️ Using in-memory storage as fallback');
    }
  }

  async migrateSchema(client) {
    try {
      // Check if session_id column exists
      const sessionIdCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'session_id'
      `);

      if (sessionIdCheck.rows.length === 0) {
        console.log('🔄 Adding session_id column to users table...');
        await client.query(`
          ALTER TABLE users 
          ADD COLUMN session_id VARCHAR(16) UNIQUE
        `);
        console.log('✅ Added session_id column');
      }

      // Check if mega_file_id column exists
      const megaFileIdCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'mega_file_id'
      `);

      if (megaFileIdCheck.rows.length === 0) {
        console.log('🔄 Adding mega_file_id column to users table...');
        await client.query(`
          ALTER TABLE users 
          ADD COLUMN mega_file_id VARCHAR(255)
        `);
        console.log('✅ Added mega_file_id column');
      }

      // Check if auto settings columns exist
      const autoSettingsColumns = [
        'auto_read_status',
        'auto_react_status', 
        'auto_status_like',
        // 'auto_recording', // REMOVED: Auto recording feature disabled
        'anti_delete'
      ];

      for (const columnName of autoSettingsColumns) {
        const columnCheck = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = $1
        `, [columnName]);

        if (columnCheck.rows.length === 0) {
          console.log(`🔄 Adding ${columnName} column to users table...`);
          await client.query(`
            ALTER TABLE users 
            ADD COLUMN ${columnName} BOOLEAN DEFAULT true
          `);
          console.log(`✅ Added ${columnName} column`);
        }
      }

      // Check if timestamp columns exist
      const timestampColumns = ['created_at', 'updated_at'];
      for (const columnName of timestampColumns) {
        const columnCheck = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = $1
        `, [columnName]);

        if (columnCheck.rows.length === 0) {
          console.log(`🔄 Adding ${columnName} column to users table...`);
          await client.query(`
            ALTER TABLE users 
            ADD COLUMN ${columnName} TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          `);
          console.log(`✅ Added ${columnName} column`);
        }
      }

      console.log('✅ Database schema migration completed');
    } catch (error) {
      console.error('❌ Schema migration error:', error);
      // Don't throw here - let the app continue with what we have
    }
  }

  generateSessionId() {
    // Generate 16-character alphanumeric session ID
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let sessionId = '';
    for (let i = 0; i < 16; i++) {
      sessionId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return sessionId;
  }

  generatePassword() {
    // Generate 8-character alphanumeric password
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  async createUser(phoneNumber) {
    if (this.fallbackMode) {
      // Check if user already exists in memory
      const existingUser = this.memoryStorage.get(phoneNumber);
      if (existingUser) {
        console.log(`✅ User ${phoneNumber} already exists, returning existing password`);
        return existingUser.password;
      }
      
      // Create new user in memory
      const password = this.generatePassword();
      this.memoryStorage.set(phoneNumber, {
        phoneNumber,
        password,
        sessionId: null,
        megaFileId: null,
        autoReadStatus: true,
        autoReactStatus: false,
        autoStatusLike: true,
        autoRecording: true,
        antiDelete: true,
        createdAt: new Date()
      });
      console.log(`✅ Created new user ${phoneNumber} with unique password`);
      return password;
    }

    try {
      const client = await this.pool.connect();
      
      // First check if user already exists
      const existingUser = await client.query(`
        SELECT password FROM users WHERE phone_number = $1
      `, [phoneNumber]);
      
      if (existingUser.rows.length > 0) {
        // User exists, return existing password
        const existingPassword = existingUser.rows[0].password;
        console.log(`✅ User ${phoneNumber} already exists, returning existing password`);
        
        // Update timestamp but keep the same password
        await client.query(`
          UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE phone_number = $1
        `, [phoneNumber]);
        
        client.release();
        return existingPassword;
      }
      
      // User doesn't exist, create new one with new password
      const password = this.generatePassword();
      await client.query(`
        INSERT INTO users (phone_number, password) 
        VALUES ($1, $2)
      `, [phoneNumber, password]);
      
      console.log(`✅ Created new user ${phoneNumber} with unique password`);
      client.release();
      return password;
    } catch (error) {
      console.error('❌ Error creating user:', error);
      // Fall back to memory storage if database fails
      this.fallbackMode = true;
      this.memoryStorage = this.memoryStorage || new Map();
      
      // Check if user exists in memory fallback
      const existingUser = this.memoryStorage.get(phoneNumber);
      if (existingUser) {
        return existingUser.password;
      }
      
      // Create new user in memory fallback
      const password = this.generatePassword();
      this.memoryStorage.set(phoneNumber, {
        phoneNumber,
        password,
        sessionId: null,
        megaFileId: null,
        autoReadStatus: true,
        autoReactStatus: false,
        autoStatusLike: true,
        autoRecording: true,
        antiDelete: true,
        createdAt: new Date()
      });
      return password;
    }
  }

  async getUser(phoneNumber) {
    if (this.fallbackMode) {
      return this.memoryStorage.get(phoneNumber) || null;
    }

    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        SELECT * FROM users WHERE phone_number = $1
      `, [phoneNumber]);
      
      client.release();
      
      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      return {
        phoneNumber: user.phone_number,
        password: user.password,
        sessionId: user.session_id,
        megaFileId: user.mega_file_id,
        autoReadStatus: user.auto_read_status,
        autoReactStatus: user.auto_react_status,
        autoStatusLike: user.auto_status_like,
        // autoRecording: user.auto_recording, // REMOVED: Auto recording feature disabled
        antiDelete: user.anti_delete,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      };
    } catch (error) {
      console.error('❌ Error getting user:', error);
      return null;
    }
  }

  async verifyPassword(phoneNumber, password) {
    const user = await this.getUser(phoneNumber);
    return user && user.password === password;
  }

  async getUserByPassword(password) {
    if (this.fallbackMode) {
      for (const [phoneNumber, user] of this.memoryStorage) {
        if (user.password === password) {
          return user;
        }
      }
      return null;
    }

    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        SELECT * FROM users WHERE password = $1
      `, [password]);
      
      client.release();
      
      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      return {
        phoneNumber: user.phone_number,
        password: user.password,
        sessionId: user.session_id,
        megaFileId: user.mega_file_id,
        autoReadStatus: user.auto_read_status,
        autoReactStatus: user.auto_react_status,
        autoStatusLike: user.auto_status_like,
        // autoRecording: user.auto_recording, // REMOVED: Auto recording feature disabled
        antiDelete: user.anti_delete,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      };
    } catch (error) {
      console.error('❌ Error getting user by password:', error);
      return null;
    }
  }

  async updateUserSettings(phoneNumber, settings) {
    if (this.fallbackMode) {
      const user = this.memoryStorage.get(phoneNumber);
      if (user) {
        Object.assign(user, settings);
        return true;
      }
      return false;
    }

    try {
      const client = await this.pool.connect();
      
      const setClause = [];
      const values = [phoneNumber];
      let paramIndex = 2;

      if (settings.autoReadStatus !== undefined) {
        setClause.push(`auto_read_status = $${paramIndex++}`);
        values.push(settings.autoReadStatus);
      }
      if (settings.autoReactStatus !== undefined) {
        setClause.push(`auto_react_status = $${paramIndex++}`);
        values.push(settings.autoReactStatus);
      }
      if (settings.autoStatusLike !== undefined) {
        setClause.push(`auto_status_like = $${paramIndex++}`);
        values.push(settings.autoStatusLike);
      }
      // if (settings.autoRecording !== undefined) { // REMOVED: Auto recording feature disabled
      //   setClause.push(`auto_recording = $${paramIndex++}`);
      //   values.push(settings.autoRecording);
      // }
      if (settings.antiDelete !== undefined) {
        setClause.push(`anti_delete = $${paramIndex++}`);
        values.push(settings.antiDelete);
      }

      setClause.push(`updated_at = CURRENT_TIMESTAMP`);

      await client.query(`
        UPDATE users 
        SET ${setClause.join(', ')}
        WHERE phone_number = $1
      `, values);
      
      client.release();
      return true;
    } catch (error) {
      console.error('❌ Error updating user settings:', error);
      // Fall back to memory storage
      this.fallbackMode = true;
      this.memoryStorage = this.memoryStorage || new Map();
      const user = this.memoryStorage.get(phoneNumber);
      if (user) {
        Object.assign(user, settings);
        return true;
      }
      return false;
    }
  }

  async updateUserSession(phoneNumber, sessionId, megaFileId) {
    if (this.fallbackMode) {
      const user = this.memoryStorage.get(phoneNumber);
      if (user) {
        user.sessionId = sessionId;
        user.megaFileId = megaFileId;
        user.updatedAt = new Date();
        return true;
      }
      return false;
    }

    try {
      const client = await this.pool.connect();
      
      // Check if the required columns exist
      const columnsCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name IN ('session_id', 'mega_file_id')
      `);
      
      const existingColumns = columnsCheck.rows.map(row => row.column_name);
      const hasSessionId = existingColumns.includes('session_id');
      const hasMegaFileId = existingColumns.includes('mega_file_id');
      
      if (!hasSessionId || !hasMegaFileId) {
        console.log('⚠️ Session columns not found, cannot update session info');
        client.release();
        return false;
      }
      
      await client.query(`
        UPDATE users 
        SET session_id = $2, mega_file_id = $3, updated_at = CURRENT_TIMESTAMP
        WHERE phone_number = $1
      `, [phoneNumber, sessionId, megaFileId]);
      
      client.release();
      return true;
    } catch (error) {
      console.error('❌ Error updating user session:', error);
      return false;
    }
  }

  async getUserBySessionId(sessionId) {
    if (this.fallbackMode) {
      for (const [phoneNumber, user] of this.memoryStorage) {
        if (user.sessionId === sessionId) {
          return user;
        }
      }
      return null;
    }

    try {
      const client = await this.pool.connect();
      
      // Check if session_id column exists
      const columnCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'session_id'
      `);
      
      if (columnCheck.rows.length === 0) {
        console.log('⚠️ session_id column not found in database');
        client.release();
        return null;
      }
      
      const result = await client.query(`
        SELECT * FROM users WHERE session_id = $1
      `, [sessionId]);
      
      client.release();
      
      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      return {
        phoneNumber: user.phone_number,
        password: user.password,
        sessionId: user.session_id,
        megaFileId: user.mega_file_id,
        autoReadStatus: user.auto_read_status,
        autoReactStatus: user.auto_react_status,
        autoStatusLike: user.auto_status_like,
        // autoRecording: user.auto_recording, // REMOVED: Auto recording feature disabled
        antiDelete: user.anti_delete,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      };
    } catch (error) {
      console.error('❌ Error getting user by session ID:', error);
      return null;
    }
  }

  async getAllUsersWithSessions() {
    if (this.fallbackMode) {
      const users = [];
      for (const [phoneNumber, user] of this.memoryStorage) {
        if (user.sessionId && user.megaFileId) {
          users.push(user);
        }
      }
      return users;
    }

    try {
      const client = await this.pool.connect();
      
      // First check if the required columns exist
      const columnsCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name IN ('session_id', 'mega_file_id')
      `);
      
      const existingColumns = columnsCheck.rows.map(row => row.column_name);
      const hasSessionId = existingColumns.includes('session_id');
      const hasMegaFileId = existingColumns.includes('mega_file_id');
      
      // If columns don't exist, return empty array
      if (!hasSessionId || !hasMegaFileId) {
        console.log('⚠️ Required columns for session backup not found in database');
        client.release();
        return [];
      }
      
      const result = await client.query(`
        SELECT * FROM users WHERE session_id IS NOT NULL AND mega_file_id IS NOT NULL
      `);
      
      client.release();
      
      return result.rows.map(user => ({
        phoneNumber: user.phone_number,
        password: user.password,
        sessionId: user.session_id,
        megaFileId: user.mega_file_id,
        autoReadStatus: user.auto_read_status,
        autoReactStatus: user.auto_react_status,
        autoStatusLike: user.auto_status_like,
        // autoRecording: user.auto_recording, // REMOVED: Auto recording feature disabled
        antiDelete: user.anti_delete,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }));
    } catch (error) {
      console.error('❌ Error getting users with sessions:', error);
      return [];
    }
  }

  async deleteUserSession(phoneNumber) {
    if (this.fallbackMode) {
      const user = this.memoryStorage.get(phoneNumber);
      if (user) {
        delete user.sessionId;
        delete user.megaFileId;
        user.updatedAt = new Date();
        return true;
      }
      return false;
    }

    try {
      const client = await this.pool.connect();
      
      // Check if the required columns exist
      const columnsCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name IN ('session_id', 'mega_file_id')
      `);
      
      const existingColumns = columnsCheck.rows.map(row => row.column_name);
      const hasSessionId = existingColumns.includes('session_id');
      const hasMegaFileId = existingColumns.includes('mega_file_id');
      
      if (!hasSessionId || !hasMegaFileId) {
        console.log('⚠️ Session columns not found, cannot delete session info');
        client.release();
        return false;
      }
      
      await client.query(`
        UPDATE users 
        SET session_id = NULL, mega_file_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE phone_number = $1
      `, [phoneNumber]);
      
      client.release();
      return true;
    } catch (error) {
      console.error('❌ Error deleting user session:', error);
      return false;
    }
  }

  async getUserSettings(phoneNumber) {
    const user = await this.getUser(phoneNumber);
    if (!user) return null;

    return {
      autoReadStatus: user.autoReadStatus,
      autoReactStatus: user.autoReactStatus,
      autoStatusLike: user.autoStatusLike,
      autoRecording: user.autoRecording,
      antiDelete: user.antiDelete
    };
  }

  // Comment system methods
  async createComment(name, comment) {
    if (this.fallbackMode) {
      // For fallback mode, we'll use a simple in-memory array
      if (!this.commentsStorage) {
        this.commentsStorage = [];
      }
      
      const newComment = {
        id: this.commentsStorage.length + 1,
        name: name.trim(),
        comment: comment.trim(),
        createdAt: new Date()
      };
      
      this.commentsStorage.unshift(newComment); // Add to beginning
      console.log(`✅ Created comment by ${name} (fallback mode)`);
      return newComment;
    }

    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        INSERT INTO comments (name, comment) 
        VALUES ($1, $2) 
        RETURNING id, name, comment, created_at
      `, [name.trim(), comment.trim()]);
      
      client.release();
      
      const newComment = result.rows[0];
      console.log(`✅ Created comment by ${name}`);
      
      return {
        id: newComment.id,
        name: newComment.name,
        comment: newComment.comment,
        createdAt: newComment.created_at
      };
    } catch (error) {
      console.error('❌ Error creating comment:', error);
      // Fall back to memory storage
      this.fallbackMode = true;
      this.commentsStorage = this.commentsStorage || [];
      
      const newComment = {
        id: this.commentsStorage.length + 1,
        name: name.trim(),
        comment: comment.trim(),
        createdAt: new Date()
      };
      
      this.commentsStorage.unshift(newComment);
      return newComment;
    }
  }

  async getComments(page = 1, limit = 5) {
    if (this.fallbackMode) {
      const commentsStorage = this.commentsStorage || [];
      const offset = (page - 1) * limit;
      const comments = commentsStorage.slice(offset, offset + limit);
      
      return {
        comments,
        totalComments: commentsStorage.length,
        currentPage: page,
        totalPages: Math.ceil(commentsStorage.length / limit),
        hasNextPage: offset + limit < commentsStorage.length,
        hasPrevPage: page > 1
      };
    }

    try {
      const client = await this.pool.connect();
      
      // Get total count
      const countResult = await client.query('SELECT COUNT(*) FROM comments');
      const totalComments = parseInt(countResult.rows[0].count);
      
      // Get paginated comments
      const offset = (page - 1) * limit;
      const result = await client.query(`
        SELECT id, name, comment, created_at 
        FROM comments 
        ORDER BY created_at DESC 
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      
      client.release();
      
      const comments = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        comment: row.comment,
        createdAt: row.created_at
      }));
      
      const totalPages = Math.ceil(totalComments / limit);
      
      return {
        comments,
        totalComments,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      };
    } catch (error) {
      console.error('❌ Error getting comments:', error);
      // Return empty result
      return {
        comments: [],
        totalComments: 0,
        currentPage: 1,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
      };
    }
  }

  async close() {
    if (!this.fallbackMode) {
      await this.pool.end();
    }
  }
}

module.exports = new Database();