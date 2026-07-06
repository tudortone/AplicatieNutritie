import { Platform } from 'react-native';

// Folosim variabila de mediu dacă e setată, altfel alegem adresa potrivită pentru emulator.
// Pe emulatorul Android standard, `localhost` din aplicație nu ajunge la serverul local,
// de aceea folosim `10.0.2.2`. Dacă rulezi pe telefon fizic, setează `EXPO_PUBLIC_API_URL`
// cu IP-ul mașinii tale, de exemplu `http://192.168.1.100:3000`.
const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
export const API_URL = envApiUrl
  || (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');
