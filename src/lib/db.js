/**
 * CipherChat — SQLite Database Layer
 * 
 * The server only stores encrypted content (ciphertext).
 * It has ZERO knowledge of message contents.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'cipherchat.db');

let db = null;

/**
 * Get the database instance (singleton)
 */
export function getDB() {
  if (!db) {
    // Ensure data directory exists
    const fs = await import('fs');
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

/**
 * Synchronous init for use in the custom server
 */
export function initDB() {
  const fs = require('fs');
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initTables();
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      public_key TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      participant_1 TEXT NOT NULL,
      participant_2 TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (participant_1) REFERENCES users(id),
      FOREIGN KEY (participant_2) REFERENCES users(id),
      UNIQUE(participant_1, participant_2)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      encrypted_content TEXT NOT NULL,
      iv TEXT NOT NULL,
      timestamp INTEGER DEFAULT (unixepoch()),
      expires_at INTEGER DEFAULT NULL,
      is_read INTEGER DEFAULT 0,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id),
      FOREIGN KEY (sender_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation 
      ON messages(conversation_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_expires 
      ON messages(expires_at) WHERE expires_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_conversations_participants
      ON conversations(participant_1, participant_2);
  `);
}

// ---- User Queries ----

export function createUser(id, username, passwordHash, publicKey) {
  const d = db || initDB();
  const stmt = d.prepare(
    'INSERT INTO users (id, username, password_hash, public_key) VALUES (?, ?, ?, ?)'
  );
  return stmt.run(id, username, passwordHash, publicKey);
}

export function getUserByUsername(username) {
  const d = db || initDB();
  return d.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function getUserById(id) {
  const d = db || initDB();
  return d.prepare('SELECT id, username, public_key, created_at FROM users WHERE id = ?').get(id);
}

export function searchUsers(query, excludeUserId) {
  const d = db || initDB();
  return d.prepare(
    'SELECT id, username, public_key FROM users WHERE username LIKE ? AND id != ? LIMIT 20'
  ).all(`%${query}%`, excludeUserId);
}

export function getUserPublicKey(userId) {
  const d = db || initDB();
  const row = d.prepare('SELECT public_key FROM users WHERE id = ?').get(userId);
  return row ? row.public_key : null;
}

// ---- Conversation Queries ----

export function findOrCreateConversation(userId1, userId2) {
  const d = db || initDB();
  // Normalize ordering to prevent duplicates
  const [p1, p2] = [userId1, userId2].sort();
  
  let conv = d.prepare(
    'SELECT * FROM conversations WHERE participant_1 = ? AND participant_2 = ?'
  ).get(p1, p2);

  if (!conv) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    d.prepare(
      'INSERT INTO conversations (id, participant_1, participant_2) VALUES (?, ?, ?)'
    ).run(id, p1, p2);
    conv = d.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  }

  return conv;
}

export function getUserConversations(userId) {
  const d = db || initDB();
  return d.prepare(`
    SELECT 
      c.*,
      CASE WHEN c.participant_1 = ? THEN c.participant_2 ELSE c.participant_1 END as other_user_id,
      u.username as other_username,
      u.public_key as other_public_key,
      m.encrypted_content as last_message_content,
      m.iv as last_message_iv,
      m.sender_id as last_message_sender,
      m.timestamp as last_message_time,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND is_read = 0) as unread_count
    FROM conversations c
    JOIN users u ON u.id = CASE WHEN c.participant_1 = ? THEN c.participant_2 ELSE c.participant_1 END
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1
    )
    WHERE c.participant_1 = ? OR c.participant_2 = ?
    ORDER BY COALESCE(m.timestamp, c.created_at) DESC
  `).all(userId, userId, userId, userId, userId);
}

export function getConversation(conversationId) {
  const d = db || initDB();
  return d.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
}

// ---- Message Queries ----

export function saveMessage(id, conversationId, senderId, encryptedContent, iv, expiresAt = null) {
  const d = db || initDB();
  return d.prepare(
    'INSERT INTO messages (id, conversation_id, sender_id, encrypted_content, iv, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, conversationId, senderId, encryptedContent, iv, expiresAt);
}

export function getMessages(conversationId, limit = 100, beforeTimestamp = null) {
  const d = db || initDB();
  if (beforeTimestamp) {
    return d.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?'
    ).all(conversationId, beforeTimestamp, limit).reverse();
  }
  return d.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ?'
  ).all(conversationId, limit).reverse();
}

export function markMessagesAsRead(conversationId, userId) {
  const d = db || initDB();
  return d.prepare(
    'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0'
  ).run(conversationId, userId);
}

export function deleteMessage(messageId) {
  const d = db || initDB();
  return d.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
}

export function deleteExpiredMessages() {
  const d = db || initDB();
  const now = Math.floor(Date.now() / 1000);
  return d.prepare(
    'DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at <= ?'
  ).run(now);
}
