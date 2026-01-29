import { bootstrapCameraKit, CameraKitSession, Lens } from '@snap/camera-kit';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

// === TUS CREDENCIALES ===
const API_TOKEN = '...frXVxdLJ7oTEnJ49RM_i3Qqvpze3dj53lBGdg';
const LENS_GROUP_ID = 'fff55d1f-3954-4cd0-8d20-319301d94ca1';

interface CameraKitState {
  session: CameraKitSession | null;
  lenses: Lens[];
}

const CameraKitContext = createContext<CameraKitState | null>(null);

export const CameraKitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<CameraKitSession | null>(null);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const isInitialized = useRef(false);

  useEffect(() => {
    if (isInitialized.current) return;

    const initializeCameraKit = async () => {
      try {
        console.log('🚀 Inicializando Camera Kit...');

        // 1. Bootstrap Camera Kit
        const cameraKit = await bootstrapCameraKit({
          apiToken: API_TOKEN,
        });

        // 2. Create session
        const newSession = await cameraKit.createSession();
        setSession(newSession);

        // 3. Fetch lenses
        const { lenses: lensList } = await cameraKit.lensRepository.loadLensGroups([LENS_GROUP_ID]);
        setLenses(lensList);

        console.log('✅ Camera Kit inicializado!');
        console.log(`📸 Lentes: ${lensList.length}`);
        isInitialized.current = true;
      } catch (error) {
        console.error('❌ Error:', error);
      }
    };

    initializeCameraKit();
  }, []);

  if (!session) {
    return <div style={{ padding: '20px' }}>Cargando Camera Kit...</div>;
  }

  return (
    <CameraKitContext.Provider value={{ session, lenses }}>
      {children}
    </CameraKitContext.Provider>
  );
};

export const useCameraKit = () => {
  const context = useContext(CameraKitContext);
  if (!context) {
    throw new Error('useCameraKit debe usarse dentro de CameraKitProvider');
  }
  return context;
};