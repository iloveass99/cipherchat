/**
 * CipherChat — Friends API
 * POST /api/friends — Send/accept/reject/remove friend request
 * GET /api/friends?userId=xxx — Get friends list + pending requests
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
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const db = getDB();

    // Get accepted friends
    const friends = db.prepare(`
      SELECT 
        CASE WHEN f.requester_id = ? THEN f.recipient_id ELSE f.requester_id END as friend_id,
        u.username, u.display_name, u.avatar_url, u.bio,
        f.created_at
      FROM friends f
      JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.recipient_id ELSE f.requester_id END
      WHERE (f.requester_id = ? OR f.recipient_id = ?) AND f.status = 'accepted'
      ORDER BY u.username ASC
    `).all(userId, userId, userId, userId);

    // Get pending requests I received
    const pendingReceived = db.prepare(`
      SELECT f.requester_id as from_id, u.username, u.display_name, u.avatar_url, f.created_at
      FROM friends f
      JOIN users u ON u.id = f.requester_id
      WHERE f.recipient_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `).all(userId);

    // Get pending requests I sent
    const pendingSent = db.prepare(`
      SELECT f.recipient_id as to_id, u.username, u.display_name, u.avatar_url, f.created_at
      FROM friends f
      JOIN users u ON u.id = f.recipient_id
      WHERE f.requester_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `).all(userId);

    return NextResponse.json({
      friends: friends.map(f => ({
        id: f.friend_id,
        username: f.username,
        displayName: f.display_name || null,
        avatarUrl: f.avatar_url || null,
        bio: f.bio || null,
        since: f.created_at,
        online: global.__onlineUsers?.has(f.friend_id) || false,
      })),
      pendingReceived: pendingReceived.map(p => ({
        id: p.from_id,
        username: p.username,
        displayName: p.display_name || null,
        avatarUrl: p.avatar_url || null,
        sentAt: p.created_at,
      })),
      pendingSent: pendingSent.map(p => ({
        id: p.to_id,
        username: p.username,
        displayName: p.display_name || null,
        avatarUrl: p.avatar_url || null,
        sentAt: p.created_at,
      })),
    });
  } catch (error) {
    console.error('Friends GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { userId, targetUserId, action } = await request.json();

    if (!userId || !targetUserId) {
      return NextResponse.json({ error: 'userId and targetUserId are required' }, { status: 400 });
    }

    if (userId === targetUserId) {
      return NextResponse.json({ error: 'Cannot add yourself as a friend' }, { status: 400 });
    }

    const db = getDB();

    // Check if blocked
    const blocked = db.prepare(
      'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)'
    ).get(userId, targetUserId, targetUserId, userId);

    if (blocked && action === 'send') {
      return NextResponse.json({ error: 'Cannot send friend request to this user' }, { status: 403 });
    }

    if (action === 'send') {
      // Check if already exists
      const existing = db.prepare(
        'SELECT status FROM friends WHERE (requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)'
      ).get(userId, targetUserId, targetUserId, userId);

      if (existing) {
        if (existing.status === 'accepted') {
          return NextResponse.json({ error: 'Already friends' }, { status: 409 });
        }
        if (existing.status === 'pending') {
          return NextResponse.json({ error: 'Friend request already pending' }, { status: 409 });
        }
      }

      db.prepare(
        'INSERT INTO friends (requester_id, recipient_id, status) VALUES (?, ?, ?)'
      ).run(userId, targetUserId, 'pending');

      // Notify via socket
      if (global.__io) {
        const targetSockets = global.__onlineUsers?.get(targetUserId);
        if (targetSockets) {
          const senderUser = db.prepare('SELECT username, display_name, avatar_url FROM users WHERE id = ?').get(userId);
          for (const sid of targetSockets) {
            global.__io.to(sid).emit('friend:request', {
              fromUserId: userId,
              fromUsername: senderUser?.username,
              fromDisplayName: senderUser?.display_name || null,
              fromAvatarUrl: senderUser?.avatar_url || null,
            });
          }
        }
      }

      return NextResponse.json({ success: true, action: 'sent' });
    }

    if (action === 'accept') {
      const result = db.prepare(
        "UPDATE friends SET status = 'accepted', updated_at = unixepoch() WHERE requester_id = ? AND recipient_id = ? AND status = 'pending'"
      ).run(targetUserId, userId);

      if (result.changes === 0) {
        return NextResponse.json({ error: 'No pending request found' }, { status: 404 });
      }

      // Notify the requester
      if (global.__io) {
        const targetSockets = global.__onlineUsers?.get(targetUserId);
        if (targetSockets) {
          const acceptUser = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(userId);
          for (const sid of targetSockets) {
            global.__io.to(sid).emit('friend:accepted', {
              fromUserId: userId,
              fromUsername: acceptUser?.username,
            });
          }
        }
      }

      return NextResponse.json({ success: true, action: 'accepted' });
    }

    if (action === 'reject') {
      db.prepare(
        "DELETE FROM friends WHERE requester_id = ? AND recipient_id = ? AND status = 'pending'"
      ).run(targetUserId, userId);

      return NextResponse.json({ success: true, action: 'rejected' });
    }

    if (action === 'remove') {
      db.prepare(
        'DELETE FROM friends WHERE (requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)'
      ).run(userId, targetUserId, targetUserId, userId);

      return NextResponse.json({ success: true, action: 'removed' });
    }

    return NextResponse.json({ error: 'Invalid action. Use: send, accept, reject, remove' }, { status: 400 });
  } catch (error) {
    console.error('Friends POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
