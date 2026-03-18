// Change this to your backend IP (use your machine's LAN IP for physical devices)
// e.g., 'http://192.168.1.100:8000'
export const API_BASE_URL = 'http://10.0.2.2:8000/api'; // Android emulator -> localhost
export const BACKEND_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');
export const WS_URL = 'ws://10.0.2.2:8000/realtime';

// For iOS simulator, use: http://localhost:8000/api
// For physical device, use your machine's LAN IP: http://192.168.x.x:8000/api
