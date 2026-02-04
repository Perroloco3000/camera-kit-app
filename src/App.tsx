import { useCallback, useEffect, useRef, useState } from 'react';
import { bootstrapCameraKit, CameraKitSession, createMediaStreamSource } from '@snap/camera-kit';
import { QRCodeSVG } from 'qrcode.react';
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

  // State
  const [selectedGuest, setSelectedGuest] = useState<Guest>(GUESTS[0]);
  const [scannedGuest, setScannedGuest] = useState<Guest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);

  // 1. Camera Initialization
  const initCamera = useCallback(async () => {
    if (!canvasRef.current || isInitializingRef.current || sessionRef.current) return;
    isInitializingRef.current = true;
    setIsLoading(true);

    try {
      if (!cameraKitRef.current) {
        cameraKitRef.current = await bootstrapCameraKit({
          apiToken: CAMERA_KIT_CONFIG.useStaging
            ? CAMERA_KIT_CONFIG.apiToken.staging
            : CAMERA_KIT_CONFIG.apiToken.production
        });
      }

      const session = await cameraKitRef.current.createSession({
        liveRenderTarget: canvasRef.current,
      });
      sessionRef.current = session;

      // Mobile Optimization: Remove strict ideal constraints allow browser to choose best native
      // rendering is handled by Camera Kit's canvas scaling usually
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          // Simplified constraints for speed/compatibility
          width: { ideal: 720 }
        },
        audio: true
      });

      const source = createMediaStreamSource(stream);
      await session.setSource(source);
      await session.play();

      // Load initial lens 
      await loadLens(CAMERA_KIT_CONFIG.lensIds[0], null);

      setIsLoading(false);
    } catch (err) {
      console.error(err);
      setError('Error iniciando cámara. Permite el acceso.');
    } finally {
      isInitializingRef.current = false;
    }
  }, []);

  const loadLens = async (lensId: string, guest: Guest | null) => {
    if (!sessionRef.current || !cameraKitRef.current) return;
    try {
      const launchData = guest ? {
        launchParams: {
          guestName: guest.name,
          guestColor: guest.color,
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

  useEffect(() => {
    initCamera();
  }, [initCamera]);

  // Simulate Scan Logic
  const handleSimulateScan = () => {
    setUiVisible(false); // Hide the overlay
    setScannedGuest(selectedGuest);
    loadLens(CAMERA_KIT_CONFIG.lensIds[0], selectedGuest);
  };

  const handleBack = () => {
    setScannedGuest(null);
    setUiVisible(true); // Show overlay again
  };

  // Recording Logic
  const toggleRecording = () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      if (!canvasRef.current) return;
      const stream = canvasRef.current.captureStream(30);
      const options = { mimeType: 'video/webm' }; // Simplest for mobile
      const recorder = new MediaRecorder(stream, options);
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `guest_ar_${Date.now()}.webm`;
        a.click();
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    }
  };

  // Generate QR Value with simple memo (though unnecessary for this scale, good practice)
  const qrValue = JSON.stringify({ id: selectedGuest.id });

  return (
    <div className="app-container">

      {/* Layer 0: Camera (Always visible, full screen) */}
      <div className="camera-background">
        <canvas ref={canvasRef} className="camera-canvas" />
      </div>

      {/* Layer 1: UI Overlay (Guest Selection) */}
      {uiVisible && (
        <div className="ui-overlay fadeIn">
          <div className="card-glass">
            <header>
              <h2>Bienvenido</h2>
              <p>Selecciona tu perfil de invitado</p>
            </header>

            <div className="guest-scroller">
              {GUESTS.map(g => (
                <button
                  key={g.id}
                  className={`guest-chip ${selectedGuest.id === g.id ? 'selected' : ''}`}
                  onClick={() => setSelectedGuest(g)}
                  style={{
                    background: selectedGuest.id === g.id ? g.color : 'rgba(255,255,255,0.1)',
                    color: selectedGuest.id === g.id ? '#000' : '#FFF'
                  }}
                >
                  {g.name}
                </button>
              ))}
            </div>

            <div className="qr-preview">
              <QRCodeSVG value={qrValue} size={140} bgColor={"#ffffff"} fgColor={"#000000"} />
            </div>

            <button className="cta-button" onClick={handleSimulateScan}>
              Escanear Pase AR
            </button>
          </div>
        </div>
      )}

      {/* Layer 2: AR Controls (Once scanned) */}
      {!uiVisible && scannedGuest && (
        <div className="ar-controls fadeIn">
          <div className="top-bar">
            <button className="icon-btn" onClick={handleBack}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <div className="guest-badge" style={{ backgroundColor: scannedGuest.color }}>
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

      {/* Loading / Error Feedback */}
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
