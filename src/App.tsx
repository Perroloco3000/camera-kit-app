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
  const isInitializingRef = useRef(false);

  // State
  const [selectedGuest, setSelectedGuest] = useState<Guest>(GUESTS[0]);
  const [scannedGuest, setScannedGuest] = useState<Guest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

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
        video: { facingMode: 'user', width: 1280, height: 720 }
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
      // Prepare launch data if a guest is "scanned"
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

  // Generate QR Value
  const qrValue = JSON.stringify({
    id: selectedGuest.id,
    name: selectedGuest.name,
    timestamp: Date.now()
  });

  return (
    <div className="split-container">
      {/* Panel 1: Controls & Guest Selection */}
      <div className="control-panel">
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
      <div className="ar-panel">
        <canvas ref={canvasRef} className="ar-canvas" />

        {/* Overlay Info */}
        <div className="ar-overlay">
          {isLoading && <div className="loader">Iniciando AR...</div>}
          {!isLoading && scannedGuest && (
            <div className="scan-confirmation" style={{ color: scannedGuest.color }}>
              <span className="scanned-badge">PAS VALIDADO</span>
              <h2>Hola, {scannedGuest.name}</h2>
            </div>
          )}
        </div>

        {error && <div className="error-msg">{error}</div>}
      </div>
    </div>
  );
}

export default App;
