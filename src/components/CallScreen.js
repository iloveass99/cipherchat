'use client';

/**
 * CipherChat — Call Screen
 * Full-screen video/audio call UI
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useChat } from '@/context/ChatContext';

export default function CallScreen() {
  const {
    callState,
    callType,
    callPeer,
    callDuration,
    localStreamRef,
    remoteStreamRef,
    endCall,
    toggleMuteCall,
    toggleCameraCall,
  } = useChat();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStreamRef?.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [localStreamRef, callState]);

  // Attach remote stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStreamRef?.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [remoteStreamRef, callState]);

  const handleMute = useCallback(() => {
    const muted = toggleMuteCall();
    setIsMuted(muted);
  }, [toggleMuteCall]);

  const handleCamera = useCallback(() => {
    const off = toggleCameraCall();
    setIsCameraOff(off);
  }, [toggleCameraCall]);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (callState !== 'active' && callState !== 'ringing') return null;

  const isVideoCall = callType === 'video';
  const isConnecting = callState === 'ringing';

  return (
    <div className="call-screen-overlay">
      <div className={`call-screen ${isVideoCall ? 'video-call' : 'audio-call'}`}>
        {/* Remote Video (large) */}
        {isVideoCall && (
          <div className="call-remote-video">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="remote-video-element"
            />
            {isConnecting && (
              <div className="call-connecting-overlay">
                <div className="call-pulse-ring" />
                <div className="call-avatar-large">
                  {callPeer?.username?.slice(0, 2).toUpperCase() || '??'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audio call — avatar + waveform */}
        {!isVideoCall && (
          <div className="call-audio-display">
            <div className={`call-avatar-container ${isConnecting ? 'pulsing' : ''}`}>
              <div className="call-pulse-ring" />
              <div className="call-pulse-ring delay-1" />
              <div className="call-avatar-large">
                {callPeer?.username?.slice(0, 2).toUpperCase() || '??'}
              </div>
            </div>
            <div className="call-peer-name">{callPeer?.username || 'Unknown'}</div>
            <div className="call-status-text">
              {isConnecting ? 'Calling...' : formatDuration(callDuration)}
            </div>
            <div className="call-encryption-badge">🔒 Encrypted Call</div>
          </div>
        )}

        {/* Video call info bar */}
        {isVideoCall && (
          <div className="call-info-bar">
            <span className="call-peer-name-small">{callPeer?.username}</span>
            <span className="call-timer">{isConnecting ? 'Connecting...' : formatDuration(callDuration)}</span>
            <span className="call-encryption-badge-small">🔒 E2EE</span>
          </div>
        )}

        {/* Local Video (picture-in-picture) */}
        {isVideoCall && (
          <div className={`call-local-video ${isCameraOff ? 'camera-off' : ''}`}>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="local-video-element"
            />
            {isCameraOff && (
              <div className="camera-off-indicator">
                <span>📷</span>
                <span>Camera Off</span>
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="call-controls">
          <button
            className={`call-control-btn ${isMuted ? 'active' : ''}`}
            onClick={handleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
            type="button"
          >
            <span className="call-control-icon">{isMuted ? '🔇' : '🎤'}</span>
            <span className="call-control-label">{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          {isVideoCall && (
            <button
              className={`call-control-btn ${isCameraOff ? 'active' : ''}`}
              onClick={handleCamera}
              title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
              type="button"
            >
              <span className="call-control-icon">{isCameraOff ? '📷' : '📸'}</span>
              <span className="call-control-label">{isCameraOff ? 'Camera On' : 'Camera Off'}</span>
            </button>
          )}

          <button
            className="call-control-btn end-call"
            onClick={endCall}
            title="End call"
            type="button"
          >
            <span className="call-control-icon">📞</span>
            <span className="call-control-label">End</span>
          </button>
        </div>
      </div>
    </div>
  );
}
