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
  z: number;
  speed: number;
  rotation: number;
  rotationSpeed: number;
  rotationX: number;
  rotationY: number;
  rotationSpeedX: number;
  rotationSpeedY: number;
  emoji: string;
  size: number;
  opacity: number;
  life: number;
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
      { emoji: '🌹', count: 18, speed: 0.8 },
      { emoji: '💖', count: 12, speed: 0.6 },
      { emoji: '✨', count: 10, speed: 1.0 }
    ]
  },
  {
    id: 'guest_2',
    name: 'Pedro',
    color: '#FFD700',
    particles: [
      { emoji: '⭐', count: 15, speed: 1.0 },
      { emoji: '💫', count: 12, speed: 0.9 },
      { emoji: '✨', count: 10, speed: 1.2 }
    ]
  },
  {
    id: 'guest_3',
    name: 'Yanis',
    color: '#34C759',
    particles: [
      { emoji: '🌿', count: 20, speed: 0.7 },
      { emoji: '🍃', count: 15, speed: 0.9 },
      { emoji: '🌱', count: 10, speed: 0.8 }
    ]
  },
];

const FALLBACK_GUEST: Guest = {
  id: 'fallback',
  name: 'Invitado',
  color: '#81c784',
  particles: [
    { emoji: '🌸', count: 12, speed: 0.5 },
    { emoji: '🌿', count: 12, speed: 0.4 },
    { emoji: '🌺', count: 10, speed: 0.6 },
    { emoji: '✨', count: 15, speed: 0.8 }
  ]
};

