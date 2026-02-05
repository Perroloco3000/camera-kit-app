import { useCallback, useEffect, useRef, useState } from 'react';
import { bootstrapCameraKit, CameraKitSession, createMediaStreamSource } from '@snap/camera-kit';
import { CAMERA_KIT_CONFIG } from './config';
import './App.css';

// Types
interface Guest {
  id: string;
  name: string;
  color: string;
  particles: ParticleConfig[];
}

interface ParticleConfig {
  emoji: string;
  count: number;
  speed: number;
}

interface Particle {
  x: number;
  y: number;
  speed: number;
  rotation: number;
  rotationSpeed: number;
  emoji: string;
  size: number;
}

const GUESTS: Guest[] = [
  {
    id: 'guest_1',
    name: 'María',
    color: '#FF2D55',
    particles: [
      { emoji: '🌹', count: 8, speed: 1 },
      { emoji: '💖', count: 5, speed: 0.8 }
    ]
  },
  {
    id: 'guest_2',
    name: 'José',
    color: '#007AFF',
    particles: [
      { emoji: '⭐', count: 10, speed: 1.2 },
      { emoji: '✨', count: 8, speed: 0.9 }
    ]
  },
  {
    id: 'guest_3',
    name: 'Pedro',
    color: '#34C759',
    particles: [
      { emoji: '🌿', count: 12, speed: 0.7 },
      { emoji: '🍃', count: 8, speed: 1.1 }
    ]
  },
];

