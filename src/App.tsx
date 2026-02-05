import { useCallback, useEffect, useRef, useState } from 'react';
import { bootstrapCameraKit, CameraKitSession, createMediaStreamSource } from '@snap/camera-kit';
import { CAMERA_KIT_CONFIG } from './config';
import './App.css';

// Types
interface Guest {
  id: string;
  name: string;
  color: string;
}

const GUESTS: Guest[] = [
  { id: 'guest_1', name: 'María', color: '#FF2D55' }, // Pink-Red (Pro vibe)
  { id: 'guest_2', name: 'José', color: '#007AFF' },  // iOS Blue
  { id: 'guest_3', name: 'Pedro', color: '#34C759' }, // iOS Green
];

function App() {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<CameraKitSession | null>(null);
  const cameraKitRef = useRef<Awaited<ReturnType<typeof bootstrapCameraKit>> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Track current stream to stop it properly on toggle
  const currentStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const isInitializingRef = useRef(false);
  const timerIntervalRef = useRef<number | null>(null);

  // State
  const [scannedGuest, setScannedGuest] = useState<Guest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0); // Seconds
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user"); // Start with Front camera (Selfie mode is better for "iPhone style" demos initially, or Environment?) User asked for toggle. 
  // User said "Start only allowing to scan QR" was the OLD behavior to remove.
  // Now we just start the camera. Defaulting to front ('user') is usually more engaging for AR filters, 
  // but if they are scanning the environment, 'environment' is better. 
  // Let's default to 'user' as it's an "Event" app (Selfies).

  // 1. Core Camera Logic
  const startCamera = useCallback(async () => {
    if (!canvasRef.current || isInitializingRef.current) return;
    isInitializingRef.current = true;
    setIsLoading(true);

    try {
      // Bootstrap CameraKit (Singleton)
      if (!cameraKitRef.current) {
        cameraKitRef.current = await bootstrapCameraKit({
          apiToken: CAMERA_KIT_CONFIG.useStaging
            ? CAMERA_KIT_CONFIG.apiToken.staging
            : CAMERA_KIT_CONFIG.apiToken.production
        });
      }

      // Create Session if needed
      if (!sessionRef.current) {
        sessionRef.current = await cameraKitRef.current.createSession({
          liveRenderTarget: canvasRef.current,
        });
      }
      const session = sessionRef.current;

      // STOP previous stream if exists (Crucial for Toggle to work)
      if (currentStreamRef.current) {
        currentStreamRef.current.getTracks().forEach(t => t.stop());
      }

      // Get New Stream (720p HD for performance/compatibility)
      // "Pro" tip: 4K is too heavy for many mobile browsers/devices (Redmi 13C). 
      // 720p is the sweet spot for WebAR fluidity.
      const sourceStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 }, // 720p
          height: { ideal: 720 }
        },
        audio: false // Audio handled separately
      });
      currentStreamRef.current = sourceStream;

      // Attach to CameraKit
      const source = createMediaStreamSource(sourceStream, { cameraType: facingMode });
      await session.setSource(source);
      await session.play();

      // Ensure functionality (Lens)
      const lensId = CAMERA_KIT_CONFIG.lensIds[0];
      // Note: We don't re-load the lens every toggle, but we must ensure it's applied.
      // If we have a guest, apply with guest data.
      await applyLensData(lensId, scannedGuest);

      setIsLoading(false);
    } catch (err) {
      console.error("Camera Init Error:", err);
      // Fallback: if 4K fails, maybe try lower res? (Browser usually handles 'ideal' gracefully)
      // Permissions error is most common.
      setError('Error al iniciar cámara. Verifica los permisos.');
    } finally {
      isInitializingRef.current = false;
    }
  }, [facingMode]); // Re-run when facing mode changes

  // Helper to apply lens
  const applyLensData = async (lensId: string, guest: Guest | null) => {
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

      // Check if lens is already active? 
      // CameraKit v1.13: session.lenses.activeLens... 
      // Safer to just re-apply or simple-load. 
      const lens = await cameraKitRef.current.lensRepository.loadLens(
        lensId,
        CAMERA_KIT_CONFIG.lensGroupId
      );
      await sessionRef.current.applyLens(lens, launchData);
    } catch (e) {
      console.error("Lens Load Error", e);
    }
  };

  // 2. Audio Validation (Lazy load on record)
  const ensureAudio = async () => {
    if (!audioStreamRef.current) {
      try {
        audioStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        console.warn("Audio permissions denied", e);
      }
    }
    return audioStreamRef.current;
  };

  // 3. Lifecycle & Deep Link
  useEffect(() => {
    // Check URL URLSearchParams on mount
    const params = new URLSearchParams(window.location.search);
    const guestId = params.get('guest');

    // Set guest IMMEIDATELY if found, so first render is correct
    if (guestId) {
      const found = GUESTS.find(g => g.id === guestId);
      if (found) {
        setScannedGuest(found);
        // We don't need to call ApplyLens here, startCamera will pick up 'scannedGuest' state
        // mostly. Wait, startCamera is async/effect.
        // Due to closure staleness, startCamera might see old 'scannedGuest' if not in dep array.
        // We will fix this by passing guest explicitly to logic or using ref.
      }
    }
  }, []); // Run once on mount

  // Effect to manage camera when facingMode OR scannedGuest changes?
  // Actually, we only want to restart camera when facingMode changes.
  // When scannedGuest changes (found in URL), we just want to apply lens, not restart camera.
  // But for the initial load, initCamera does both.
  useEffect(() => {
    startCamera();
  }, [startCamera]); // startCamera depends on facingMode

  // Separate effect: If guest changes (e.g. late discovery), re-apply lens WITHOUT restarting camera
  useEffect(() => {
    if (sessionRef.current && scannedGuest) {
      applyLensData(CAMERA_KIT_CONFIG.lensIds[0], scannedGuest);
    }
  }, [scannedGuest]);


  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const toggleRecording = async () => {
    if (isRecording) {
      // Stop
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    } else {
      // Start
      if (!canvasRef.current) return;
      await ensureAudio();

      const canvasStream = canvasRef.current.captureStream(30);
      const finalStream = new MediaStream();
      canvasStream.getVideoTracks().forEach(t => finalStream.addTrack(t));
      if (audioStreamRef.current) {
        audioStreamRef.current.getAudioTracks().forEach(t => finalStream.addTrack(t));
      }

      // Try MP4 first for better compatibility, then VP9 (High Quality), then default
      // Safari iOS 14.5+ supports mp4 recording
      let options = { mimeType: 'video/webm' };
      if (MediaRecorder.isTypeSupported('video/mp4')) {
        options = { mimeType: 'video/mp4' };
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        options = { mimeType: 'video/webm;codecs=vp9' };
      }

      try {
        const recorder = new MediaRecorder(finalStream, options);
        recordedChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          const ext = options.mimeType.includes('mp4') ? 'mp4' : 'webm';
          const blob = new Blob(recordedChunksRef.current, { type: options.mimeType });
          const url = URL.createObjectURL(blob);
          const filename = `El Jardin del Eden.${ext}`;

          // Try Web Share API for mobile (allows saving to gallery more easily)
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
          if (isMobile && navigator.share) {
            try {
              const file = new File([blob], filename, { type: options.mimeType });
              await navigator.share({
                files: [file],
                title: 'Jardín del Edén',
                text: 'Video del evento'
              });
              return; // Success - user can save from share menu
            } catch (err) {
              // User cancelled or share failed, fallback to download
              console.log('Share cancelled, downloading instead');
            }
          }

          // Fallback: Download file
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          // Show helpful instructions for mobile users
          if (isMobile) {
            setTimeout(() => {
              const msg = /iPhone|iPad|iPod/i.test(navigator.userAgent)
                ? '📱 Video descargado!\n\nPara guardarlo en Fotos:\n1. Abre la app "Archivos"\n2. Ve a "Descargas"\n3. Mantén presionado el video\n4. Toca "Guardar en Fotos"'
                : '📱 Video descargado!\n\nEncuéntralo en:\n"Descargas" o "Mis Archivos"\n\nPara moverlo a Galería, ábrelo y toca "Guardar" o "Compartir"';
              alert(msg);
            }, 500);
          }
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        setRecordingTime(0);

        // Timer Logic
        timerIntervalRef.current = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000) as unknown as number;

      } catch (e) {
        console.error("Recording error", e);
        setError("Error al iniciar grabación");
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="app-container">
      {/* Layer 0: Camera Feed */}
      <div className="camera-background">
        <canvas ref={canvasRef} className="camera-canvas" />
      </div>

      {/* UI Overlay - iPhone 17 Style (Ultra Minimal) */}
      <div className="ui-safe-area">

        {/* Theme Overlay: Jardín del Edén (Always visible for theme) */}
        <div className="flower-overlay">
          {/* Falling Petals Effect - More dynamic than static corners */}
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={`petal p-${i}`}>🌸</div>
          ))}
          <div className="flower-corner f-tl">🌹</div>
          <div className="flower-corner f-br">🌹</div>
        </div>

        {/* Top Bar: Controls */}
        <div className="top-bar-floating">
          {/* Cam Toggle */}
          <button className={`glass-btn circular ${facingMode}`} onClick={toggleCamera} aria-label="Cambiar Cámara">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 10v4h4" /><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9 9 9 9 0 0 1 9-9 9 9 0 0 1 9 9z" /><path d="M12 7v4" />
              <path d="M17 10l-4-4l-4 4" />
            </svg>
          </button>


          {/* Guest Filter Title (Centered, Elegant) */}
          {scannedGuest && (
            <div className="filter-title-container fadeIn">
              <h1 className="filter-title">Jardín del Edén</h1>
              <div className="filter-subtitle">Bienvenido, {scannedGuest.name}</div>
            </div>
          )}
        </div>


        {/* Timer Display (Visible when recording) */}
        {isRecording && (
          <div className="recording-timer fadeIn">
            <div className="rec-dot"></div>
            {formatTime(recordingTime)}
          </div>
        )}

        {/* Bottom Bar: Recording */}
        <div className="bottom-bar-floating">
          <button
            className={`shutter-btn ${isRecording ? 'recording' : ''}`}
            onClick={toggleRecording}
          >
            <div className="shutter-inner"></div>
          </button>
        </div>

        {/* Loading / Error */}
        {(isLoading || error) && (
          <div className="status-center">
            {isLoading && <div className="apple-loader"></div>}
            {error && <div className="error-msg">{error}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
