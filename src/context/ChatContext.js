'use client';

/**
 * CipherChat — Chat Context (Phase 2)
 * Global state management for conversations, messages, calls, groups, and online status
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { initSocket, getSocket, disconnectSocket } from '@/lib/socket';
import {
  generateKeyPair,
  exportPublicKey,
  exportPrivateKey,
  importPublicKey,
  importPrivateKey,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  wrapPrivateKey,
  unwrapPrivateKey,
  generateRecoveryKey,
  encryptFile,
  arrayBufferToBase64,
} from '@/lib/crypto';
import {
  storeWrappedPrivateKey,
  getWrappedPrivateKey,
  cachePublicKey,
  getCachedPublicKey,
  cacheSessionKey,
  getCachedSessionKey,
  clearAllKeys,
} from '@/lib/keystore';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  // Auth state
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  // Chat state
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState({}); // conversationId -> { userId, username }

  // Call state (Phase 2)
  const [callState, setCallState] = useState(null); // null | 'ringing' | 'incoming' | 'active'
  const [callType, setCallType] = useState(null); // 'audio' | 'video'
  const [callPeer, setCallPeer] = useState(null); // { userId, username }
  const [callConversationId, setCallConversationId] = useState(null);
  const [callId, setCallId] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const callTimerRef = useRef(null);
  const pendingOfferRef = useRef(null); // Queue WebRTC offer until user accepts

  // Screen sharing state
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenStreamRef = useRef(null);

  // Crypto state
  const privateKeyRef = useRef(null);
  const sessionKeysRef = useRef(new Map()); // conversationId -> CryptoKey
  const passphraseRef = useRef(null);

  // ---- Auth Functions ----

  const register = useCallback(async (username, password) => {
    setAuthError('');
    try {
      const keyPair = await generateKeyPair();
      const publicKeyJwk = await exportPublicKey(keyPair.publicKey);
      const privateKeyJwk = await exportPrivateKey(keyPair.privateKey);

      // Wrap private key with passphrase (for cross-device recovery)
      const wrappedKey = await wrapPrivateKey(privateKeyJwk, password);

      // Generate recovery key and wrap private key with it too
      const recoveryKey = generateRecoveryKey();
      const recoveryKeyRaw = recoveryKey.replace(/-/g, '');
      const recoveryWrappedKey = await wrapPrivateKey(privateKeyJwk, recoveryKeyRaw);

      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          username,
          password,
          publicKey: publicKeyJwk,
          wrappedPrivateKey: wrappedKey,
          recoveryKey: recoveryKeyRaw,
          recoveryWrappedKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await storeWrappedPrivateKey(data.user.id, wrappedKey);
      privateKeyRef.current = keyPair.privateKey;
      passphraseRef.current = password;

      // DON'T set user yet — return data + callback so AuthForm can show
      // the recovery key screen first, then call completeRegistration()
      return {
        success: true,
        recoveryKey,
        completeRegistration: async () => {
          // Save private key to sessionStorage for refresh persistence
          const privKeyJwk = await exportPrivateKey(keyPair.privateKey);
          sessionStorage.setItem('cipherchat_privkey', JSON.stringify(privKeyJwk));

          localStorage.setItem('cipherchat_token', data.token);
          localStorage.setItem('cipherchat_user', JSON.stringify(data.user));
          setUser(data.user);
          setToken(data.token);
          initSocket(data.user.id, data.user.username);
        },
      };
    } catch (err) {
      setAuthError(err.message);
      return { success: false };
    }
  }, []);

  const login = useCallback(async (username, password) => {
    setAuthError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', username, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Try to unwrap private key — check local first, then server
      let keyRestored = false;

      // 1. Try local IndexedDB (fastest)
      const localWrappedKey = await getWrappedPrivateKey(data.user.id);
      if (localWrappedKey) {
        try {
          privateKeyRef.current = await unwrapPrivateKey(localWrappedKey, password);
          keyRestored = true;
        } catch {
          console.warn('Local key unwrap failed, trying server backup...');
        }
      }

      // 2. Try server backup (cross-device recovery)
      if (!keyRestored && data.wrappedPrivateKey) {
        try {
          privateKeyRef.current = await unwrapPrivateKey(data.wrappedPrivateKey, password);
          await storeWrappedPrivateKey(data.user.id, data.wrappedPrivateKey);
          keyRestored = true;
          console.log('🔑 Private key recovered from server backup');
        } catch {
          console.warn('Server key unwrap failed');
        }
      }

      // 3. Last resort — regenerate
      if (!keyRestored) {
        console.warn('⚠️ No recoverable key found — generating new key pair');
        const keyPair = await generateKeyPair();
        const privateKeyJwk = await exportPrivateKey(keyPair.privateKey);
        const newWrapped = await wrapPrivateKey(privateKeyJwk, password);
        await storeWrappedPrivateKey(data.user.id, newWrapped);
        privateKeyRef.current = keyPair.privateKey;
      }

      passphraseRef.current = password;
      localStorage.setItem('cipherchat_token', data.token);
      localStorage.setItem('cipherchat_user', JSON.stringify(data.user));

      // Save private key to sessionStorage for refresh persistence
      const privKeyJwk = await exportPrivateKey(privateKeyRef.current);
      sessionStorage.setItem('cipherchat_privkey', JSON.stringify(privKeyJwk));

      setUser(data.user);
      setToken(data.token);
      initSocket(data.user.id, data.user.username);

      return true;
    } catch (err) {
      setAuthError(err.message);
      return false;
    }
  }, []);

  const recoverAccount = useCallback(async (username, recoveryKey, newPassword) => {
    setAuthError('');
    try {
      const recoveryKeyRaw = recoveryKey.replace(/-/g, '').toUpperCase();

      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recover',
          username,
          recoveryKey: recoveryKeyRaw,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Unwrap private key using recovery key
      let keyRestored = false;
      if (data.recoveryWrappedKey) {
        try {
          privateKeyRef.current = await unwrapPrivateKey(data.recoveryWrappedKey, recoveryKeyRaw);
          keyRestored = true;

          // Re-wrap with new password and update server
          const privateKeyJwk = await exportPrivateKey(privateKeyRef.current);
          const newWrappedKey = await wrapPrivateKey(privateKeyJwk, newPassword);
          await storeWrappedPrivateKey(data.user.id, newWrappedKey);

          // Update the server with the new password-wrapped key
          await fetch('/api/auth/update-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: data.user.id,
              token: data.token,
              wrappedPrivateKey: newWrappedKey,
            }),
          });
        } catch (err) {
          console.error('Recovery unwrap failed:', err);
        }
      }

      if (!keyRestored) {
        // Can't recover the key — generate new one
        const keyPair = await generateKeyPair();
        const privateKeyJwk = await exportPrivateKey(keyPair.privateKey);
        const newWrapped = await wrapPrivateKey(privateKeyJwk, newPassword);
        await storeWrappedPrivateKey(data.user.id, newWrapped);
        privateKeyRef.current = keyPair.privateKey;
      }

      passphraseRef.current = newPassword;
      localStorage.setItem('cipherchat_token', data.token);
      localStorage.setItem('cipherchat_user', JSON.stringify(data.user));

      setUser(data.user);
      setToken(data.token);
      initSocket(data.user.id, data.user.username);

      return true;
    } catch (err) {
      setAuthError(err.message);
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    if (callState) endCallCleanup();
    disconnectSocket();
    localStorage.removeItem('cipherchat_token');
    localStorage.removeItem('cipherchat_user');
    sessionStorage.removeItem('cipherchat_privkey');
    privateKeyRef.current = null;
    passphraseRef.current = null;
    sessionKeysRef.current = new Map();
    setUser(null);
    setToken(null);
    setConversations([]);
    setActiveConversation(null);
    setMessages([]);
    setOnlineUsers(new Set());
    setTypingUsers({});
    setCallState(null);
  }, [callState]);

  // ---- Crypto Functions ----

  const getSessionKey = useCallback(async (conversationId, otherPublicKeyJwk) => {
    if (sessionKeysRef.current.has(conversationId)) {
      return sessionKeysRef.current.get(conversationId);
    }

    const cached = await getCachedSessionKey(conversationId);
    if (cached) {
      sessionKeysRef.current.set(conversationId, cached);
      return cached;
    }

    if (!privateKeyRef.current || !otherPublicKeyJwk) {
      throw new Error('Missing keys for session key derivation');
    }

    const otherPublicKey = await importPublicKey(otherPublicKeyJwk);
    const sharedKey = await deriveSharedKey(privateKeyRef.current, otherPublicKey);

    sessionKeysRef.current.set(conversationId, sharedKey);
    await cacheSessionKey(conversationId, sharedKey);

    return sharedKey;
  }, []);

  const encryptAndSend = useCallback(async (conversationId, plaintext, otherPublicKeyJwk, expiresIn = null) => {
    const sessionKey = await getSessionKey(conversationId, otherPublicKeyJwk);
    const { ciphertext, iv } = await encryptMessage(plaintext, sessionKey);

    const messageId = crypto.randomUUID();
    let expiresAt = null;
    if (expiresIn) {
      expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    }

    const socket = getSocket();
    if (socket) {
      socket.emit('message:send', {
        id: messageId,
        conversationId,
        encryptedContent: ciphertext,
        iv,
        expiresAt,
      });
    }

    return messageId;
  }, [getSessionKey]);

  const encryptAndSendFile = useCallback(async (conversationId, file, otherPublicKeyJwk, expiresIn = null) => {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      throw new Error('File too large. Maximum size is 10MB.');
    }

    const sessionKey = await getSessionKey(conversationId, otherPublicKeyJwk);

    // Read file as ArrayBuffer
    const fileData = await file.arrayBuffer();

    // Create metadata + data payload
    const payload = JSON.stringify({
      type: file.type.startsWith('image/') ? 'image' :
            file.type.startsWith('video/') ? 'video' :
            file.type.startsWith('audio/') ? 'audio' : 'file',
      name: file.name,
      size: file.size,
      mimeType: file.type,
      data: arrayBufferToBase64(fileData),
    });

    // Encrypt the entire payload as a message
    const { ciphertext, iv } = await encryptMessage(payload, sessionKey);

    const messageId = crypto.randomUUID();
    let expiresAt = null;
    if (expiresIn) {
      expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    }

    const socket = getSocket();
    if (socket) {
      socket.emit('message:send', {
        id: messageId,
        conversationId,
        encryptedContent: ciphertext,
        iv,
        expiresAt,
        messageType: 'file',
      });
    }

    return messageId;
  }, [getSessionKey]);

  const decryptMessageContent = useCallback(async (encryptedContent, iv, conversationId, otherPublicKeyJwk) => {
    try {
      const sessionKey = await getSessionKey(conversationId, otherPublicKeyJwk);
      return await decryptMessage(encryptedContent, iv, sessionKey);
    } catch (err) {
      console.error('Decryption error:', err);
      return '🔒 Unable to decrypt';
    }
  }, [getSessionKey]);

  // ---- Conversation Functions ----

  const loadConversations = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/conversations?userId=${user.id}`);
      const data = await res.json();
      if (res.ok) {
        setConversations(data);
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
    }
  }, [user]);

  const startConversation = useCallback(async (otherUserId) => {
    if (!user) return null;
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, otherUserId }),
      });
      const data = await res.json();
      if (res.ok) {
        const socket = getSocket();
        if (socket) {
          socket.emit('conversation:join', { conversationId: data.id });
        }
        await loadConversations();
        return data;
      }
    } catch (err) {
      console.error('Error starting conversation:', err);
    }
    return null;
  }, [user, loadConversations]);

  const loadMessages = useCallback(async (conversationId) => {
    try {
      const res = await fetch(`/api/messages?conversationId=${conversationId}`);
      const data = await res.json();
      if (res.ok) {
        setMessages(data);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }, []);

  const selectConversation = useCallback(async (conversation) => {
    setActiveConversation(conversation);
    if (conversation) {
      await loadMessages(conversation.id);
      const socket = getSocket();
      if (socket) {
        socket.emit('messages:read', { conversationId: conversation.id });
      }
      setConversations(prev =>
        prev.map(c =>
          c.id === conversation.id ? { ...c, unread_count: 0 } : c
        )
      );
    } else {
      setMessages([]);
    }
  }, [loadMessages]);

  // ---- Group Functions (Phase 2) ----

  const createGroup = useCallback(async (groupName, memberIds) => {
    if (!user) return null;
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          userId: user.id,
          name: groupName,
          memberIds,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const socket = getSocket();
        if (socket) {
          socket.emit('group:create', { conversationId: data.id });
        }
        await loadConversations();
        return data;
      }
    } catch (err) {
      console.error('Error creating group:', err);
    }
    return null;
  }, [user, loadConversations]);

  // ---- Typing ----

  const sendTyping = useCallback((conversationId, isTyping) => {
    const socket = getSocket();
    if (socket) {
      socket.emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId });
    }
  }, []);

  // ---- Profile ----

  const updateProfile = useCallback(async ({ displayName, avatarUrl, bio }) => {
    if (!user) return false;
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          displayName,
          avatarUrl,
          bio,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Update user state with new profile data
      const updatedUser = {
        ...user,
        displayName: data.user.displayName,
        avatarUrl: data.user.avatarUrl,
        bio: data.user.bio,
      };
      setUser(updatedUser);
      localStorage.setItem('cipherchat_user', JSON.stringify(updatedUser));

      return true;
    } catch (err) {
      console.error('Profile update error:', err);
      return false;
    }
  }, [user]);

  // ---- Call Functions (Phase 2) ----

  const endCallCleanup = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    // Stop screen share if active
    if (screenStreamRef.current) {
      for (const track of screenStreamRef.current.getTracks()) {
        track.stop();
      }
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    remoteStreamRef.current = null;
    setCallState(null);
    setCallType(null);
    setCallPeer(null);
    setCallConversationId(null);
    setCallId(null);
    setCallDuration(0);
  }, []);

  const initiateCall = useCallback(async (conversationId, type, targetUserId, targetUsername) => {
    if (callState) return; // Already in a call

    const newCallId = crypto.randomUUID();
    setCallState('ringing');
    setCallType(type);
    setCallPeer({ userId: targetUserId, username: targetUsername });
    setCallConversationId(conversationId);
    setCallId(newCallId);

    try {
      // Import WebRTC dynamically (client-side only)
      const webrtc = await import('@/lib/webrtc');

      const onIceCandidate = (candidate) => {
        const socket = getSocket();
        if (socket) {
          socket.emit('webrtc:ice-candidate', {
            conversationId,
            candidate,
            targetUserId,
          });
        }
      };

      const onTrack = (stream) => {
        remoteStreamRef.current = stream;
      };

      const onConnectionStateChange = (state) => {
        if (state === 'connected') {
          setCallState('active');
          callTimerRef.current = setInterval(() => {
            setCallDuration(prev => prev + 1);
          }, 1000);
        } else if (state === 'disconnected' || state === 'failed') {
          endCallCleanup();
        }
      };

      const { offer, localStream, peerConnection: pc } = await webrtc.startCall(type, onIceCandidate, onTrack, onConnectionStateChange);
      localStreamRef.current = localStream;
      peerConnectionRef.current = pc;

      // Send call initiation + offer
      const socket = getSocket();
      if (socket) {
        socket.emit('call:initiate', {
          conversationId,
          callType: type,
          callId: newCallId,
          targetUserId,
        });

        socket.emit('webrtc:offer', {
          conversationId,
          offer,
          targetUserId,
        });
      }
    } catch (err) {
      console.error('Call initiation error:', err);
      alert(err.message || 'Could not start call');
      endCallCleanup();
    }
  }, [callState, endCallCleanup]);

  const acceptCall = useCallback(async () => {
    if (callState !== 'incoming') return;

    setCallState('active');

    const socket = getSocket();
    if (socket) {
      socket.emit('call:accept', {
        conversationId: callConversationId,
        callId,
      });
    }

    // Process the queued WebRTC offer
    if (pendingOfferRef.current) {
      const { offer, fromUserId } = pendingOfferRef.current;
      pendingOfferRef.current = null;

      try {
        const webrtc = await import('@/lib/webrtc');

        const onIceCandidate = (candidate) => {
          if (socket) {
            socket.emit('webrtc:ice-candidate', {
              conversationId: callConversationId,
              candidate,
              targetUserId: fromUserId,
            });
          }
        };

        const onTrack = (stream) => {
          remoteStreamRef.current = stream;
        };

        const onConnectionStateChange = (state) => {
          if (state === 'connected') {
            setCallState('active');
          } else if (state === 'disconnected' || state === 'failed') {
            endCallCleanup();
          }
        };

        const { answer, localStream, peerConnection: pc } = await webrtc.answerCall(
          offer,
          callType || 'audio',
          onIceCandidate,
          onTrack,
          onConnectionStateChange
        );

        localStreamRef.current = localStream;
        peerConnectionRef.current = pc;

        socket.emit('webrtc:answer', {
          conversationId: callConversationId,
          answer,
          targetUserId: fromUserId,
        });
      } catch (err) {
        console.error('Error processing queued offer:', err);
      }
    }

    // Start call duration timer
    callTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  }, [callState, callConversationId, callId, callType, endCallCleanup]);

  const rejectCall = useCallback(() => {
    if (callState !== 'incoming') return;

    const socket = getSocket();
    if (socket) {
      socket.emit('call:reject', {
        conversationId: callConversationId,
        callId,
      });
    }

    endCallCleanup();
  }, [callState, callConversationId, callId, endCallCleanup]);

  const endCall = useCallback(() => {
    const socket = getSocket();
    if (socket && callConversationId) {
      socket.emit('call:end', {
        conversationId: callConversationId,
        callId,
      });
    }
    endCallCleanup();
  }, [callConversationId, callId, endCallCleanup]);

  const toggleMuteCall = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return !audioTrack.enabled; // true = muted
      }
    }
    return false;
  }, []);

  const toggleCameraCall = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return !videoTrack.enabled; // true = camera off
      }
    }
    return false;
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (!callState || callState === 'incoming') return false;

    try {
      const webrtc = await import('@/lib/webrtc');

      if (isScreenSharing) {
        // Stop sharing
        await webrtc.stopScreenShare(screenStreamRef.current);
        screenStreamRef.current = null;
        setIsScreenSharing(false);
        return false;
      } else {
        // Start sharing
        const onEnded = () => {
          // Browser's native "Stop sharing" button clicked
          screenStreamRef.current = null;
          setIsScreenSharing(false);
        };

        const { screenStream } = await webrtc.startScreenShare(onEnded);
        screenStreamRef.current = screenStream;
        setIsScreenSharing(true);
        return true;
      }
    } catch (err) {
      console.error('Screen share error:', err);
      setIsScreenSharing(false);
      screenStreamRef.current = null;
      return false;
    }
  }, [callState, isScreenSharing]);

  // ---- Socket Event Handlers ----

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !user) return;

    const handleNewMessage = (message) => {
      setMessages(prev => {
        if (prev.length > 0 && prev[0]?.conversation_id === message.conversation_id) {
          if (prev.find(m => m.id === message.id)) return prev;
          return [...prev, message];
        }
        if (activeConversation?.id === message.conversation_id) {
          return [...prev, message];
        }
        return prev;
      });

      setConversations(prev =>
        prev.map(c => {
          if (c.id === message.conversation_id) {
            return {
              ...c,
              last_message_content: message.encrypted_content,
              last_message_iv: message.iv,
              last_message_sender: message.sender_id,
              last_message_sender_name: message.sender_username,
              last_message_time: message.timestamp,
              unread_count: activeConversation?.id === message.conversation_id
                ? 0
                : (c.unread_count || 0) + (message.sender_id !== user.id ? 1 : 0),
            };
          }
          return c;
        })
      );

      if (activeConversation?.id === message.conversation_id && message.sender_id !== user.id) {
        socket.emit('messages:read', { conversationId: message.conversation_id });
      }
    };

    const handleOnline = ({ userId: uid }) => {
      setOnlineUsers(prev => new Set([...prev, uid]));
    };

    const handleOffline = ({ userId: uid }) => {
      setOnlineUsers(prev => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
    };

    const handleOnlineList = (list) => {
      setOnlineUsers(new Set(list));
    };

    const handleTypingStart = ({ conversationId, userId: uid, username }) => {
      if (uid !== user.id) {
        setTypingUsers(prev => ({ ...prev, [conversationId]: { userId: uid, username } }));
      }
    };

    const handleTypingStop = ({ conversationId, userId: uid }) => {
      if (uid !== user.id) {
        setTypingUsers(prev => {
          const next = { ...prev };
          delete next[conversationId];
          return next;
        });
      }
    };

    const handleMessagesRead = ({ conversationId, readAt }) => {
      setMessages(prev =>
        prev.map(m =>
          m.conversation_id === conversationId && m.sender_id === user.id
            ? { ...m, is_read: 1, read_at: readAt }
            : m
        )
      );
    };

    const handleExpired = () => {
      if (activeConversation) {
        loadMessages(activeConversation.id);
      }
      loadConversations();
    };

    const handleNewConversation = ({ conversationId, participants }) => {
      if (participants.includes(user.id)) {
        socket.emit('conversation:join', { conversationId });
        loadConversations();
      }
    };

    // ---- Call event handlers (Phase 2) ----

    const handleIncomingCall = ({ callId: inCallId, conversationId, callType: inCallType, callerId, callerUsername }) => {
      if (callState) return; // Already in a call
      setCallState('incoming');
      setCallType(inCallType);
      setCallPeer({ userId: callerId, username: callerUsername });
      setCallConversationId(conversationId);
      setCallId(inCallId);
    };

    const handleCallAccepted = async ({ conversationId }) => {
      setCallState('active');
      // Timer starts when WebRTC connects
    };

    const handleCallRejected = () => {
      endCallCleanup();
    };

    const handleCallEnded = () => {
      endCallCleanup();
    };

    const handleWebRTCOffer = async ({ conversationId, offer, fromUserId }) => {
      // Queue the offer — don't answer until user clicks Accept
      pendingOfferRef.current = { offer, fromUserId, conversationId };
    };

    const handleWebRTCAnswer = async ({ answer }) => {
      try {
        const webrtc = await import('@/lib/webrtc');
        await webrtc.handleAnswer(answer);
      } catch (err) {
        console.error('Error handling WebRTC answer:', err);
      }
    };

    const handleWebRTCIceCandidate = async ({ candidate }) => {
      try {
        const webrtc = await import('@/lib/webrtc');
        await webrtc.handleIceCandidate(candidate);
      } catch (err) {
        console.error('Error handling ICE candidate:', err);
      }
    };

    // Group events
    const handleGroupCreated = () => {
      loadConversations();
    };

    const handleGroupMemberJoined = () => {
      loadConversations();
    };

    const handleGroupMemberLeft = () => {
      loadConversations();
    };

    // Register all event handlers
    socket.on('message:new', handleNewMessage);
    socket.on('user:online', handleOnline);
    socket.on('user:offline', handleOffline);
    socket.on('users:online', handleOnlineList);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('messages:read', handleMessagesRead);
    socket.on('messages:expired', handleExpired);
    socket.on('conversation:new', handleNewConversation);

    // Call events
    socket.on('call:incoming', handleIncomingCall);
    socket.on('call:accepted', handleCallAccepted);
    socket.on('call:rejected', handleCallRejected);
    socket.on('call:ended', handleCallEnded);
    socket.on('webrtc:offer', handleWebRTCOffer);
    socket.on('webrtc:answer', handleWebRTCAnswer);
    socket.on('webrtc:ice-candidate', handleWebRTCIceCandidate);

    // Group events
    socket.on('group:created', handleGroupCreated);
    socket.on('group:member-joined', handleGroupMemberJoined);
    socket.on('group:member-left', handleGroupMemberLeft);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('user:online', handleOnline);
      socket.off('user:offline', handleOffline);
      socket.off('users:online', handleOnlineList);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('messages:read', handleMessagesRead);
      socket.off('messages:expired', handleExpired);
      socket.off('conversation:new', handleNewConversation);

      socket.off('call:incoming', handleIncomingCall);
      socket.off('call:accepted', handleCallAccepted);
      socket.off('call:rejected', handleCallRejected);
      socket.off('call:ended', handleCallEnded);
      socket.off('webrtc:offer', handleWebRTCOffer);
      socket.off('webrtc:answer', handleWebRTCAnswer);
      socket.off('webrtc:ice-candidate', handleWebRTCIceCandidate);

      socket.off('group:created', handleGroupCreated);
      socket.off('group:member-joined', handleGroupMemberJoined);
      socket.off('group:member-left', handleGroupMemberLeft);
    };
  }, [user, activeConversation, callState, callType, loadMessages, loadConversations, endCallCleanup]);

  // ---- Session Restore ----
  // Try to restore the session from localStorage + sessionStorage.
  // The private key is saved in sessionStorage (survives refresh, cleared on tab close).

  useEffect(() => {
    const restore = async () => {
      try {
        const savedToken = localStorage.getItem('cipherchat_token');
        const savedUser = localStorage.getItem('cipherchat_user');
        const savedPrivKey = sessionStorage.getItem('cipherchat_privkey');

        if (savedToken && savedUser && savedPrivKey) {
          // Restore private key from sessionStorage
          const privKeyJwk = JSON.parse(savedPrivKey);
          privateKeyRef.current = await importPrivateKey(privKeyJwk);

          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
          setToken(savedToken);
          initSocket(parsedUser.id, parsedUser.username);
        } else if (savedToken && savedUser) {
          // No private key in session (e.g., new tab) — force re-login
          localStorage.removeItem('cipherchat_token');
          localStorage.removeItem('cipherchat_user');
        }
      } catch (err) {
        console.error('Session restore error:', err);
        // Clear corrupted session data
        localStorage.removeItem('cipherchat_token');
        localStorage.removeItem('cipherchat_user');
        sessionStorage.removeItem('cipherchat_privkey');
      } finally {
        setIsLoading(false);
      }
    };

    restore();
  }, []);

  // Load conversations when user changes
  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user, loadConversations]);

  const value = {
    // Auth
    user, token, isLoading, authError,
    register, login, logout,

    // Conversations
    conversations, activeConversation,
    loadConversations, startConversation, selectConversation,

    // Messages
    messages, loadMessages,
    encryptAndSend, decryptMessageContent,

    // Online / Typing
    onlineUsers, typingUsers, sendTyping,

    // Crypto
    getSessionKey, privateKeyRef, passphraseRef,

    // Calls (Phase 2)
    callState, callType, callPeer, callDuration,
    callConversationId, callId,
    localStreamRef, remoteStreamRef,
    initiateCall, acceptCall, rejectCall, endCall,
    toggleMuteCall, toggleCameraCall,

    // Screen sharing
    isScreenSharing, toggleScreenShare,

    // Groups (Phase 2)
    createGroup,

    // Recovery
    recoverAccount,

    // File sharing (Phase 3)
    encryptAndSendFile,

    // Profile
    updateProfile,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