function App() {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<CameraKitSession | null>(null);
  const cameraKitRef = useRef<Awaited<ReturnType<typeof bootstrapCameraKit>> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number | null>(null);

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
  const [recordingTime, setRecordingTime] = useState(0);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  // Initialize particles for guest
  const initializeParticles = useCallback((guest: Guest) => {
    const particles: Particle[] = [];
    const canvas = compositeCanvasRef.current;
    if (!canvas) return particles;

    guest.particles.forEach(config => {
      for (let i = 0; i < config.count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height - canvas.height,
          speed: config.speed + Math.random() * 0.5,
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 2,
          emoji: config.emoji,
          size: 30 + Math.random() * 20
        });
      }
    });
    return particles;
  }, []);

  // Animation loop for composite canvas
  const animateComposite = useCallback(() => {
    const sourceCanvas = canvasRef.current;
    const targetCanvas = compositeCanvasRef.current;
    if (!sourceCanvas || !targetCanvas) return;

    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    // Clear and draw CameraKit canvas
    ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    ctx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);

    // Draw and update particles
    if (scannedGuest) {
      ctx.font = '30px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      particlesRef.current.forEach(particle => {
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate((particle.rotation * Math.PI) / 180);
        ctx.globalAlpha = 0.8;
        ctx.fillText(particle.emoji, 0, 0);
        ctx.restore();

        // Update position
        particle.y += particle.speed;
        particle.rotation += particle.rotationSpeed;

        // Reset if off screen
        if (particle.y > targetCanvas.height + 50) {
          particle.y = -50;
          particle.x = Math.random() * targetCanvas.width;
        }
      });

      // Draw title overlay
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 10;
      ctx.font = 'italic 48px "Great Vibes", cursive';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText('Jardín del Edén', targetCanvas.width / 2, targetCanvas.height - 150);

      ctx.font = '24px "Playfair Display", serif';
      ctx.fillText(`Bienvenido, ${scannedGuest.name}`, targetCanvas.width / 2, targetCanvas.height - 100);
      ctx.restore();
    }

    animationFrameRef.current = requestAnimationFrame(animateComposite);
  }, [scannedGuest]);

  // Core Camera Logic
  const startCamera = useCallback(async () => {
    if (!canvasRef.current || isInitializingRef.current) return;
    isInitializingRef.current = true;
    setIsLoading(true);

    try {
      // Bootstrap CameraKit
      if (!cameraKitRef.current) {
        cameraKitRef.current = await bootstrapCameraKit({
          apiToken: CAMERA_KIT_CONFIG.useStaging
            ? CAMERA_KIT_CONFIG.apiToken.staging
            : CAMERA_KIT_CONFIG.apiToken.production
        });
      }

      // Create Session
      if (!sessionRef.current) {
        sessionRef.current = await cameraKitRef.current.createSession({
          liveRenderTarget: canvasRef.current,
        });
      }
      const session = sessionRef.current;

      // STOP previous stream
      if (currentStreamRef.current) {
        currentStreamRef.current.getTracks().forEach(t => t.stop());
      }

      // Get New Stream (720p)
      const sourceStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      currentStreamRef.current = sourceStream;

      // Attach to CameraKit
      const source = createMediaStreamSource(sourceStream, { cameraType: facingMode });
      await session.setSource(source);
      await session.play();

      // Apply Lens
      const lensId = CAMERA_KIT_CONFIG.lensIds[0];
      await applyLensData(lensId, scannedGuest);

      setIsLoading(false);
    } catch (err) {
      console.error("Camera Init Error:", err);
      setError('Error al iniciar cámara. Verifica los permisos.');
    } finally {
      isInitializingRef.current = false;
    }
  }, [facingMode, scannedGuest]);

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

      const lens = await cameraKitRef.current.lensRepository.loadLens(
        lensId,
        CAMERA_KIT_CONFIG.lensGroupId
      );
      await sessionRef.current.applyLens(lens, launchData);
    } catch (e) {
      console.error("Lens Load Error", e);
    }
  };

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

  // Lifecycle & Deep Link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const guestId = params.get('guest');

    if (guestId) {
      const found = GUESTS.find(g => g.id === guestId);
      if (found) {
        setScannedGuest(found);
      }
    }
  }, []);

  useEffect(() => {
    startCamera();
  }, [startCamera]);

  useEffect(() => {
    if (sessionRef.current && scannedGuest) {
      applyLensData(CAMERA_KIT_CONFIG.lensIds[0], scannedGuest);
      particlesRef.current = initializeParticles(scannedGuest);
    }
  }, [scannedGuest, initializeParticles]);

  // Start composite animation when guest is set
  useEffect(() => {
    if (scannedGuest && compositeCanvasRef.current) {
      animateComposite();
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [scannedGuest, animateComposite]);

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    } else {
      if (!compositeCanvasRef.current) return;
      await ensureAudio();

      const canvasStream = compositeCanvasRef.current.captureStream(30);
      const finalStream = new MediaStream();
      canvasStream.getVideoTracks().forEach(t => finalStream.addTrack(t));
      if (audioStreamRef.current) {
        audioStreamRef.current.getAudioTracks().forEach(t => finalStream.addTrack(t));
      }

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

        recorder.onstop = () => {
          const ext = options.mimeType.includes('mp4') ? 'mp4' : 'webm';
          const blob = new Blob(recordedChunksRef.current, { type: options.mimeType });
          const url = URL.createObjectURL(blob);
          const filename = `El Jardin del Eden.${ext}`;

          // Simple download - no share menu
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        setRecordingTime(0);

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
      {/* Hidden CameraKit canvas */}
      <canvas ref={canvasRef} className="camera-canvas hidden-canvas" />

      {/* Visible composite canvas with effects */}
      <div className="camera-background">
        <canvas ref={compositeCanvasRef} width="1280" height="720" className="camera-canvas" />
      </div>

      <div className="ui-safe-area">
        <div className="top-bar-floating">
          <button className={`glass-btn circular ${facingMode}`} onClick={toggleCamera} aria-label="Cambiar Cámara">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 10v4h4" /><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9 9 9 0 0 1 9 9z" /><path d="M12 7v4" />
              <path d="M17 10l-4-4l-4 4" />
            </svg>
          </button>
        </div>

        {isRecording && (
          <div className="recording-timer fadeIn">
            <div className="rec-dot"></div>
            {formatTime(recordingTime)}
          </div>
        )}

        <div className="bottom-bar-floating">
          <button
            className={`shutter-btn ${isRecording ? 'recording' : ''}`}
            onClick={toggleRecording}
          >
            <div className="shutter-inner"></div>
          </button>
        </div>

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
