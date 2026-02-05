// Configuración de Camera Kit
export const CAMERA_KIT_CONFIG = {
  // API Tokens
  apiToken: {
    staging: 'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzY5NjUzMDMxLCJzdWIiOiJiZDUyMDM3OS1iOTZjLTRiMzQtYjc5MC02NmYyNTFkODYxOWZ-U1RBR0lOR344NGNjZmUzMi0wNzQ3LTRmMTgtOTM0My04NjM3NDRhYTgzZmUifQ.uFNYAFwTAiZPw0zG1v53D8xdz_OHd8imuWrmVXIWmII',
    production: 'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzY5NjUzMDMxLCJzdWIiOiJiZDUyMDM3OS1iOTZjLTRiMzQtYjc5MC02NmYyNTFkODYxOWZ-UFJPRFVDVElPTn5lNWU0NjExYS05NDAxLTQwYjYtYWVhMS03ODA3NzkwNWQ4YTgifQ.5vMLdeoddni1Jr0q8j_QAkRIFU4YMosbYvlm0nnYqU8'
  },

  // Usa staging por defecto para desarrollo
  useStaging: true,

  // Lentes disponibles para elegir (incluye el lens original)
  lensIds: ['6f10abf5-e52d-4326-808a-dfa569f4f4f3'],

  // Lens Group ID (necesario para cargar los lentes)
  lensGroupId: 'b65ebded-94d3-4570-9518-dc22795e866c',

  // Configuración de la cámara
  camera: {
    facingMode: 'user',
  }
} as const;
