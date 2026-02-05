import { useCallback, useEffect, useRef, useState } from 'react';
import { bootstrapCameraKit, CameraKitSession, createMediaStreamSource } from '@snap/camera-kit';
import { CAMERA_KIT_CONFIG } from './config';
import './App.css';

// Types
interface Guest {
  id: string;
  name: string;
  color: string; // Hex color
}

const GUESTS: Guest[] = [
  { id: 'guest_1', name: 'María', color: '#FF4081' },
  { id: 'guest_2', name: 'José', color: '#448AFF' },
  { id: 'guest_3', name: 'Pedro', color: '#69F0AE' },
];

function App() {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<CameraKitSession | null>(null);
  const cameraKitRef = useRef<Awaited<ReturnType<typeof bootstrapCameraKit>> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const isInitializingRef = useRef(false);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // State
  const [scannedGuest, setScannedGuest] = useState<Guest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isScanning, setIsScanning] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment"); // Default to Back camera for events

  // 1. Camera Initialization
  const initCamera = useCallback(async () => {
    if (!canvasRef.current || isInitializingRef.current) return;
    isInitializingRef.current = true;
    setIsLoading(true);

    try {
      // 1. Bootstrap (Singleton)
      if (!cameraKitRef.current) {
        cameraKitRef.current = await bootstrapCameraKit({
          apiToken: CAMERA_KIT_CONFIG.useStaging
            ? CAMERA_KIT_CONFIG.apiToken.staging
            : CAMERA_KIT_CONFIG.apiToken.production
        });
      }

      // 2. Session creation (Single session reuse if possible, or recreate if source changes often?)
      // Best practice: Reuse session, just switch source.
      if (!sessionRef.current) {
        sessionRef.current = await cameraKitRef.current.createSession({
          liveRenderTarget: canvasRef.current,
        });
      }
      const session = sessionRef.current;

      // 3. Media Stream (Microphone handled separately for recording to avoid echo/issues)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 } // Relaxed constant
        },
        audio: false
      });

      // 4. Attach Source
      const source = createMediaStreamSource(stream, { cameraType: facingMode });
      await session.setSource(source);
      await session.play();

      // 5. Load Lens (if first time or just ensuring it's there)
      // If we already have a scanned guest, ensure launch data is re-applied?
      // Actually, applyLens might need to be re-run if we switched camera? 
      // CameraKit usually handles this, but let's re-apply to be safe or just let it be.
      // IF we are just switching camera, just switching source is usually enough, but 
      // sometimes effects reset. Let's ensure the lens is applied with current state.
      if (scannedGuest) {
        await loadLens(CAMERA_KIT_CONFIG.lensIds[0], scannedGuest);
      } else {
        await loadLens(CAMERA_KIT_CONFIG.lensIds[0], null);
      }

      setIsLoading(false);
    } catch (err) {
      console.error(err);
      setError('Error iniciando cámara.');
    } finally {
      isInitializingRef.current = false;
    }
  }, [facingMode]); // Re-run when facingMode changes

  // 2. Audio Validation
  const ensureAudio = async () => {
    if (!audioStreamRef.current) {
      try {
        audioStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        console.warn("No audio access", e);
      }
    }
    return audioStreamRef.current;
  };

  const loadLens = async (lensId: string, guest: Guest | null) => {
    if (!sessionRef.current || !cameraKitRef.current) return;
    try {
      const launchData = guest ? {
        launchParams: {
          guestName: guest.name,
          guestColor: guest.color,
          welcomeMessage: `Bienvenido al Jardín del Edén ${guest.name}`,
          name: guest.name,
          color: guest.color
        }
      } : undefined;

      const lens = await cameraKitRef.current.lensRepository.loadLens(
        lensId,
        CAMERA_KIT_CONFIG.lensGroupId
      );

      await sessionRef.current.applyLens(lens, launchData);
    } catch (e) {
      console.error("Error loading lens:", e);
    }
  };

  // Deep Linking Check
  useEffect(() => {
    const init = async () => {
      // Check URL for ?guest=ID
      const params = new URLSearchParams(window.location.search);
      const guestId = params.get('guest');

      if (guestId) {
        const found = GUESTS.find(g => g.id === guestId);
        if (found) {
          // Auto-login
          setScannedGuest(found);
          setIsScanning(false);
          // lens load will happen in initCamera or useEffect below depending on timing
          // forcing it here slightly later to ensure session exists:
        }
      }
      await initCamera();
    };
    init();
  }, [initCamera]);
  // initCamera dependency includes facingMode, so it handles "change camera" re-init.
  // The deep link check should only happen ONCE ideally, but inside useEffect it's fine 
  // as scanning state will persist.

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const handleBack = () => {
    setScannedGuest(null);
    setIsScanning(true);

    // Clear URL param without reloading
    const url = new URL(window.location.href);
    url.searchParams.delete('guest');
    window.history.replaceState({}, '', url);

    loadLens(CAMERA_KIT_CONFIG.lensIds[0], null);
  };

  // Recording Logic
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      if (!canvasRef.current) return;

      await ensureAudio();

      const canvasStream = canvasRef.current.captureStream(30);
      const finalStream = new MediaStream();

      // Add Video
      canvasStream.getVideoTracks().forEach(track => finalStream.addTrack(track));

      // Add Audio
      if (audioStreamRef.current) {
        audioStreamRef.current.getAudioTracks().forEach(track => finalStream.addTrack(track));
      }

      const options = { mimeType: 'video/webm' };
      const recorder = new MediaRecorder(finalStream, options);
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jardin_eden_${Date.now()}.webm`;
        a.click();
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    }
  };

  return (
    <div className="app-container">
      {/* Layer 0: Camera */}
      <div className="camera-background">
        <canvas ref={canvasRef} className="camera-canvas" />
      </div>

      {/* Camera Toggle (Always Visible or just in Scan/AR? Recommended Always) */}
      <div className="global-controls">
        <button className="icon-btn toggle-cam" onClick={toggleCamera}>
          📷 🔄
        </button>
      </div>

      {/* Layer 1: Scanning UI (Only if not deep linked/scanned) */}
      {isScanning && (
        <div className="scan-overlay fadeIn">
          <div className="scan-reticle">
            <div className="corner tl"></div>
            <div className="corner tr"></div>
            <div className="corner bl"></div>
            <div className="corner br"></div>
          </div>

          <div className="scan-hint">
            <h2>Escanea tu invitación</h2>
            <p>Busca el código QR para entrar al Jardín</p>
          </div>
        </div>
      )}

      {/* Layer 2: AR Experience */}
      {!isScanning && scannedGuest && (
        <div className="ar-controls fadeIn">
          <div className="top-bar">
            <button className="icon-btn" onClick={handleBack}>
              Volver
            </button>
            <div className="guest-badge" style={{ background: scannedGuest.color }}>
              {scannedGuest.name}
            </div>
          </div>

          <div className="bottom-bar">
            <button
              className={`record-trigger ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
            >
              <div className="trigger-inner"></div>
            </button>
          </div>
        </div>
      )}

      {(isLoading || error) && (
        <div className="status-overlay">
          {isLoading && <div className="spinner"></div>}
          {error && <div className="error-toast">{error}</div>}
        </div>
      )}
    </div>
  );
}

export default App;
