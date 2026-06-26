/**
 * CipherChat — Custom Server (Phase 2)
 * 
 * Runs Next.js + Socket.io on a single port.
 * The server is a BLIND RELAY — it only sees ciphertext.
 * 
 * Phase 2: Groups, Calls (WebRTC signaling), Enhanced Read Receipts
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
// Use DB_DIR env var for persistent storage (e.g., Railway Volume), fallback to local ./data
const DB_DIR = process.env.DB_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'cipherchat.db');
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
    wrapped_private_key TEXT DEFAULT NULL,
    recovery_key_hash TEXT DEFAULT NULL,
    recovery_wrapped_key TEXT DEFAULT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    participant_1 TEXT,
    participant_2 TEXT,
    is_group INTEGER DEFAULT 0,
    group_name TEXT DEFAULT NULL,
    group_admin TEXT DEFAULT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (participant_1) REFERENCES users(id),
    FOREIGN KEY (participant_2) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_members (
    conversation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    encrypted_content TEXT NOT NULL,
    iv TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',
    timestamp INTEGER DEFAULT (unixepoch()),
    expires_at INTEGER DEFAULT NULL,
    is_read INTEGER DEFAULT 0,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS call_logs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    caller_id TEXT NOT NULL,
    call_type TEXT NOT NULL DEFAULT 'audio',
    status TEXT NOT NULL DEFAULT 'ringing',
    started_at INTEGER DEFAULT (unixepoch()),
    ended_at INTEGER DEFAULT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (caller_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation 
    ON messages(conversation_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_messages_expires 
    ON messages(expires_at) WHERE expires_at IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_conversations_participants
    ON conversations(participant_1, participant_2);
  CREATE INDEX IF NOT EXISTS idx_group_members_user
    ON group_members(user_id);
`);

console.log('📦 Database initialized');

// Migration: add wrapped_private_key column if missing (for existing DBs)
try {
  db.prepare("SELECT wrapped_private_key FROM users LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE users ADD COLUMN wrapped_private_key TEXT DEFAULT NULL");
  console.log('📦 Migration: added wrapped_private_key column');
}

// Migration: add is_group column if missing
try {
  db.prepare("SELECT is_group FROM conversations LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE conversations ADD COLUMN is_group INTEGER DEFAULT 0");
  db.exec("ALTER TABLE conversations ADD COLUMN group_name TEXT DEFAULT NULL");
  db.exec("ALTER TABLE conversations ADD COLUMN group_admin TEXT DEFAULT NULL");
  console.log('📦 Migration: added group columns');
}

// Migration: add recovery columns if missing
try {
  db.prepare("SELECT recovery_key_hash FROM users LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE users ADD COLUMN recovery_key_hash TEXT DEFAULT NULL");
  db.exec("ALTER TABLE users ADD COLUMN recovery_wrapped_key TEXT DEFAULT NULL");
  console.log('📦 Migration: added recovery columns');
}

// Migration: add message_type column if missing
try {
  db.prepare("SELECT message_type FROM messages LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'text'");
  console.log('📦 Migration: added message_type column');
}

const onlineUsers = new Map();
// Active calls tracking: conversationId -> { callId, callerId, callType, participants }
const activeCalls = new Map();

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
    maxHttpBufferSize: 16e6, // 16MB for encrypted file messages
  });

  // Store on global so API routes can access
  global.__io = io;
  global.__db = db;
  global.__onlineUsers = onlineUsers;

  // Helper to get all socket IDs for a user
  function getUserSockets(userId) {
    return onlineUsers.get(userId) || new Set();
  }

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

    // Join conversation rooms (1-on-1 AND groups)
    try {
      const directConvs = db.prepare(
        'SELECT id FROM conversations WHERE (participant_1 = ? OR participant_2 = ?) AND is_group = 0'
      ).all(userId, userId);
      
      const groupConvs = db.prepare(
        'SELECT conversation_id as id FROM group_members WHERE user_id = ?'
      ).all(userId);

      for (const conv of [...directConvs, ...groupConvs]) {
        socket.join(`conv:${conv.id}`);
      }
    } catch (err) {
      console.error('Error joining rooms:', err);
    }

    // ---- Handle new message ----
    socket.on('message:send', (data) => {
      const { id, conversationId, encryptedContent, iv, expiresAt, messageType } = data;

      try {
        db.prepare(
          'INSERT INTO messages (id, conversation_id, sender_id, encrypted_content, iv, message_type, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(id, conversationId, userId, encryptedContent, iv, messageType || 'text', expiresAt || null);

        const message = {
          id,
          conversation_id: conversationId,
          sender_id: userId,
          sender_username: username,
          encrypted_content: encryptedContent,
          iv,
          message_type: messageType || 'text',
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
        const result = db.prepare(
          'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0'
        ).run(conversationId, userId);

        if (result.changes > 0) {
          socket.to(`conv:${conversationId}`).emit('messages:read', { 
            conversationId, readBy: userId, readAt: Math.floor(Date.now() / 1000) 
          });
        }
      } catch (err) {
        console.error('Error marking messages as read:', err);
      }
    });

    // ---- Join new conversation room ----
    socket.on('conversation:join', ({ conversationId }) => {
      socket.join(`conv:${conversationId}`);
    });

    // ========================================
    // ---- WebRTC CALL SIGNALING (Phase 2) ----
    // ========================================

    // Initiate a call
    socket.on('call:initiate', ({ conversationId, callType, callId, targetUserId }) => {
      console.log(`📞 Call initiated: ${username} -> ${targetUserId} (${callType})`);

      // Store active call
      activeCalls.set(conversationId, {
        callId,
        callerId: userId,
        callerUsername: username,
        callType,
        startTime: Date.now(),
      });

      // Log to DB
      try {
        db.prepare(
          'INSERT INTO call_logs (id, conversation_id, caller_id, call_type, status) VALUES (?, ?, ?, ?, ?)'
        ).run(callId, conversationId, userId, callType, 'ringing');
      } catch (err) {
        console.error('Error logging call:', err);
      }

      // Notify the target user on all their sockets
      const targetSockets = getUserSockets(targetUserId);
      for (const sid of targetSockets) {
        io.to(sid).emit('call:incoming', {
          callId,
          conversationId,
          callType,
          callerId: userId,
          callerUsername: username,
        });
      }
    });

    // Accept a call
    socket.on('call:accept', ({ conversationId, callId }) => {
      console.log(`📞 Call accepted: ${username}`);

      const call = activeCalls.get(conversationId);
      if (call) {
        // Update DB
        try {
          db.prepare('UPDATE call_logs SET status = ? WHERE id = ?').run('active', callId);
        } catch (err) {
          console.error('Error updating call log:', err);
        }

        // Notify the caller
        const callerSockets = getUserSockets(call.callerId);
        for (const sid of callerSockets) {
          io.to(sid).emit('call:accepted', {
            callId,
            conversationId,
            acceptedBy: userId,
            acceptedByUsername: username,
          });
        }
      }
    });

    // Reject a call
    socket.on('call:reject', ({ conversationId, callId }) => {
      console.log(`📞 Call rejected: ${username}`);

      const call = activeCalls.get(conversationId);
      if (call) {
        activeCalls.delete(conversationId);

        try {
          db.prepare('UPDATE call_logs SET status = ?, ended_at = unixepoch() WHERE id = ?')
            .run('rejected', callId);
        } catch (err) {
          console.error('Error updating call log:', err);
        }

        const callerSockets = getUserSockets(call.callerId);
        for (const sid of callerSockets) {
          io.to(sid).emit('call:rejected', { callId, conversationId, rejectedBy: userId });
        }
      }
    });

    // End a call
    socket.on('call:end', ({ conversationId, callId }) => {
      console.log(`📞 Call ended: ${username}`);

      activeCalls.delete(conversationId);

      try {
        db.prepare('UPDATE call_logs SET status = ?, ended_at = unixepoch() WHERE id = ?')
          .run('ended', callId);
      } catch (err) {
        console.error('Error updating call log:', err);
      }

      // Notify everyone in the conversation
      socket.to(`conv:${conversationId}`).emit('call:ended', {
        callId,
        conversationId,
        endedBy: userId,
      });
    });

    // WebRTC signaling: relay offer
    socket.on('webrtc:offer', ({ conversationId, offer, targetUserId }) => {
      const targetSockets = getUserSockets(targetUserId);
      for (const sid of targetSockets) {
        io.to(sid).emit('webrtc:offer', {
          conversationId,
          offer,
          fromUserId: userId,
        });
      }
    });

    // WebRTC signaling: relay answer
    socket.on('webrtc:answer', ({ conversationId, answer, targetUserId }) => {
      const targetSockets = getUserSockets(targetUserId);
      for (const sid of targetSockets) {
        io.to(sid).emit('webrtc:answer', {
          conversationId,
          answer,
          fromUserId: userId,
        });
      }
    });

    // WebRTC signaling: relay ICE candidate
    socket.on('webrtc:ice-candidate', ({ conversationId, candidate, targetUserId }) => {
      const targetSockets = getUserSockets(targetUserId);
      for (const sid of targetSockets) {
        io.to(sid).emit('webrtc:ice-candidate', {
          conversationId,
          candidate,
          fromUserId: userId,
        });
      }
    });

    // ========================================
    // ---- GROUP CHAT (Phase 2) ----
    // ========================================

    socket.on('group:create', ({ conversationId }) => {
      socket.join(`conv:${conversationId}`);
    });

    socket.on('group:member-joined', ({ conversationId, memberId }) => {
      // Notify all members of the group
      io.to(`conv:${conversationId}`).emit('group:member-joined', {
        conversationId,
        memberId,
      });

      // Make the new member join the room (if online)
      const memberSockets = getUserSockets(memberId);
      for (const sid of memberSockets) {
        io.sockets.sockets.get(sid)?.join(`conv:${conversationId}`);
      }
    });

    socket.on('group:member-left', ({ conversationId, memberId }) => {
      io.to(`conv:${conversationId}`).emit('group:member-left', {
        conversationId,
        memberId,
      });
    });

    // ---- Disconnect ----
    socket.on('disconnect', () => {
      console.log(`🔌 User disconnected: ${username} (${userId})`);

      if (onlineUsers.has(userId)) {
        onlineUsers.get(userId).delete(socket.id);
        if (onlineUsers.get(userId).size === 0) {
          onlineUsers.delete(userId);
          io.emit('user:offline', { userId });

          // End any active calls this user was in
          for (const [convId, call] of activeCalls) {
            if (call.callerId === userId) {
              activeCalls.delete(convId);
              io.to(`conv:${convId}`).emit('call:ended', {
                callId: call.callId,
                conversationId: convId,
                endedBy: userId,
                reason: 'disconnected',
              });
            }
          }
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
    console.log(`   Audio/Video calling (WebRTC)`);
    console.log(`   Group chat support`);
    console.log(`   Server is a blind relay — zero knowledge\n`);
  });
});
