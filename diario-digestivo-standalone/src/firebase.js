// ---------------------------------------------------------------
// Configuración de tu proyecto de Firebase.
// ---------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDRTTQgqF7-NYzR8vKUfvP6rzL8Y6nS6-M",
  authDomain: "health-tracker-b997f.firebaseapp.com",
  projectId: "health-tracker-b997f",
  storageBucket: "health-tracker-b997f.firebasestorage.app",
  messagingSenderId: "1017398021523",
  appId: "1:1017398021523:web:57e1a8c603f20e028eec66"
};

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Permite que la app funcione (leyendo el último dato conocido) aunque
// el celular se quede sin señal por un momento.
enableIndexedDbPersistence(db).catch(() => {
  // Falla en silencio si el navegador no lo soporta o hay varias pestañas abiertas — no es grave.
});
