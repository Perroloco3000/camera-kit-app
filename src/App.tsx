import { useEffect, useRef, useState } from 'react';
import { bootstrapCameraKit, CameraKitSession, createMediaStreamSource } from '@snap/camera-kit';
import { CAMERA_KIT_CONFIG } from './config';
import './App.css';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setSession] = useState<CameraKitSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const addDebug = (msg: string) => {
    setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
    console.log(msg);
  };

  useEffect(() => {
    let cameraKitSession: CameraKitSession | null = null;
    let mediaStream: MediaStream | null = null;
    let isMounted = true;
    let isInitializing = false;

    const initializeCameraKit = async () => {
      // Prevent double initialization
      if (isInitializing) {
        addDebug('⚠️ Inicialización ya en progreso, ignorando...');
        return;
      }

      // Wait for canvas to be available
      if (!canvasRef.current) {
        addDebug('Esperando canvas...');
        // Retry after a short delay
        setTimeout(() => {
          if (isMounted && !isInitializing) initializeCameraKit();
        }, 100);
        return;
      }

      isInitializing = true;

      try {
        addDebug('🚀 Inicializando Camera Kit...');
        setIsLoading(true);
        setError('');

        // 1. Bootstrap Camera Kit
        addDebug('Bootstrap Camera Kit...');
        const apiToken = CAMERA_KIT_CONFIG.useStaging 
          ? CAMERA_KIT_CONFIG.apiToken.staging 
          : CAMERA_KIT_CONFIG.apiToken.production;
        addDebug(`Usando API Token: ${CAMERA_KIT_CONFIG.useStaging ? 'Staging' : 'Production'}`);
        const cameraKit = await bootstrapCameraKit({
          apiToken: apiToken,
        });
        addDebug('✅ Camera Kit bootstrapped');

        // 2. Get canvas element (must be available now)
        if (!canvasRef.current) {
          throw new Error('Canvas element no encontrado');
        }

        // 3. Create session with canvas as render target
        addDebug('Creando sesión con canvas...');
        cameraKitSession = await cameraKit.createSession({
          liveRenderTarget: canvasRef.current
        });
        setSession(cameraKitSession);
        addDebug('✅ Sesión creada con render target');

        // 5. Start camera first
        addDebug('Iniciando cámara...');
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: CAMERA_KIT_CONFIG.camera.facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        addDebug(`✅ Cámara obtenida! Tracks: ${mediaStream.getVideoTracks().length}`);

        // 6. Create CameraKitSource from media stream
        addDebug('Creando fuente de Camera Kit...');
        const source = createMediaStreamSource(mediaStream, {
          cameraType: 'user'
        });
        
        // 7. Set source
        addDebug('Configurando fuente de video...');
        await cameraKitSession.setSource(source);
        addDebug('✅ Fuente de video configurada');
        
        // 8. Start rendering
        addDebug('Iniciando renderizado...');
        await cameraKitSession.play();
        addDebug('✅ Renderizado iniciado');

        // 9. Load and apply the specific lens
        const lensId = CAMERA_KIT_CONFIG.lensId;
        const lensGroupId = CAMERA_KIT_CONFIG.lensGroupId;
        
        addDebug(`Cargando Lens ID: ${lensId}`);
        addDebug(`Lens Group ID: ${lensGroupId}`);
        
        try {
          // Convert lens ID to string
          const lensIdStr = String(lensId);
          
          // Method 1: Try loading lens directly with group ID
          addDebug(`Intentando cargar lens directamente con ID: ${lensIdStr} y Group ID: ${lensGroupId}`);
          
          try {
            const loadedLens = await cameraKit.lensRepository.loadLens(
              lensIdStr,
              lensGroupId
            );
            addDebug(`✅ Lens cargado directamente: ${loadedLens.name || lensIdStr}`);
            addDebug(`Lens ID del objeto: ${loadedLens.id}`);
            
            // Apply lens to session
            addDebug('Aplicando lens a la sesión...');
            await cameraKitSession.applyLens(loadedLens);
            addDebug('✅ Lens aplicado exitosamente');
          } catch (directError: any) {
            addDebug(`⚠️ No se pudo cargar directamente: ${directError.message}`);
            addDebug('Intentando cargar desde grupo...');
            
            // Method 2: Load lens group and find the specific lens
            const { lenses: lensesInGroup } = await cameraKit.lensRepository.loadLensGroups([lensGroupId]);
            addDebug(`✅ Grupo cargado. Lenses encontrados: ${lensesInGroup.length}`);
            
            // Find the specific lens by ID
            const targetLens = lensesInGroup.find((lens: { id: string }) => lens.id === lensIdStr || lens.id === lensId);
            
            if (!targetLens) {
              addDebug(`Lenses disponibles en el grupo:`);
              lensesInGroup.forEach((lens: { id: string; name?: string }, idx: number) => {
                addDebug(`  [${idx}] ID: ${lens.id}, Nombre: ${lens.name || 'Sin nombre'}`);
              });
              throw new Error(`No se encontró el lens con ID "${lensIdStr}" en el grupo "${lensGroupId}". Lenses disponibles: ${lensesInGroup.map((l: { id: string }) => l.id).join(', ')}`);
            }
            
            addDebug(`✅ Lens encontrado en el grupo: ${targetLens.name || lensIdStr}`);
            addDebug(`Lens ID del objeto: ${targetLens.id}`);
            
            // Apply lens to session
            addDebug('Aplicando lens a la sesión...');
            await cameraKitSession.applyLens(targetLens);
            addDebug('✅ Lens aplicado exitosamente');
          }
        } catch (lensError: any) {
          addDebug(`❌ Error cargando lens: ${lensError.message}`);
          addDebug(`Tipo de error: ${lensError.name}`);
          console.error('Detalles del error del lens:', lensError);
          throw new Error(`No se pudo cargar el lens con ID "${lensId}". Error: ${lensError.message}. Verifica que el Lens ID y Lens Group ID sean correctos y que tengas acceso a ellos con el API token actual.`);
        }

        addDebug('🎉 Camera Kit completamente inicializado!');

        setIsLoading(false);
        isInitializing = false;
      } catch (err: any) {
        const errorMsg = err.message || 'Error desconocido';
        addDebug(`❌ Error: ${errorMsg}`);
        console.error('Camera Kit error:', err);
        setError(`Error: ${errorMsg}`);
        setIsLoading(false);
        isInitializing = false;
      }
    };

    initializeCameraKit();

    // Cleanup
    return () => {
      isMounted = false;
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
      if (cameraKitSession) {
        try {
          cameraKitSession.pause();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  return (
    <div className="app-container">
      <h1>🎥 Camera Kit Web - Lens Test</h1>
      <p>
        <strong>Lens ID:</strong> {CAMERA_KIT_CONFIG.lensId}<br/>
        <strong>URL:</strong> {window.location.href}<br/>
        <strong>Protocolo:</strong> {window.location.protocol}
      </p>
      
      {error && (
        <div className="error-message">
          <h3>❌ {error}</h3>
        </div>
      )}

      <div className="camera-container">
        <canvas
          ref={canvasRef}
          className="camera-view"
          style={{
            width: '100%',
            height: 'auto',
            display: isLoading ? 'none' : 'block',
            background: '#000'
          }}
        />
        {isLoading && (
          <div className="camera-placeholder" style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1a1a1a'
          }}>
            <div>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
              <div>Cargando Camera Kit...</div>
            </div>
          </div>
        )}
      </div>

      <div style={{
        background: '#1a1a1a',
        color: '#00ff00',
        padding: '1rem',
        borderRadius: '8px',
        marginTop: '1rem',
        fontFamily: 'monospace',
        fontSize: '12px',
        maxHeight: '200px',
        overflow: 'auto',
        textAlign: 'left'
      }}>
        <h3 style={{ marginTop: 0, color: 'white' }}>Debug Info:</h3>
        {debugInfo.map((msg, idx) => (
          <div key={idx}>{msg}</div>
        ))}
        {debugInfo.length === 0 && <div>Esperando eventos...</div>}
      </div>

      <div className="instructions">
        <h3>📋 Instrucciones:</h3>
        <ol>
          <li>
            <strong>Permitir cámara:</strong> 
            <ul>
              <li>Haz clic en el 🔒 en la barra de URL</li>
              <li>Selecciona "Configuración del sitio"</li>
              <li>Cambia "Cámara" a "Permitir"</li>
            </ul>
          </li>
          <li>
            <strong>Verificar URL:</strong> Debe ser <code>https://localhost:5173</code> o <code>http://localhost:5173</code>
          </li>
          <li>
            <strong>Si hay problemas:</strong>
            <ul>
              <li>Verifica que ninguna otra app use la cámara</li>
              <li>Recarga la página</li>
              <li>Revisa la consola del navegador para más detalles</li>
            </ul>
          </li>
        </ol>
      </div>
    </div>
  );
}

export default App;
