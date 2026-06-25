'use client';

/**
 * CipherChat — Chat Context
 * Global state management for conversations, messages, and online status
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

  // Crypto state
  const privateKeyRef = useRef(null);
  const sessionKeysRef = useRef(new Map()); // conversationId -> CryptoKey
  const passphraseRef = useRef(null);

  // ---- Auth Functions ----

  const register = useCallback(async (username, password) => {
    setAuthError('');
    try {
      // Generate key pair BEFORE registration
      const keyPair = await generateKeyPair();
      const publicKeyJwk = await exportPublicKey(keyPair.publicKey);
      const privateKeyJwk = await exportPrivateKey(keyPair.privateKey);

      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          username,
          password,
          publicKey: publicKeyJwk,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Store wrapped private key locally
      const wrappedKey = await wrapPrivateKey(privateKeyJwk, password);
      await storeWrappedPrivateKey(data.user.id, wrappedKey);

      // Keep private key in memory
      privateKeyRef.current = keyPair.privateKey;
      passphraseRef.current = password;

      // Save session
      localStorage.setItem('cipherchat_token', data.token);
      localStorage.setItem('cipherchat_user', JSON.stringify(data.user));

      setUser(data.user);
      setToken(data.token);

      // Connect socket
      initSocket(data.user.id, data.user.username);

      return true;
    } catch (err) {
      setAuthError(err.message);
      return false;
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

      // Unwrap private key from local storage
      const wrappedKey = await getWrappedPrivateKey(data.user.id);
      if (wrappedKey) {
        try {
          privateKeyRef.current = await unwrapPrivateKey(wrappedKey, password);
        } catch {
          // Key might be from a different device — regenerate
          console.warn('Could not unwrap private key, regenerating...');
          const keyPair = await generateKeyPair();
          const privateKeyJwk = await exportPrivateKey(keyPair.privateKey);
          const newWrapped = await wrapPrivateKey(privateKeyJwk, password);
          await storeWrappedPrivateKey(data.user.id, newWrapped);
          privateKeyRef.current = keyPair.privateKey;
        }
      } else {
        // No local key — regenerate (new device)
        const keyPair = await generateKeyPair();
        const privateKeyJwk = await exportPrivateKey(keyPair.privateKey);
        const newWrapped = await wrapPrivateKey(privateKeyJwk, password);
        await storeWrappedPrivateKey(data.user.id, newWrapped);
        privateKeyRef.current = keyPair.privateKey;
      }

      passphraseRef.current = password;

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
    disconnectSocket();
    localStorage.removeItem('cipherchat_token');
    localStorage.removeItem('cipherchat_user');
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
  }, []);

  // ---- Crypto Functions ----

  const getSessionKey = useCallback(async (conversationId, otherPublicKeyJwk) => {
    // Check memory cache
    if (sessionKeysRef.current.has(conversationId)) {
      return sessionKeysRef.current.get(conversationId);
    }

    // Check IndexedDB cache
    const cached = await getCachedSessionKey(conversationId);
    if (cached) {
      sessionKeysRef.current.set(conversationId, cached);
      return cached;
    }

    // Derive new session key
    if (!privateKeyRef.current || !otherPublicKeyJwk) {
      throw new Error('Missing keys for session key derivation');
    }

    const otherPublicKey = await importPublicKey(otherPublicKeyJwk);
    const sharedKey = await deriveSharedKey(privateKeyRef.current, otherPublicKey);

    // Cache it
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
        // Join socket room
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
      // Mark as read
      const socket = getSocket();
      if (socket) {
        socket.emit('messages:read', { conversationId: conversation.id });
      }
      // Update local unread count
      setConversations(prev =>
        prev.map(c =>
          c.id === conversation.id ? { ...c, unread_count: 0 } : c
        )
      );
    } else {
      setMessages([]);
    }
  }, [loadMessages]);

  // ---- Typing ----

  const sendTyping = useCallback((conversationId, isTyping) => {
    const socket = getSocket();
    if (socket) {
      socket.emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId });
    }
  }, []);

  // ---- Socket Event Handlers ----

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !user) return;

    const handleNewMessage = (message) => {
      // Add to messages if in active conversation
      setMessages(prev => {
        if (prev.length > 0 && prev[0]?.conversation_id === message.conversation_id) {
          // Avoid duplicates
          if (prev.find(m => m.id === message.id)) return prev;
          return [...prev, message];
        }
        if (activeConversation?.id === message.conversation_id) {
          return [...prev, message];
        }
        return prev;
      });

      // Update conversation list
      setConversations(prev =>
        prev.map(c => {
          if (c.id === message.conversation_id) {
            return {
              ...c,
              last_message_content: message.encrypted_content,
              last_message_iv: message.iv,
              last_message_sender: message.sender_id,
              last_message_time: message.timestamp,
              unread_count: activeConversation?.id === message.conversation_id
                ? 0
                : (c.unread_count || 0) + (message.sender_id !== user.id ? 1 : 0),
            };
          }
          return c;
        })
      );

      // Mark as read if in active conversation
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

    const handleMessagesRead = ({ conversationId }) => {
      setMessages(prev =>
        prev.map(m =>
          m.conversation_id === conversationId ? { ...m, is_read: 1 } : m
        )
      );
    };

    const handleExpired = () => {
      // Reload messages for active conversation
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

    socket.on('message:new', handleNewMessage);
    socket.on('user:online', handleOnline);
    socket.on('user:offline', handleOffline);
    socket.on('users:online', handleOnlineList);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('messages:read', handleMessagesRead);
    socket.on('messages:expired', handleExpired);
    socket.on('conversation:new', handleNewConversation);

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
    };
  }, [user, activeConversation, loadMessages, loadConversations]);

  // ---- Session Restore ----

  useEffect(() => {
    const restore = async () => {
      try {
        const savedToken = localStorage.getItem('cipherchat_token');
        const savedUser = localStorage.getItem('cipherchat_user');

        if (savedToken && savedUser) {
          const parsed = JSON.parse(savedUser);
          setUser(parsed);
          setToken(savedToken);
          initSocket(parsed.id, parsed.username);
        }
      } catch (err) {
        console.error('Session restore error:', err);
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
    user,
    token,
    isLoading,
    authError,
    register,
    login,
    logout,

    // Conversations
    conversations,
    activeConversation,
    loadConversations,
    startConversation,
    selectConversation,

    // Messages
    messages,
    loadMessages,
    encryptAndSend,
    decryptMessageContent,

    // Online / Typing
    onlineUsers,
    typingUsers,
    sendTyping,

    // Crypto
    getSessionKey,
    privateKeyRef,
    passphraseRef,
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
