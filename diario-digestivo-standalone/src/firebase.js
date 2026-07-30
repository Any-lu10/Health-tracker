// ---------------------------------------------------------------
// PEGA AQUÍ la configuración de TU proyecto de Firebase.
// La encuentras en: Firebase Console > ⚙️ Configuración del proyecto
// > tu app web > "Config" (o "SDK setup and configuration").
// No es información secreta, pero sí es única de tu proyecto.
// ---------------------------------------------------------------
const firebaseConfig = {
  apiKey: "PEGA_TU_API_KEY_AQUI",
  authDomain: "PEGA_TU_AUTH_DOMAIN_AQUI",
  projectId: "PEGA_TU_PROJECT_ID_AQUI",
  storageBucket: "PEGA_TU_STORAGE_BUCKET_AQUI",
  messagingSenderId: "PEGA_TU_SENDER_ID_AQUI",
  appId: "PEGA_TU_APP_ID_AQUI"
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
