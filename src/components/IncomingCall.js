'use client';

/**
 * CipherChat — Incoming Call Overlay
 * Shows when another user calls
 */

import { useEffect, useRef } from 'react';
import { useChat } from '@/context/ChatContext';

export default function IncomingCall() {
  const { callState, callType, callPeer, acceptCall, rejectCall } = useChat();
  const audioContextRef = useRef(null);
  const oscillatorRef = useRef(null);

  // Ring sound using Web Audio API
  useEffect(() => {
    if (callState !== 'incoming') {
      // Stop ring
      if (oscillatorRef.current) {
        try { oscillatorRef.current.stop(); } catch {}
        oscillatorRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      return;
    }

    // Start ring
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);

      // Create a pulsing ring pattern
      const duration = 30; // 30 seconds max ring
      for (let i = 0; i < duration * 2; i++) {
        const time = audioContext.currentTime + i * 0.5;
        if (i % 4 < 2) {
          gainNode.gain.setValueAtTime(0.08, time);
          oscillator.frequency.setValueAtTime(i % 2 === 0 ? 440 : 523, time);
        } else {
          gainNode.gain.setValueAtTime(0, time);
        }
      }

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillatorRef.current = oscillator;
    } catch (err) {
      console.error('Ring tone error:', err);
    }

    return () => {
      if (oscillatorRef.current) {
        try { oscillatorRef.current.stop(); } catch {}
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [callState]);

  if (callState !== 'incoming') return null;

  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-card">
        <div className="incoming-call-type">
          {callType === 'video' ? '📹 Incoming Video Call' : '📞 Incoming Audio Call'}
        </div>

        <div className="incoming-call-avatar-container">
          <div className="incoming-pulse-ring" />
          <div className="incoming-pulse-ring delay-1" />
          <div className="incoming-pulse-ring delay-2" />
          <div className="incoming-call-avatar">
            {callPeer?.username?.slice(0, 2).toUpperCase() || '??'}
          </div>
        </div>

        <div className="incoming-call-name">{callPeer?.username || 'Unknown'}</div>
        <div className="incoming-call-encryption">🔒 End-to-end encrypted</div>

        <div className="incoming-call-actions">
          <button
            className="incoming-call-btn reject"
            onClick={rejectCall}
            type="button"
          >
            <span className="incoming-call-btn-icon">✕</span>
            <span>Decline</span>
          </button>

          <button
            className="incoming-call-btn accept"
            onClick={acceptCall}
            type="button"
          >
            <span className="incoming-call-btn-icon">
              {callType === 'video' ? '📹' : '📞'}
            </span>
            <span>Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
}
