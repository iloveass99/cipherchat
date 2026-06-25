/**
 * CipherChat — Conversations API (Phase 2)
 * GET /api/conversations?userId=xxx — Get all conversations (1-on-1 + groups)
 * POST /api/conversations — Create/get conversation between two users
 */

import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

function getDB() {
  if (global.__db) return global.__db;
  const Database = require('better-sqlite3');
  const path = require('path');
  const fs = require('fs');
  const dbPath = path.join(process.cwd(), 'data', 'cipherchat.db');
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  global.__db = db;
  return db;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const db = getDB();

    // ---- 1-on-1 conversations ----
    const directConversations = db.prepare(`
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
      WHERE (c.participant_1 = ? OR c.participant_2 = ?) AND c.is_group = 0
      ORDER BY COALESCE(m.timestamp, c.created_at) DESC
    `).all(userId, userId, userId, userId, userId);

    const parsedDirect = directConversations.map(c => ({
      ...c,
      other_public_key: c.other_public_key ? JSON.parse(c.other_public_key) : null,
    }));

    // ---- Group conversations ----
    const groupConversations = db.prepare(`
      SELECT 
        c.id, c.is_group, c.group_name, c.group_admin, c.created_at,
        m.encrypted_content as last_message_content,
        m.iv as last_message_iv,
        m.sender_id as last_message_sender,
        m.timestamp as last_message_time,
        su.username as last_message_sender_name,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND is_read = 0) as unread_count,
        (SELECT COUNT(*) FROM group_members WHERE conversation_id = c.id) as member_count
      FROM conversations c
      JOIN group_members gm ON gm.conversation_id = c.id AND gm.user_id = ?
      LEFT JOIN messages m ON m.id = (
        SELECT id FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1
      )
      LEFT JOIN users su ON su.id = m.sender_id
      WHERE c.is_group = 1
      ORDER BY COALESCE(m.timestamp, c.created_at) DESC
    `).all(userId, userId);

    // For each group, get member list with public keys
    const groupsWithMembers = groupConversations.map(g => {
      const members = db.prepare(
        `SELECT u.id, u.username, u.public_key, gm.role
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         WHERE gm.conversation_id = ?`
      ).all(g.id);

      return {
        ...g,
        members: members.map(m => ({
          ...m,
          public_key: m.public_key ? JSON.parse(m.public_key) : null,
        })),
      };
    });

    // Combine and sort by last_message_time
    const allConversations = [...parsedDirect, ...groupsWithMembers].sort((a, b) => {
      const timeA = a.last_message_time || a.created_at || 0;
      const timeB = b.last_message_time || b.created_at || 0;
      return timeB - timeA;
    });

    return NextResponse.json(allConversations);
  } catch (error) {
    console.error('Conversations GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { userId, otherUserId } = await request.json();

    if (!userId || !otherUserId) {
      return NextResponse.json(
        { error: 'userId and otherUserId are required' },
        { status: 400 }
      );
    }

    const db = getDB();
    const [p1, p2] = [userId, otherUserId].sort();

    // Check if conversation exists
    let conv = db.prepare(
      'SELECT * FROM conversations WHERE participant_1 = ? AND participant_2 = ? AND is_group = 0'
    ).get(p1, p2);

    if (!conv) {
      const id = uuidv4();
      db.prepare(
        'INSERT INTO conversations (id, participant_1, participant_2, is_group) VALUES (?, ?, ?, 0)'
      ).run(id, p1, p2);
      conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);

      // Notify via socket
      if (global.__io) {
        global.__io.emit('conversation:new', { conversationId: id, participants: [p1, p2] });
      }
    }

    // Get other user info
    const otherUser = db.prepare(
      'SELECT id, username, public_key FROM users WHERE id = ?'
    ).get(otherUserId);

    return NextResponse.json({
      ...conv,
      other_user_id: otherUserId,
      other_username: otherUser?.username,
      other_public_key: otherUser ? JSON.parse(otherUser.public_key) : null,
      unread_count: 0,
    });
  } catch (error) {
    console.error('Conversations POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
