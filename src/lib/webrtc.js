/**
 * CipherChat — WebRTC Manager
 * Handles peer-to-peer audio/video connections
 */

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
];

let peerConnection = null;
let localStream = null;
let remoteStream = null;

/**
 * Create a new RTCPeerConnection
 */
export function createPeerConnection(onIceCandidate, onTrack, onConnectionStateChange) {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && onIceCandidate) {
      onIceCandidate(event.candidate);
    }
  };

  peerConnection.ontrack = (event) => {
    remoteStream = event.streams[0];
    if (onTrack) {
      onTrack(remoteStream);
    }
  };

  peerConnection.onconnectionstatechange = () => {
    if (onConnectionStateChange && peerConnection) {
      onConnectionStateChange(peerConnection.connectionState);
    }
  };

  // Also listen for ICE connection state changes (more reliable than connectionState)
  peerConnection.oniceconnectionstatechange = () => {
    if (peerConnection) {
      console.log('ICE connection state:', peerConnection.iceConnectionState);
      if (peerConnection.iceConnectionState === 'connected' || 
          peerConnection.iceConnectionState === 'completed') {
        if (onConnectionStateChange) {
          onConnectionStateChange('connected');
        }
      } else if (peerConnection.iceConnectionState === 'failed' ||
                 peerConnection.iceConnectionState === 'disconnected') {
        if (onConnectionStateChange) {
          onConnectionStateChange(peerConnection.iceConnectionState);
        }
      }
    }
  };

  return peerConnection;
}

/**
 * Capture local media (audio and/or video)
 */
export async function captureLocalMedia(callType) {
  const constraints = {
    audio: true,
    video: callType === 'video' ? { width: 1280, height: 720, facingMode: 'user' } : false,
  };

  try {
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    return localStream;
  } catch (err) {
    console.error('Error capturing media:', err);
    throw new Error(
      err.name === 'NotAllowedError'
        ? 'Camera/microphone permission denied. Please allow access and try again.'
        : 'Could not access camera/microphone.'
    );
  }
}

/**
 * Start a call — capture media, create peer connection, create offer
 * Returns the peer connection, offer, and local stream
 */
export async function startCall(callType, onIceCandidate, onTrack, onConnectionStateChange) {
  const stream = await captureLocalMedia(callType);
  const pc = createPeerConnection(onIceCandidate, onTrack, onConnectionStateChange);

  // Add local tracks to peer connection
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
  }

  // Create and set local offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  return { offer: pc.localDescription, localStream: stream, peerConnection: pc };
}

/**
 * Answer a call — capture media, process offer, create answer
 */
export async function answerCall(offer, callType, onIceCandidate, onTrack, onConnectionStateChange) {
  const stream = await captureLocalMedia(callType);
  const pc = createPeerConnection(onIceCandidate, onTrack, onConnectionStateChange);

  // Add local tracks
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
  }

  // Set remote offer and create answer
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  return { answer: pc.localDescription, localStream: stream, peerConnection: pc };
}

/**
 * Handle incoming answer (for the caller)
 */
export async function handleAnswer(answer) {
  if (peerConnection && peerConnection.signalingState !== 'closed') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }
}

/**
 * Handle incoming ICE candidate
 */
export async function handleIceCandidate(candidate) {
  if (peerConnection && peerConnection.signalingState !== 'closed') {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  }
}

/**
 * Toggle local audio mute
 */
export function toggleMute() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled; // returns true if muted
    }
  }
  return false;
}

/**
 * Toggle local camera
 */
export function toggleCamera() {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled; // returns true if camera off
    }
  }
  return false;
}

/**
 * Start screen sharing — replaces video track on the peer connection
 * @param {function} onEnded - Callback when screen sharing stops (e.g., browser "Stop sharing")
 * @returns {{ screenStream: MediaStream }} The captured screen stream
 */
export async function startScreenShare(onEnded) {
  if (!peerConnection) {
    throw new Error('No active peer connection');
  }

  try {
    const screenStream = new MediaStream();
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always', width: 1920, height: 1080 },
      audio: false,
    });

    const screenTrack = displayStream.getVideoTracks()[0];
    screenStream.addTrack(screenTrack);

    // Listen for the browser's native "Stop sharing" button
    screenTrack.addEventListener('ended', () => {
      if (onEnded) onEnded();
    });

    // Replace the existing video track on the peer connection sender
    const videoSender = peerConnection.getSenders().find(
      (s) => s.track?.kind === 'video'
    );

    if (videoSender) {
      await videoSender.replaceTrack(screenTrack);
    } else {
      // Audio-only call — add the screen track as a new sender
      peerConnection.addTrack(screenTrack, displayStream);
    }

    return { screenStream };
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Screen sharing permission denied.');
    }
    throw new Error('Could not start screen sharing.');
  }
}

/**
 * Stop screen sharing — restores the camera video track (or removes video for audio-only)
 * @param {MediaStream} screenStream - The screen stream to stop
 */
export async function stopScreenShare(screenStream) {
  if (!peerConnection) return;

  // Stop screen tracks
  if (screenStream) {
    for (const track of screenStream.getTracks()) {
      track.stop();
    }
  }

  // Restore original camera track
  const videoSender = peerConnection.getSenders().find(
    (s) => s.track?.kind === 'video' || (s.track === null && s._kind === 'video')
  );

  if (videoSender && localStream) {
    const cameraTrack = localStream.getVideoTracks()[0];
    if (cameraTrack) {
      await videoSender.replaceTrack(cameraTrack);
    }
  }
}

/**
 * End call and cleanup
 */
export function closePeerConnection() {
  if (localStream) {
    for (const track of localStream.getTracks()) {
      track.stop();
    }
    localStream = null;
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  remoteStream = null;
}

/**
 * Get current peer connection
 */
export function getPeerConnection() {
  return peerConnection;
}

/**
 * Get local stream ref
 */
export function getLocalStream() {
  return localStream;
}

/**
 * Get remote stream ref
 */
export function getRemoteStream() {
  return remoteStream;
}
