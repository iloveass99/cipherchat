/**
 * CipherChat — Users API
 * GET /api/users?search=query&userId=currentUserId — Search users
 * GET /api/users?id=userId — Get user's public key
 */

import { NextResponse } from 'next/server';

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
    const db = getDB();

    // Get user by ID (for public key)
    const userId = searchParams.get('id');
    if (userId) {
      const user = db.prepare(
        'SELECT id, username, public_key, display_name, avatar_url, bio FROM users WHERE id = ?'
      ).get(userId);

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      return NextResponse.json({
        id: user.id,
        username: user.username,
        displayName: user.display_name || null,
        avatarUrl: user.avatar_url || null,
        bio: user.bio || null,
        publicKey: JSON.parse(user.public_key),
        online: global.__onlineUsers?.has(user.id) || false,
      });
    }

    // Search users
    const search = searchParams.get('search');
    const currentUserId = searchParams.get('userId');

    if (!search || !currentUserId) {
      return NextResponse.json({ error: 'Missing search or userId parameter' }, { status: 400 });
    }

    const users = db.prepare(`
      SELECT id, username, public_key, display_name, avatar_url, bio 
      FROM users 
      WHERE username LIKE ? AND id != ?
        AND id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
        AND id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)
      LIMIT 20
    `).all(`%${search}%`, currentUserId, currentUserId, currentUserId);

    // Get friend statuses for these users
    const friendStatuses = {};
    for (const u of users) {
      const friendship = db.prepare(
        'SELECT status FROM friends WHERE (requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)'
      ).get(currentUserId, u.id, u.id, currentUserId);
      if (friendship) friendStatuses[u.id] = friendship.status;
    }

    return NextResponse.json(
      users.map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name || null,
        avatarUrl: u.avatar_url || null,
        bio: u.bio || null,
        publicKey: JSON.parse(u.public_key),
        online: global.__onlineUsers?.has(u.id) || false,
        friendStatus: friendStatuses[u.id] || null,
      }))
    );
  } catch (error) {
    console.error('Users API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
