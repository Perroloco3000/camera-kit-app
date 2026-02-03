import { useCallback, useEffect, useRef, useState } from 'react';
import { bootstrapCameraKit, CameraKitSession, createMediaStreamSource } from '@snap/camera-kit';
import { CAMERA_KIT_CONFIG } from './config';
import { hapticLight, hapticMedium, playShutterSound } from './utils/capture';
import './App.css';

// Types
type FacingMode = 'user' | 'environment';
type QualityPreset = 'stream' | 'recording' | 'broadcast';

interface ThumbnailItem {
  id: string;
  url: string;
  type: 'photo' | 'video';
  blob: Blob;
  filename?: string;
}

const RESOLUTIONS = {
  stream: { width: 1280, height: 720, fps: 30, bitrate: 2500000 },
  recording: { width: 1920, height: 1080, fps: 30, bitrate: 8000000 },
  broadcast: { width: 3840, height: 2160, fps: 60, bitrate: 25000000 },
};

function App() {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<CameraKitSession | null>(null);
  const cameraKitRef = useRef<Awaited<ReturnType<typeof bootstrapCameraKit>> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const isInitializingRef = useRef(false);

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [cameraFacing, setCameraFacing] = useState<FacingMode>('user');
  const [selectedLensId, setSelectedLensId] = useState<string>(CAMERA_KIT_CONFIG.lensIds[0]);
  const [qualityMode, setQualityMode] = useState<QualityPreset>('broadcast');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [thumbnails, setThumbnails] = useState<ThumbnailItem[]>([]);

  // Stats
  const [fps, setFps] = useState(0);
  const framesRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const uiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide UI logic
  const resetUiTimer = useCallback(() => {
    setUiVisible(true);
    if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
    uiTimeoutRef.current = setTimeout(() => {
      if (!isRecording) setUiVisible(false);
    }, 3000);
  }, [isRecording]);

  useEffect(() => {
    window.addEventListener('pointermove', resetUiTimer);
    window.addEventListener('touchstart', resetUiTimer);
    window.addEventListener('resize', resetUiTimer);
    return () => {
      window.removeEventListener('pointermove', resetUiTimer);
      window.removeEventListener('touchstart', resetUiTimer);
      window.removeEventListener('resize', resetUiTimer);
    };
  }, [resetUiTimer]);

  // FPS Counter
  useEffect(() => {
    const loop = () => {
      framesRef.current++;
      const now = performance.now();
      if (now - lastTimeRef.current >= 1000) {
        setFps(framesRef.current);
        framesRef.current = 0;
        lastTimeRef.current = now;
      }
      requestAnimationFrame(loop);
    };
    const id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        setShowStats(s => !s);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // 1. Camera Initialization
  const initCamera = useCallback(async (facing: FacingMode, preset: QualityPreset) => {
    if (!canvasRef.current || isInitializingRef.current) return;
    isInitializingRef.current = true;
    setIsLoading(true);
    setError('');

    // Stop previous
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
    }
    sessionRef.current?.pause();

    try {
      // Bootstrap CameraKit
      if (!cameraKitRef.current) {
        const apiToken = CAMERA_KIT_CONFIG.useStaging
          ? CAMERA_KIT_CONFIG.apiToken.staging
          : CAMERA_KIT_CONFIG.apiToken.production;
        cameraKitRef.current = await bootstrapCameraKit({ apiToken });
      }
      const cameraKit = cameraKitRef.current;

      // Session
      if (!sessionRef.current && canvasRef.current) {
        sessionRef.current = await cameraKit.createSession({
          liveRenderTarget: canvasRef.current,
        });
      }
      const session = sessionRef.current;
      if (!session) throw new Error("No session");

      // Get User Media
      const { width, height, fps } = RESOLUTIONS[preset];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: facing,
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: fps }
        },
      });
      mediaStreamRef.current = stream;

      // Bind to CameraKit
      const source = createMediaStreamSource(stream, {
        cameraType: facing === 'user' ? 'user' : 'environment',
      });
      await session.setSource(source);
      await session.play();

      // Apply initial lens
      await applyLens(selectedLensId);

      setIsLoading(false);
    } catch (err) {
      console.error(err);
      setError('Camera Init Failed');
      setIsLoading(false);
    } finally {
      isInitializingRef.current = false;
    }
  }, [selectedLensId]);
  // Note: selectedLensId dependency is safe here because applyLens handles deduping, 
  // but initCamera is mainly triggered by facing/quality changes.

  const applyLens = async (lensId: string) => {
    if (!sessionRef.current || !cameraKitRef.current) return;
    const lensGroupId = CAMERA_KIT_CONFIG.lensGroupId;
    try {
      const lens = await cameraKitRef.current.lensRepository.loadLens(lensId, lensGroupId);
      await sessionRef.current.applyLens(lens);
    } catch (e) {
      console.error("Lens load failed", e);
    }
  };

  useEffect(() => {
    initCamera(cameraFacing, qualityMode);
  }, [cameraFacing, qualityMode, initCamera]);

  useEffect(() => {
    if (!isLoading && sessionRef.current) {
      applyLens(selectedLensId);
    }
  }, [selectedLensId, isLoading]);

  // Recording
  const startRecording = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stream = canvas.captureStream(RESOLUTIONS[qualityMode].fps);
    const audioTracks = mediaStreamRef.current?.getAudioTracks() || [];
    audioTracks.forEach(t => stream.addTrack(t));

    const options = {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm',
      videoBitsPerSecond: RESOLUTIONS[qualityMode].bitrate
    };

    hapticMedium();
    playShutterSound();

    try {
      const recorder = new MediaRecorder(stream, options);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: options.mimeType });
        const url = URL.createObjectURL(blob);
        const ext = 'webm'; // Standardizing for web
        const filename = `bcast_${Date.now()}_${qualityMode}.${ext}`;

        setThumbnails(prev => [...prev.slice(-4), { // Keep last 5
          id: Date.now().toString(),
          url,
          type: 'video',
          blob,
          filename
        }]);

        saveToDevice(blob, filename);
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
    } catch (e) {
      console.error(e);
    }
  }, [qualityMode]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      interval = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      hapticLight();
    }
    setIsRecording(false);
  }, []);

  const saveToDevice = (blob: Blob, filename: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  };

  // Helper formatting
  const formatTime = (s: number) => {
    const min = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  };

  return (
    <div className="app-container" ref={containerRef}>

      {/* 1. Camera Layer */}
      <div className={`camera-layer ${qualityMode === 'broadcast' ? 'grade-cinema' : ''}`}>
        <canvas ref={canvasRef} className="camera-canvas" />
      </div>

      {isLoading && (
        <div className="loading-overlay">
          <div className="loader"></div>
          <div className="welcome-text">Iniciando Sistema Broadcast...</div>
        </div>
      )}

      {/* 2. HUD Layer */}
      <div className="hud-layer">

        {error && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'rgba(255, 0, 0, 0.7)', padding: '20px', borderRadius: '8px', zIndex: 999
          }}>
            {error}
          </div>
        )}

        {/* Top Bar */}
        <div className="hud-top">
          <div className="status-group">
            <span className="status-item">CAM: {cameraFacing.toUpperCase()}</span>
            <span className="status-item">|</span>
            <span className="status-item">RES: {RESOLUTIONS[qualityMode].width}p</span>
            <span className="status-item">|</span>
            <span className="status-item">FPS: {fps}</span>
          </div>

          <div className="rec-indicator" style={{ opacity: isRecording ? 1 : 0.3 }}>
            <div className="rec-dot"></div>
            <span>REC {isRecording && formatTime(recordingSeconds)}</span>
          </div>
        </div>

        {/* Center Grid */}
        {showGrid && (
          <div className="grid-overlay">
            <div className="grid-lines">
              <div className="grid-cell"></div><div className="grid-cell"></div><div className="grid-cell"></div>
              <div className="grid-cell"></div><div className="grid-cell"></div><div className="grid-cell"></div>
              <div className="grid-cell"></div><div className="grid-cell"></div><div className="grid-cell"></div>
            </div>
          </div>
        )}

        {/* Stats Panel */}
        {showStats && (
          <div className="stats-panel">
            <div className="stat-row"><span>Dropped:</span> <span className="stat-value">0</span></div>
            <div className="stat-row"><span>Bitrate:</span> <span className="stat-value">{(RESOLUTIONS[qualityMode].bitrate / 1000000).toFixed(1)} Mbps</span></div>
            <div className="stat-row"><span>Mem:</span> <span className="stat-value">{(performance as any).memory?.usedJSHeapSize ? Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024) + ' MB' : 'N/A'}</span></div>
          </div>
        )}

        {/* 3. Controls Dock */}
        <div className={`controls-dock ${uiVisible ? '' : 'hidden'}`}>

          <button className="btn-icon" onClick={() => setShowGrid(!showGrid)} title="Toggle Grid">
            <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" /></svg>
          </button>

          {thumbnails.length > 0 && (
            <button className="btn-icon" onClick={() => window.open(thumbnails[thumbnails.length - 1].url, '_blank')} title="Last Clip">
              <img src={thumbnails[thumbnails.length - 1].url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            </button>
          )}

          <button className="btn-icon" onClick={() => {
            const modes: QualityPreset[] = ['stream', 'recording', 'broadcast'];
            const next = modes[(modes.indexOf(qualityMode) + 1) % modes.length];
            setQualityMode(next);
          }} title={`Quality: ${qualityMode}`}>
            {qualityMode === 'broadcast' ? '4K' : qualityMode === 'recording' ? 'HD' : 'SD'}
          </button>

          <button
            className={`btn-record ${isRecording ? 'recording' : ''}`}
            onClick={isRecording ? stopRecording : startRecording}
          />

          <div className="lens-mini-carousel">
            {CAMERA_KIT_CONFIG.lensIds.map(id => (
              <div
                key={id}
                className={`lens-dot ${selectedLensId === id ? 'active' : ''}`}
                onClick={() => setSelectedLensId(id)}
              />
            ))}
          </div>

          <button className="btn-icon" onClick={() => setCameraFacing(f => f === 'user' ? 'environment' : 'user')}>
            <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>

          <button className="btn-icon" onClick={() => setShowStats(!showStats)}>
            <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
        </div>

      </div>
    </div>
  );
}

export default App;
