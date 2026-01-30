import { useCallback, useEffect, useRef, useState } from 'react';
import { bootstrapCameraKit, CameraKitSession, createMediaStreamSource } from '@snap/camera-kit';
import { CAMERA_KIT_CONFIG } from './config';
import { hapticLight, hapticMedium, playShutterSound } from './utils/capture';
import './App.css';

type FacingMode = 'user' | 'environment';

interface ThumbnailItem {
  id: string;
  url: string;
  type: 'photo' | 'video';
  blob: Blob;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<CameraKitSession | null>(null);
  const cameraKitRef = useRef<Awaited<ReturnType<typeof bootstrapCameraKit>> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitializingRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const lensIds = CAMERA_KIT_CONFIG.lensIds;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [cameraFacing, setCameraFacing] = useState<FacingMode>('user');
  const [selectedLensId, setSelectedLensId] = useState<string>(lensIds[0]);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [thumbnails, setThumbnails] = useState<ThumbnailItem[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isCaptureDisabled, setIsCaptureDisabled] = useState(false);

  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === 'recording') {
      mr.stop();
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  }, []);

  const initCamera = useCallback(async (facing: FacingMode) => {
    if (!canvasRef.current || isInitializingRef.current) return;
    isInitializingRef.current = true;
    setIsLoading(true);
    setError('');

    try {
      const apiToken = CAMERA_KIT_CONFIG.useStaging
        ? CAMERA_KIT_CONFIG.apiToken.staging
        : CAMERA_KIT_CONFIG.apiToken.production;
      const cameraKit = await bootstrapCameraKit({ apiToken });
      cameraKitRef.current = cameraKit;

      if (!canvasRef.current) return;
      const session = await cameraKit.createSession({
        liveRenderTarget: canvasRef.current,
      });
      sessionRef.current = session;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      mediaStreamRef.current = stream;

      const source = createMediaStreamSource(stream, {
        cameraType: facing === 'user' ? 'user' : 'environment',
      });
      await session.setSource(source);
      await session.play();
      setIsLoading(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al iniciar cámara');
      setIsLoading(false);
    } finally {
      isInitializingRef.current = false;
    }
  }, []);

  const applyLens = useCallback(async (lensId: string) => {
    const session = sessionRef.current;
    const cameraKit = cameraKitRef.current;
    if (!session || !cameraKit) return;
    const lensGroupId = CAMERA_KIT_CONFIG.lensGroupId;
    try {
      const lens = await cameraKit.lensRepository.loadLens(String(lensId), lensGroupId);
      await session.applyLens(lens);
    } catch {
      try {
        const { lenses } = await cameraKit.lensRepository.loadLensGroups([lensGroupId]);
        const target = lenses.find((l: { id: string }) => l.id === String(lensId));
        if (target) await session.applyLens(target);
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (isLoading) return;
    applyLens(selectedLensId);
  }, [selectedLensId, isLoading, applyLens]);

  useEffect(() => {
    initCamera(cameraFacing);
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      sessionRef.current?.pause();
    };
  }, [cameraFacing, initCamera]);

  const takePhoto = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || isCaptureDisabled) return;
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      playShutterSound();
      hapticLight();
      fetch(dataUrl)
        .then((r) => r.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          setThumbnails((prev) => [
            ...prev.slice(-19),
            { id: `${Date.now()}`, url, type: 'photo', blob },
          ]);
          saveToDevice(blob, `photo_${Date.now()}.jpg`);
        });
    } catch {
      // ignore
    }
  }, [isCaptureDisabled]);

  const saveToDevice = (blob: Blob, filename: string) => {
    if ('showSaveFilePicker' in window) {
      (window as unknown as { showSaveFilePicker: (o: { suggestedName: string }) => Promise<FileSystemFileHandle> })
        .showSaveFilePicker({ suggestedName: filename })
        .then((handle) => handle.createWritable())
        .then((w) => w.write(blob).then(() => w.close()))
        .catch(() => downloadFallback(blob, filename));
    } else {
      downloadFallback(blob, filename);
    }
  };

  const downloadFallback = (blob: Blob, filename: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const startVideoRecording = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || isCaptureDisabled) return;
    const stream = canvas.captureStream(25);
    const mimeOptions = [
      'video/mp4',
      'video/webm;codecs=vp8',
      'video/webm;codecs=vp9',
      'video/webm',
    ];
    let mime = '';
    for (const opt of mimeOptions) {
      if (MediaRecorder.isTypeSupported(opt)) {
        mime = opt;
        break;
      }
    }
    if (!mime) mime = '';
    const bitsPerSecond = 2000000;
    recordedChunksRef.current = [];
    const onStop = () => {
      const type = mime || 'video/webm';
      const blob = new Blob(recordedChunksRef.current, { type });
      const url = URL.createObjectURL(blob);
      setThumbnails((prev) => [...prev.slice(-19), { id: `v${Date.now()}`, url, type: 'video', blob }]);
      const ext = type.indexOf('mp4') !== -1 ? 'mp4' : 'webm';
      saveToDevice(blob, `video_${Date.now()}.${ext}`);
    };
    try {
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: bitsPerSecond } : { videoBitsPerSecond: bitsPerSecond });
      recorder.ondataavailable = (e) => {
        if (e.data.size) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = onStop;
      recorder.start(200);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingIntervalRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
      hapticMedium();
    } catch {
      try {
        recordedChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data.size) recordedChunksRef.current.push(e.data);
        };
        recorder.onstop = onStop;
        recorder.start(200);
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        setRecordingSeconds(0);
        recordingIntervalRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
        hapticMedium();
      } catch {
        setIsRecording(false);
      }
    }
  }, [isCaptureDisabled]);

  const onCapturePointerDown = () => {
    if (isRecording) return;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      setIsCaptureDisabled(true);
      startVideoRecording();
    }, 400);
  };

  const onCapturePointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      takePhoto();
    } else if (isRecording) {
      stopRecording();
      setIsCaptureDisabled(false);
    }
  };

  const onCapturePointerLeave = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const flipCamera = () => {
    if (isInitializingRef.current) return;
    hapticLight();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    sessionRef.current?.pause();
    setCameraFacing((f) => (f === 'user' ? 'environment' : 'user'));
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // Gestures: horizontal = flip, vertical = zoom
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.targetTouches[0];
    if (t) touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    touchStartRef.current = null;
    if (dt > 300) return;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      flipCamera();
    } else if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) {
      setZoomLevel((z) => (dy < 0 ? Math.min(2, z + 0.25) : Math.max(1, z - 0.25)));
      hapticLight();
    }
  };

  return (
    <div
      className="app-mobile"
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{ touchAction: 'manipulation' }}
    >
      {/* Hide any Snap branding / logos */}
      <style>{`
        [class*="snap"], [class*="Snap"], [id*="snap"], [id*="Snap"],
        [class*="logo"], [class*="Logo"], [aria-label*="snap"], [aria-label*="Snap"],
        [alt*="snap"], [alt*="Snap"], [class*="branding"] {
          display: none !important;
        }
      `}</style>

      {error && (
        <div className="app-error">
          {error}
        </div>
      )}

      <div className="camera-feed-wrap" style={{ transform: `scale(${zoomLevel})` }}>
        <canvas
          ref={canvasRef}
          className="camera-canvas"
          style={{ display: isLoading ? 'none' : 'block' }}
        />
        {isLoading && (
          <div className="camera-loading">
            <span>Cargando…</span>
          </div>
        )}
        {zoomLevel > 1 && (
          <div className="zoom-indicator">{zoomLevel.toFixed(1)}×</div>
        )}
      </div>

      <div className="controls-bar">
        <div className="lens-selector">
          {lensIds.map((id) => (
            <button
              key={id}
              type="button"
              className={`lens-option ${selectedLensId === id ? 'active' : ''}`}
              onClick={() => {
                hapticLight();
                setSelectedLensId(id);
              }}
              disabled={isLoading}
              aria-label={`Lente ${lensIds.indexOf(id) + 1}`}
            >
              {lensIds.indexOf(id) + 1}
            </button>
          ))}
        </div>
        <div className="controls-inner">
          <button
            type="button"
            className="btn-flip"
            onClick={flipCamera}
            disabled={isLoading}
            aria-label="Cambiar cámara"
            title="Cambiar cámara"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          </button>

          <div className="capture-wrap">
            {isRecording && (
              <div className="capture-progress-ring" style={{ '--duration': `${recordingSeconds}` } as React.CSSProperties}>
                <svg viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255,55,95,0.4)" strokeWidth="4" />
                  <circle
                    className="capture-progress-circle"
                    cx="50"
                    cy="50"
                    r="48"
                    fill="none"
                    stroke="#FF375F"
                    strokeWidth="4"
                    strokeDasharray={2 * Math.PI * 48}
                    strokeDashoffset={2 * Math.PI * 48 * (1 - Math.min(recordingSeconds / 60, 1))}
                    transform="rotate(-90 50 50)"
                  />
                </svg>
              </div>
            )}
            <button
              type="button"
              className="btn-capture"
              onPointerDown={onCapturePointerDown}
              onPointerUp={onCapturePointerUp}
              onPointerLeave={onCapturePointerLeave}
              onContextMenu={(e) => e.preventDefault()}
              disabled={isLoading}
              aria-label={isRecording ? 'Detener grabación' : 'Tomar foto'}
            />
            {isRecording && (
              <div className="recording-timer">{formatTime(recordingSeconds)}</div>
            )}
          </div>

          <div className="btn-placeholder" aria-hidden />
        </div>

        <div className="thumbnails-bar">
          <div className="thumbnails-scroll">
            {thumbnails.map((item) => (
              <button
                key={item.id}
                type="button"
                className="thumb-item"
                onClick={() => window.open(item.url, '_blank')}
              >
                {item.type === 'video' ? (
                  <span className="thumb-badge">VID</span>
                ) : null}
                <img src={item.url} alt="" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
