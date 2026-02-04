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
  { id: 'guest_1', name: 'María', color: '#FF4081' }, // Pink
  { id: 'guest_2', name: 'José', color: '#448AFF' },  // Blue
  { id: 'guest_3', name: 'Pedro', color: '#69F0AE' }, // Green
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

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 1280, height: 720 },
        audio: true // Audio for recording
      });

      const source = createMediaStreamSource(stream);
      await session.setSource(source);
      await session.play();

      // Load initial lens without customization
      await loadLens(CAMERA_KIT_CONFIG.lensIds[0], null);

      setIsLoading(false);
    } catch (err) {
      console.error(err);
      setError('Error iniciando cámara');
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
    setScannedGuest(selectedGuest);
    loadLens(CAMERA_KIT_CONFIG.lensIds[0], selectedGuest);
  };

  const handleBack = () => {
    setScannedGuest(null);
    // Optional: reload lens without guest data if desired, 
    // but usually keeping the last state is fine or resetting:
    // loadLens(CAMERA_KIT_CONFIG.lensIds[0], null); 
  };

  // Recording Logic
  const startRecording = () => {
    if (!canvasRef.current) return;
    try {
      const stream = canvasRef.current.captureStream(30);
      const options = { mimeType: 'video/webm' };
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
    } catch (e) {
      console.error("Recording failed", e);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  // Generate QR Value
  const qrValue = JSON.stringify({
    id: selectedGuest.id,
    name: selectedGuest.name,
    timestamp: Date.now()
  });

  return (
    <div className={`split-container ${scannedGuest ? 'full-screen-mode' : ''}`}>

      {/* Panel 1: Controls & Guest Selection */}
      <div className={`control-panel ${scannedGuest ? 'hidden' : ''}`}>
        <h1>Event Check-In</h1>
        <p>Selecciona un invitado para generar su pase AR.</p>

        <div className="guest-selector">
          {GUESTS.map(g => (
            <button
              key={g.id}
              className={`guest-card ${selectedGuest.id === g.id ? 'active' : ''}`}
              onClick={() => setSelectedGuest(g)}
              style={{ borderColor: selectedGuest.id === g.id ? g.color : 'transparent' }}
            >
              <div className="avatar" style={{ background: g.color }}>
                {g.name[0]}
              </div>
              <span>{g.name}</span>
            </button>
          ))}
        </div>

        <div className="qr-section">
          <div className="qr-code-box">
            <QRCodeSVG value={qrValue} size={180} />
          </div>
          <p className="qr-hint">Escanea este código o simula el escaneo</p>
        </div>

        <button className="simulate-btn" onClick={handleSimulateScan}>
          Simular Escaneo &rarr;
        </button>
      </div>

      {/* Panel 2: AR View */}
      <div className={`ar-panel ${scannedGuest ? 'full-screen' : ''}`}>
        <canvas ref={canvasRef} className="ar-canvas" />

        {/* Overlay Info (Only during selection or initial loading) */}
        {!scannedGuest && (
          <div className="ar-overlay">
            {isLoading && <div className="loader">Iniciando AR...</div>}
            {error && <div className="error-msg">{error}</div>}
          </div>
        )}

        {/* Full Screen Controls */}
        {scannedGuest && (
          <div className="fs-controls">
            <button className="icon-btn back-btn" onClick={handleBack}>
              &larr; Volver
            </button>

            <div className="scan-confirmation-fs" style={{ borderColor: scannedGuest.color }}>
              <span style={{ color: scannedGuest.color }}>HOLA {scannedGuest.name.toUpperCase()}</span>
            </div>

            <button
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
            >
              <div className="inner-dot"></div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
