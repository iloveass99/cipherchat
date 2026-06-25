/**
 * CipherChat — Socket.io Client
 * Singleton socket connection with auth
 */

import { io } from 'socket.io-client';

let socket = null;

/**
 * Initialize socket connection
 */
export function initSocket(userId, username) {
  if (socket?.connected) return socket;

  socket = io({
    path: '/api/socketio',
    auth: { userId, username },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    console.log('🔌 Socket connected');
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('🔌 Socket connection error:', err.message);
  });

  return socket;
}

/**
 * Get current socket instance
 */
export function getSocket() {
  return socket;
}

/**
 * Disconnect and cleanup
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
