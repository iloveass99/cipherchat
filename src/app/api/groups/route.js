/**
 * CipherChat — Groups API
 * Create groups, manage members
 */

import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, userId } = body;

    const db = global.__db;
    const io = global.__io;

    if (!db) {
      return NextResponse.json({ error: 'Database not ready' }, { status: 503 });
    }

    // ---- Create Group ----
    if (action === 'create') {
      const { name, memberIds } = body;

      if (!name || !memberIds || memberIds.length < 1) {
        return NextResponse.json({ error: 'Group name and at least 1 member required' }, { status: 400 });
      }

      const conversationId = uuidv4();
      const allMembers = [userId, ...memberIds.filter(id => id !== userId)];

      // Create group conversation
      db.prepare(
        'INSERT INTO conversations (id, is_group, group_name, group_admin) VALUES (?, 1, ?, ?)'
      ).run(conversationId, name, userId);

      // Add all members
      const insertMember = db.prepare(
        'INSERT INTO group_members (conversation_id, user_id, role) VALUES (?, ?, ?)'
      );

      const addMembersTransaction = db.transaction((members) => {
        for (const memberId of members) {
          const role = memberId === userId ? 'admin' : 'member';
          insertMember.run(conversationId, memberId, role);
        }
      });

      addMembersTransaction(allMembers);

      // Get member details
      const members = db.prepare(
        `SELECT u.id, u.username, u.public_key, gm.role 
         FROM group_members gm 
         JOIN users u ON u.id = gm.user_id 
         WHERE gm.conversation_id = ?`
      ).all(conversationId);

      // Notify all members via socket
      if (io) {
        for (const memberId of allMembers) {
          const sockets = global.__onlineUsers?.get(memberId);
          if (sockets) {
            for (const sid of sockets) {
              io.sockets.sockets.get(sid)?.join(`conv:${conversationId}`);
              io.to(sid).emit('group:created', {
                conversationId,
                groupName: name,
                members,
              });
            }
          }
        }
      }

      return NextResponse.json({
        id: conversationId,
        is_group: 1,
        group_name: name,
        group_admin: userId,
        members,
      });
    }

    // ---- Add Member ----
    if (action === 'add-member') {
      const { conversationId, newMemberId } = body;

      // Check if user is admin
      const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND is_group = 1').get(conversationId);
      if (!conv) {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 });
      }

      const member = db.prepare(
        'SELECT * FROM group_members WHERE conversation_id = ? AND user_id = ?'
      ).get(conversationId, newMemberId);

      if (member) {
        return NextResponse.json({ error: 'Already a member' }, { status: 400 });
      }

      db.prepare(
        'INSERT INTO group_members (conversation_id, user_id, role) VALUES (?, ?, ?)'
      ).run(conversationId, newMemberId, 'member');

      const newMember = db.prepare('SELECT id, username, public_key FROM users WHERE id = ?').get(newMemberId);

      // Notify group
      if (io) {
        io.to(`conv:${conversationId}`).emit('group:member-joined', {
          conversationId,
          member: newMember,
        });
      }

      return NextResponse.json({ success: true, member: newMember });
    }

    // ---- Remove Member ----
    if (action === 'remove-member') {
      const { conversationId, memberId } = body;

      db.prepare(
        'DELETE FROM group_members WHERE conversation_id = ? AND user_id = ?'
      ).run(conversationId, memberId);

      if (io) {
        io.to(`conv:${conversationId}`).emit('group:member-left', {
          conversationId,
          memberId,
        });
      }

      return NextResponse.json({ success: true });
    }

    // ---- Leave Group ----
    if (action === 'leave') {
      const { conversationId } = body;

      db.prepare(
        'DELETE FROM group_members WHERE conversation_id = ? AND user_id = ?'
      ).run(conversationId, userId);

      if (io) {
        io.to(`conv:${conversationId}`).emit('group:member-left', {
          conversationId,
          memberId: userId,
        });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Groups API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ---- GET: Get group members ----
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('conversationId');

  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
  }

  const db = global.__db;
  if (!db) {
    return NextResponse.json({ error: 'Database not ready' }, { status: 503 });
  }

  try {
    const members = db.prepare(
      `SELECT u.id, u.username, u.public_key, gm.role, gm.joined_at
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.conversation_id = ?
       ORDER BY gm.joined_at ASC`
    ).all(conversationId);

    return NextResponse.json(members);
  } catch (err) {
    console.error('Error fetching group members:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
