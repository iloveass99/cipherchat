/**
 * CipherChat — Custom Server
 * 
 * Runs Next.js + Socket.io on a single port.
 * The server is a BLIND RELAY — it only sees ciphertext.
 */

import { createServer } from 'http';
import next from 'next';
import { Server } from 'socket.io';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dev = process.env.NODE_ENV !== 'production';
const hostname = dev ? 'localhost' : '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ---- Database Setup ----
const DB_PATH = path.join(__dirname, 'data', 'cipherchat.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize tables
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

console.log('📦 Database initialized');

// Online users tracking: userId -> Set of socketIds
const onlineUsers = new Map();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  // ---- Socket.io Setup ----
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/api/socketio',
  });

  // Store on global so API routes can access
  global.__io = io;
  global.__db = db;
  global.__onlineUsers = onlineUsers;

  // ---- Socket Events ----
  io.on('connection', (socket) => {
    const userId = socket.handshake.auth.userId;
    const username = socket.handshake.auth.username;

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    console.log(`🔌 User connected: ${username} (${userId})`);

    // Track online status
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Broadcast online status
    io.emit('user:online', { userId, username });

    // Send current online users list
    const onlineList = [];
    for (const [uid] of onlineUsers) {
      onlineList.push(uid);
    }
    socket.emit('users:online', onlineList);

    // Join conversation rooms
    try {
      const conversations = db.prepare(
        'SELECT id FROM conversations WHERE participant_1 = ? OR participant_2 = ?'
      ).all(userId, userId);
      
      for (const conv of conversations) {
        socket.join(`conv:${conv.id}`);
      }
    } catch (err) {
      console.error('Error joining rooms:', err);
    }

    // ---- Handle new message ----
    socket.on('message:send', (data) => {
      const { id, conversationId, encryptedContent, iv, expiresAt } = data;

      try {
        db.prepare(
          'INSERT INTO messages (id, conversation_id, sender_id, encrypted_content, iv, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(id, conversationId, userId, encryptedContent, iv, expiresAt || null);

        const message = {
          id,
          conversation_id: conversationId,
          sender_id: userId,
          encrypted_content: encryptedContent,
          iv,
          timestamp: Math.floor(Date.now() / 1000),
          expires_at: expiresAt || null,
          is_read: 0,
        };

        io.to(`conv:${conversationId}`).emit('message:new', message);
      } catch (err) {
        console.error('Error saving message:', err);
        socket.emit('message:error', { id, error: 'Failed to save message' });
      }
    });

    // ---- Typing indicators ----
    socket.on('typing:start', ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit('typing:start', { 
        conversationId, userId, username 
      });
    });

    socket.on('typing:stop', ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit('typing:stop', { 
        conversationId, userId 
      });
    });

    // ---- Read receipts ----
    socket.on('messages:read', ({ conversationId }) => {
      try {
        db.prepare(
          'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0'
        ).run(conversationId, userId);

        socket.to(`conv:${conversationId}`).emit('messages:read', { 
          conversationId, readBy: userId 
        });
      } catch (err) {
        console.error('Error marking messages as read:', err);
      }
    });

    // ---- Join new conversation room ----
    socket.on('conversation:join', ({ conversationId }) => {
      socket.join(`conv:${conversationId}`);
    });

    // ---- Disconnect ----
    socket.on('disconnect', () => {
      console.log(`🔌 User disconnected: ${username} (${userId})`);

      if (onlineUsers.has(userId)) {
        onlineUsers.get(userId).delete(socket.id);
        if (onlineUsers.get(userId).size === 0) {
          onlineUsers.delete(userId);
          io.emit('user:offline', { userId });
        }
      }
    });
  });

  // ---- Disappearing Messages Cleanup (every 30s) ----
  setInterval(() => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const result = db.prepare(
        'DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at <= ?'
      ).run(now);

      if (result.changes > 0) {
        console.log(`🗑️  Cleaned up ${result.changes} expired message(s)`);
        io.emit('messages:expired');
      }
    } catch (err) {
      console.error('Error cleaning expired messages:', err);
    }
  }, 30000);

  // ---- Start Server ----
  httpServer.listen(port, hostname, () => {
    console.log(`\n🔒 CipherChat running at http://${hostname}:${port}`);
    console.log(`   End-to-end encrypted messaging`);
    console.log(`   Server is a blind relay — zero knowledge\n`);
  });
});
