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
  z: number; // Depth (0 = far, 1 = close)
  speed: number;
  rotation: number;
  rotationSpeed: number;
  rotationX: number; // 3D rotation
  rotationY: number;
  rotationSpeedX: number;
  rotationSpeedY: number;
  emoji: string;
  size: number;
  opacity: number;
  life: number; // 0 to 1
  maxLife: number;
  windOffsetX: number;
  windOffsetY: number;
}

const GUESTS: Guest[] = [
  {
    id: 'guest_1',
    name: 'María',
    color: '#FF2D55',
    particles: [
      { emoji: '🌹', count: 15, speed: 0.8 },
      { emoji: '💖', count: 10, speed: 0.6 },
      { emoji: '✨', count: 8, speed: 1.0 }
    ]
  },
  {
    id: 'guest_2',
    name: 'Pedro',
    color: '#FFD700',
    particles: [
      { emoji: '⭐', count: 12, speed: 1.0 },
      { emoji: '💫', count: 10, speed: 0.9 },
      { emoji: '✨', count: 8, speed: 1.2 }
    ]
  },
  {
    id: 'guest_3',
    name: 'Yanis',
    color: '#34C759',
    particles: [
      { emoji: '🌿', count: 15, speed: 0.7 },
      { emoji: '🍃', count: 12, speed: 0.9 },
      { emoji: '🌱', count: 8, speed: 0.8 }
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
  const timeRef = useRef<number>(0);

  // Track current stream to stop it properly on toggle
  const currentStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const isInitializingRef = useRef(false);
  const timerIntervalRef = useRef<number | null>(null);

  // State
  const [isLanding, setIsLanding] = useState(true);
  const [scannedGuest, setScannedGuest] = useState<Guest | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Only loading when camera starts
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  // Initialize particles for guest with realistic physics
  const initializeParticles = useCallback((guest: Guest, isLush = false) => {
    const particles: Particle[] = [];
    const canvas = compositeCanvasRef.current;
    if (!canvas) return particles;

    const densityMultiplier = isLush ? 3 : 1;

    guest.particles.forEach(config => {
      const count = Math.floor(config.count * densityMultiplier);
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height - (isLush ? canvas.height * 2 : canvas.height),
          z: Math.random(), // Random depth
          speed: config.speed + Math.random() * 0.5,
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 3,
          rotationX: Math.random() * 360,
          rotationY: Math.random() * 360,
          rotationSpeedX: (Math.random() - 0.5) * 2,
          rotationSpeedY: (Math.random() - 0.5) * 2,
          emoji: config.emoji,
          size: 25 + Math.random() * 25,
          opacity: 0,
          life: 0,
          maxLife: (isLush ? 5 : 3) + Math.random() * 3,
          windOffsetX: 0,
          windOffsetY: 0
        });
      }
    });
    return particles;
  }, []);



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

  const handleComenzar = useCallback(() => {
    setIsLanding(false);
    startCamera().catch(err => {
      console.error('Camera start failed:', err);
      setError('No se pudo iniciar la cámara. Por favor, permite el acceso.');
      setIsLoading(false);
    });
  }, [startCamera]);

  // Animation loop for composite canvas with realistic physics
  const animateComposite = useCallback(() => {
    const sourceCanvas = canvasRef.current;
    const targetCanvas = compositeCanvasRef.current;
    if (!targetCanvas) return;

    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    // Update time
    timeRef.current += 0.016; // ~60fps
    const time = timeRef.current;

    // Clear and draw CameraKit canvas (only if active)
    ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

    if (!isLanding && sourceCanvas && sourceCanvas.width > 0) {
      // Mirror front camera for natural selfie feel
      if (facingMode === 'user') {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(sourceCanvas, -targetCanvas.width, 0, targetCanvas.width, targetCanvas.height);
        ctx.restore();
      } else {
        ctx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
      }
    }

    // Wind simulation
    const windX = Math.sin(time * 0.5) * 15;
    const windY = Math.cos(time * 0.3) * 8;

    // Draw and update particles with realistic physics
    // If no guest is scanned (like on landing), show a default 'garden' effect
    const activeGuest = scannedGuest || {
      name: 'Jardín',
      color: '#34C759',
      particles: [
        { emoji: '🌸', count: 12, speed: 0.5 },
        { emoji: '🌿', count: 12, speed: 0.4 },
        { emoji: '✨', count: 8, speed: 0.6 },
        { emoji: '🌺', count: 10, speed: 0.55 },
        { emoji: '🌷', count: 8, speed: 0.45 },
        { emoji: '🌻', count: 6, speed: 0.7 }
      ]
    };

    // Ensure particles are initialized if they are empty (for landing)
    if (particlesRef.current.length === 0) {
      particlesRef.current = initializeParticles(activeGuest as Guest);
    }

    if (particlesRef.current.length > 0) {
      particlesRef.current.forEach(particle => {
        // Update lifecycle
        particle.life += 0.016;
        const lifeRatio = particle.life / particle.maxLife;

        // Fade in/out
        if (lifeRatio < 0.1) {
          particle.opacity = lifeRatio * 10;
        } else if (lifeRatio > 0.9) {
          particle.opacity = (1 - lifeRatio) * 10;
        } else {
          particle.opacity = 1;
        }

        // Physics simulation
        const gravity = 0.3;
        const turbulence = Math.sin(time + particle.x * 0.01) * 2;

        particle.windOffsetX += (windX - particle.windOffsetX) * 0.05;
        particle.windOffsetY += (windY - particle.windOffsetY) * 0.05;

        particle.y += particle.speed + gravity;
        particle.x += particle.windOffsetX * 0.1 + turbulence;

        // 3D rotation
        particle.rotation += particle.rotationSpeed;
        particle.rotationX += particle.rotationSpeedX;
        particle.rotationY += particle.rotationSpeedY;

        // Depth-based scaling
        const depthScale = 0.5 + particle.z * 0.5;
        const finalSize = particle.size * depthScale;
        const finalOpacity = particle.opacity * (0.6 + particle.z * 0.4);

        // Draw shadow
        ctx.save();
        ctx.globalAlpha = finalOpacity * 0.3;
        ctx.filter = 'blur(4px)';
        ctx.translate(particle.x + 3, particle.y + 3);
        ctx.rotate((particle.rotation * Math.PI) / 180);
        ctx.font = `${finalSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000000';
        ctx.fillText(particle.emoji, 0, 0);
        ctx.restore();

        // Draw particle with glow
        ctx.save();
        ctx.globalAlpha = finalOpacity;

        // Glow effect
        ctx.shadowColor = activeGuest.color;
        ctx.shadowBlur = 15 * depthScale;

        ctx.translate(particle.x, particle.y);
        ctx.rotate((particle.rotation * Math.PI) / 180);

        // 3D perspective effect
        const perspective = Math.cos((particle.rotationY * Math.PI) / 180);
        ctx.scale(Math.abs(perspective), 1);

        ctx.font = `${finalSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(particle.emoji, 0, 0);
        ctx.restore();

        // Reset if off screen
        if (particle.y > targetCanvas.height + 50 || particle.life >= particle.maxLife) {
          particle.y = -50;
          particle.x = Math.random() * targetCanvas.width;
          particle.z = Math.random();
          particle.life = 0;
          particle.rotation = Math.random() * 360;
          particle.rotationX = Math.random() * 360;
          particle.rotationY = Math.random() * 360;
        }
      });

      // Draw elegant text overlay if guest is scanned
      if (scannedGuest) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 4;

        // Title
        ctx.font = 'italic 56px "Great Vibes", cursive, serif';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = scannedGuest.color;
        ctx.lineWidth = 2;
        ctx.textAlign = 'center';

        const titleY = targetCanvas.height - 150;
        ctx.strokeText('Jardín del Edén', targetCanvas.width / 2, titleY);
        ctx.fillText('Jardín del Edén', targetCanvas.width / 2, titleY);

        // Guest name with glow
        ctx.shadowColor = scannedGuest.color;
        ctx.shadowBlur = 25;
        ctx.font = 'bold 36px "Playfair Display", serif';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = scannedGuest.color;
        ctx.lineWidth = 3;

        const nameY = targetCanvas.height - 90;
        ctx.strokeText(`Bienvenido, ${scannedGuest.name}`, targetCanvas.width / 2, nameY);
        ctx.fillText(`Bienvenido, ${scannedGuest.name}`, targetCanvas.width / 2, nameY);
        ctx.restore();
      }
    }

    animationFrameRef.current = requestAnimationFrame(animateComposite);
  }, [scannedGuest, isLanding, initializeParticles, facingMode]);



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
        setIsLanding(true);
        // Apply lush effects for landing
        particlesRef.current = initializeParticles(found, true);
      }
    }
  }, [initializeParticles]);

  useEffect(() => {
    if (!isLanding && scannedGuest) {
      // Camera started via handleComenzar
    }
  }, [isLanding, scannedGuest]);

  useEffect(() => {
    if (scannedGuest) {
      if (sessionRef.current) {
        applyLensData(CAMERA_KIT_CONFIG.lensIds[0], scannedGuest);
      }
      particlesRef.current = initializeParticles(scannedGuest, isLanding);
    }
  }, [scannedGuest, isLanding, initializeParticles]);

  // Setup composite canvas dimensions
  useEffect(() => {
    const setupCanvas = () => {
      const canvas = compositeCanvasRef.current;
      if (!canvas) return;

      // Match window size
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    setupCanvas();
    window.addEventListener('resize', setupCanvas);
    return () => window.removeEventListener('resize', setupCanvas);
  }, []);

  // Start composite animation when canvas is ready
  useEffect(() => {
    if (compositeCanvasRef.current) {
      animateComposite();
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animateComposite]);

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



  if (isLanding) {
    return (
      <div className="landing-page">
        <div className="landing-bg">
          <div className="garden-overlay"></div>
          <canvas ref={compositeCanvasRef} className="landing-canvas" />
        </div>
        <div className="landing-content">
          <h1 className="landing-title fadeInUp">Jardín del Edén</h1>
          <p className="landing-subtitle fadeInUp delay-1">
            {scannedGuest ? `Experiencia AR para ${scannedGuest.name}` : `Arte Floral & Experiencias AR`}
          </p>
          <button
            className="scan-trigger-btn fadeInUp delay-2"
            onClick={handleComenzar}
            style={{ pointerEvents: 'auto', zIndex: 1000 }}
          >
            Comenzar AR
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Hidden CameraKit canvas */}
      <canvas ref={canvasRef} className="camera-canvas hidden-canvas" />

      {/* Visible composite canvas with effects */}
      <div className="camera-background">
        <canvas ref={compositeCanvasRef} className="camera-canvas" />
      </div>

      <div className="ui-safe-area">
        <div className="top-bar-floating">
          <button className="ig-icon-btn" onClick={() => {
            setIsLanding(true);
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <button className={`ig-icon-btn ${facingMode}`} onClick={toggleCamera} aria-label="Cambiar Cámara">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 10v4h4" /><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9 9 9 0 0 1 9 9z" /><path d="M12 7v4" />
              <path d="M17 10l-4-4l-4 4" />
            </svg>
          </button>
        </div>

        <div className="bottom-bar-floating">
          <div className="shutter-container">
            {isRecording && (
              <svg className="progress-ring" width="88" height="88">
                <circle
                  className="progress-ring__circle"
                  stroke="white"
                  strokeWidth="4"
                  fill="transparent"
                  r="40"
                  cx="44"
                  cy="44"
                  style={{
                    strokeDasharray: `${2 * Math.PI * 40}`,
                    strokeDashoffset: `${2 * Math.PI * 40 * (1 - Math.min(recordingTime / 15, 1))}`,
                    transition: 'stroke-dashoffset 1s linear'
                  }}
                />
              </svg>
            )}
            <button
              className={`shutter-btn ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
            >
              <div className="shutter-inner"></div>
            </button>
          </div>
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