function App() {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<CameraKitSession | null>(null);
  const cameraKitRef = useRef<any>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const timeRef = useRef<number>(0);
  const currentStreamRef = useRef<MediaStream | null>(null);
  const isInitializingRef = useRef(false);

  // Sync state to ref for animation loop
  const stateRef = useRef({
    isLanding: true,
    scannedGuest: null as Guest | null,
    facingMode: 'user' as 'user' | 'environment'
  });

  // State
  const [isLanding, setIsLanding] = useState(true);
  const [scannedGuest, setScannedGuest] = useState<Guest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  useEffect(() => {
    stateRef.current = { isLanding, scannedGuest, facingMode };
  }, [isLanding, scannedGuest, facingMode]);

  const initializeParticles = (guest: Guest, isLush = false) => {
    const particles: Particle[] = [];
    const width = window.innerWidth || 400;
    const height = window.innerHeight || 800;

    const densityMultiplier = isLush ? 4 : 2;
    guest.particles.forEach(config => {
      const count = Math.floor(config.count * densityMultiplier);
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height * 2 - height,
          z: Math.random(),
          speed: config.speed + Math.random() * 0.5,
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 3,
          rotationX: Math.random() * 360,
          rotationY: Math.random() * 360,
          rotationSpeedX: (Math.random() - 0.5) * 2,
          rotationSpeedY: (Math.random() - 0.5) * 2,
          emoji: config.emoji,
          size: 20 + Math.random() * 30,
          opacity: 0,
          life: 0,
          maxLife: 5 + Math.random() * 5,
          windOffsetX: 0,
          windOffsetY: 0
        });
      }
    });
    return particles;
  };

  const applyLensData = useCallback(async (lensId: string, guest: Guest | null) => {
    if (!sessionRef.current || !cameraKitRef.current) return;
    try {
      const gName = guest ? guest.name : 'Invitado';
      const gColor = guest ? guest.color : '#81c784';
      const launchData = {
        launchParams: { guestName: gName, guestColor: gColor, name: gName, color: gColor }
      };
      const lens = await cameraKitRef.current.lensRepository.loadLens(lensId, CAMERA_KIT_CONFIG.lensGroupId);
      await sessionRef.current.applyLens(lens, launchData);
    } catch (e) { console.error(e); }
  }, []);

  const startCamera = useCallback(async () => {
    if (!canvasRef.current || isInitializingRef.current) return;
    isInitializingRef.current = true;
    setIsLoading(true);
    setError('');

    try {
      console.log('Starting CameraKit Bootstrap...');
      if (!cameraKitRef.current) {
        cameraKitRef.current = await bootstrapCameraKit({
          apiToken: CAMERA_KIT_CONFIG.useStaging
            ? CAMERA_KIT_CONFIG.apiToken.staging
            : CAMERA_KIT_CONFIG.apiToken.production
        });
      }

      console.log('Creating Session...');
      if (!sessionRef.current) {
        sessionRef.current = await cameraKitRef.current.createSession({
          liveRenderTarget: canvasRef.current
        });
      }

      if (currentStreamRef.current) {
        currentStreamRef.current.getTracks().forEach(t => t.stop());
      }

      console.log('Requesting Camera Access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: stateRef.current.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      currentStreamRef.current = stream;

      const source = createMediaStreamSource(stream, {
        cameraType: stateRef.current.facingMode
      });

      if (sessionRef.current) {
        await sessionRef.current.setSource(source);
        await sessionRef.current.play();
        console.log('CameraKit Playing');
      }

      await applyLensData(CAMERA_KIT_CONFIG.lensIds[0], stateRef.current.scannedGuest);
      setIsLoading(false);
    } catch (err) {
      console.error('Camera Start Failed:', err);
      setError('Error: Revisa los permisos de la cámara.');
      setIsLoading(false);
    } finally {
      isInitializingRef.current = false;
    }
  }, [applyLensData]);

  const handleComenzar = () => {
    console.log('Boton Comenzar Pulsado');
    setIsLanding(false);
    startCamera();
  };

  const animate = useCallback(() => {
    const targetCanvas = compositeCanvasRef.current;
    if (!targetCanvas) {
      animationFrameRef.current = requestAnimationFrame(animate);
      return;
    }
    const ctx = targetCanvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    timeRef.current += 0.016;
    const time = timeRef.current;
    const { isLanding: landing, scannedGuest: guest, facingMode: mode } = stateRef.current;

    ctx.fillStyle = landing ? '#001a0d' : '#000';
    ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

    if (!landing && canvasRef.current && canvasRef.current.width > 0) {
      if (mode === 'user') {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(canvasRef.current, -targetCanvas.width, 0, targetCanvas.width, targetCanvas.height);
        ctx.restore();
      } else {
        ctx.drawImage(canvasRef.current, 0, 0, targetCanvas.width, targetCanvas.height);
      }
    }

    if (particlesRef.current.length === 0) {
      particlesRef.current = initializeParticles(guest || FALLBACK_GUEST, landing);
    }

    const windX = Math.sin(time * 0.5) * 15;
    particlesRef.current.forEach(p => {
      p.life += 0.016;
      if (p.life >= p.maxLife) {
        p.life = 0; p.y = -50; p.x = Math.random() * targetCanvas.width;
      }
      const lifeRatio = p.life / p.maxLife;
      p.opacity = lifeRatio < 0.1 ? lifeRatio * 10 : lifeRatio > 0.9 ? (1 - lifeRatio) * 10 : 1;
      p.y += p.speed + 0.3;
      p.x += Math.sin(time + p.x * 0.01) * 2 + windX * 0.05;
      p.rotation += p.rotationSpeed;
      const scale = 0.5 + p.z * 0.5;
      ctx.save();
      ctx.globalAlpha = p.opacity * (0.6 + p.z * 0.4);
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.font = `${p.size * scale}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.emoji, 0, 0);
      ctx.restore();
    });

    if (guest && !landing) {
      ctx.save();
      ctx.shadowColor = guest.color; ctx.shadowBlur = 15; ctx.fillStyle = 'white';
      ctx.font = 'italic 42px "Great Vibes", cursive';
      ctx.textAlign = 'center';
      ctx.fillText('Jardín del Edén', targetCanvas.width / 2, targetCanvas.height - 130);
      ctx.font = 'bold 24px "Playfair Display", serif';
      ctx.fillText(`Bienvenido, ${guest.name}`, targetCanvas.width / 2, targetCanvas.height - 85);
      ctx.restore();
    }
    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    animate();
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [animate]);

  useEffect(() => {
    const setup = () => {
      if (compositeCanvasRef.current) {
        compositeCanvasRef.current.width = window.innerWidth;
        compositeCanvasRef.current.height = window.innerHeight;
      }
    };
    setup();
    window.addEventListener('resize', setup);
    return () => window.removeEventListener('resize', setup);
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('guest');
    if (id) {
      const g = GUESTS.find(x => x.id === id);
      if (g) { setScannedGuest(g); particlesRef.current = []; }
    }
  }, []);

  if (isLanding) {
    return (
      <div className="landing-v5">
        <canvas ref={compositeCanvasRef} id="canvas-v5" />
        <div className="overlay-v5" />
        <div className="content-v5">
          <div className="version-tag">Actualizado: V5.1</div>
          <h1 className="title-v5">Jardín del Edén</h1>
          <p className="subtitle-v5">
            {scannedGuest ? `Experiencia AR para ${scannedGuest.name}` : `Arte Floral & Experiencias AR`}
          </p>
          <button className="btn-v5" onClick={handleComenzar}>
            Comenzar AR
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-v5">
      <canvas ref={canvasRef} className="hidden-source" />
      <div className="viewport-v5">
        <canvas ref={compositeCanvasRef} className="output-v5" />
      </div>
      <div className="ui-v5">
        <div className="header-v5">
          <button className="btn-circle" onClick={() => setIsLanding(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <button className="btn-circle" onClick={() => setFacingMode(f => f === 'user' ? 'environment' : 'user')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 10v4h4" /><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9 9 9 0 0 1 9 9z" /><path d="M12 7v4" /><path d="M17 10l-4-4l-4 4" /></svg>
          </button>
        </div>
        <div className="footer-v5">
          <button className={`capture-btn ${isRecording ? 'active' : ''}`} onClick={() => setIsRecording(!isRecording)}>
            <div className="capture-inner"></div>
          </button>
        </div>
        {(isLoading || error) && (
          <div className="status-v5">
            {isLoading && <div className="loader"></div>}
            {error && <div className="toast">{error}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
