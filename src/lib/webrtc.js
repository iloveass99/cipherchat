/**
 * CipherChat — WebRTC Manager
 * Handles peer-to-peer audio/video connections
 */

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

let peerConnection = null;
let localStream = null;
let remoteStream = null;

/**
 * Create a new RTCPeerConnection
 */
export function createPeerConnection(onIceCandidate, onTrack, onConnectionStateChange) {
  if (peerConnection) {
    closePeerConnection();
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
    if (onConnectionStateChange) {
      onConnectionStateChange(peerConnection.connectionState);
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
 * Start a call — capture media, create offer
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

  return { offer: pc.localDescription, localStream: stream };
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

  return { answer: pc.localDescription, localStream: stream };
}

/**
 * Handle incoming answer (for the caller)
 */
export async function handleAnswer(answer) {
  if (peerConnection) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }
}

/**
 * Handle incoming ICE candidate
 */
export async function handleIceCandidate(candidate) {
  if (peerConnection) {
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
 * Toggle speaker (not widely supported, returns false)
 */
export function toggleSpeaker() {
  // Speaker toggle requires setSinkId which has limited support
  return false;
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
