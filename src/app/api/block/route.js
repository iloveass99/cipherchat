/**
 * CipherChat — Block API
 * POST /api/block — Block or unblock a user
 * GET /api/block?userId=xxx — Get blocked users list
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

    // Get users I've blocked
    const blocked = db.prepare(`
      SELECT b.blocked_id, b.created_at, u.username, u.display_name, u.avatar_url
      FROM blocks b
      JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = ?
      ORDER BY b.created_at DESC
    `).all(userId);

    // Get users who blocked me (just IDs, for hiding online status etc.)
    const blockedBy = db.prepare(
      'SELECT blocker_id FROM blocks WHERE blocked_id = ?'
    ).all(userId).map(r => r.blocker_id);

    return NextResponse.json({
      blocked: blocked.map(b => ({
        id: b.blocked_id,
        username: b.username,
        displayName: b.display_name || null,
        avatarUrl: b.avatar_url || null,
        blockedAt: b.created_at,
      })),
      blockedByIds: blockedBy,
    });
  } catch (error) {
    console.error('Block GET error:', error);
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
      return NextResponse.json({ error: 'Cannot block yourself' }, { status: 400 });
    }

    const db = getDB();

    if (action === 'block') {
      // Block the user
      db.prepare(
        'INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)'
      ).run(userId, targetUserId);

      // Also remove any friend relationship
      db.prepare(
        'DELETE FROM friends WHERE (requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)'
      ).run(userId, targetUserId, targetUserId, userId);

      return NextResponse.json({ success: true, action: 'blocked' });
    }

    if (action === 'unblock') {
      db.prepare(
        'DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?'
      ).run(userId, targetUserId);

      return NextResponse.json({ success: true, action: 'unblocked' });
    }

    // Check block status
    const isBlocked = db.prepare(
      'SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?'
    ).get(userId, targetUserId);

    const isBlockedBy = db.prepare(
      'SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?'
    ).get(targetUserId, userId);

    return NextResponse.json({
      isBlocked: !!isBlocked,
      isBlockedBy: !!isBlockedBy,
    });
  } catch (error) {
    console.error('Block POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
