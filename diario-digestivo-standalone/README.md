# Diario Digestivo — cómo dejarla instalada en tu celular

Esta carpeta es un proyecto completo y ya probado (compila sin errores). Para que
quede como una app de verdad en tu celular, con tus datos guardados en tu propia
base de datos gratis, sigue estos pasos una sola vez.

No necesitas instalar nada en tu computadora: todo se hace desde el navegador.

---

## Paso 1 — Crear tu proyecto gratis en Firebase

1. Ve a https://console.firebase.google.com y entra con tu cuenta de Google.
2. Clic en **"Agregar proyecto"**. Ponle el nombre que quieras (ej. "diario-digestivo").
   Puedes desactivar Google Analytics, no lo necesitas.
3. Dentro del proyecto, en el menú izquierdo entra a **Compilación > Authentication**.
   - Clic en "Comenzar".
   - Activa el proveedor **"Correo electrónico/contraseña"**.
   - Ve a la pestaña **"Users"** y clic en **"Agregar usuario"**: pon tu correo y
     una contraseña. Esta será la única cuenta que puede entrar a tu app — la creas
     tú misma aquí, la app no tiene un formulario público de registro.
4. En el menú izquierdo entra a **Compilación > Firestore Database**.
   - Clic en "Crear base de datos".
   - Elige la ubicación más cercana a ti (ej. `us-central` o `southamerica-east1`).
   - Empieza en **"modo de producción"**.
5. Dentro de Firestore, ve a la pestaña **"Reglas"** y reemplaza todo el contenido por esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/days/{dayId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

   Clic en **"Publicar"**. Esto asegura que solo tú (ya autenticada) puedes leer o
   escribir tus propios datos.

6. Ahora ve a **⚙️ Configuración del proyecto** (el engranaje, arriba a la izquierda)
   > pestaña **General** > baja hasta "Tus apps" > clic en el ícono **`</>`** (Web)
   para crear una app web. Ponle un apodo (ej. "diario-web") y clic en "Registrar app".
   Firebase te mostrará un bloque `firebaseConfig = {...}`. **Cópialo completo.**

## Paso 2 — Pegar tu configuración en el proyecto

1. Abre el archivo `src/firebase.js` de esta carpeta.
2. Reemplaza los valores de `firebaseConfig` por los que copiaste de Firebase.
3. Guarda el archivo.

## Paso 3 — Subir el proyecto a GitHub (sin usar la terminal)

1. Ve a https://github.com y crea una cuenta gratis si no tienes.
2. Clic en **"New repository"**. Nómbralo, por ejemplo, `diario-digestivo`.
   Déjalo **privado** si quieres (no es obligatorio, pero es tu app personal).
   No marques ninguna casilla de inicialización. Clic en "Create repository".
3. En la página del repo recién creado, busca el link **"uploading an existing file"**.
4. Arrastra **todos los archivos y carpetas de esta entrega** (excepto las carpetas
   `node_modules` y `dist`, que no vienen incluidas de todas formas) a esa ventana.
5. Escribe un mensaje como "primera versión" y clic en **"Commit changes"**.

## Paso 4 — Desplegar en Vercel (gratis)

1. Ve a https://vercel.com y crea una cuenta gratis usando **"Continue with GitHub"**
   (así quedan conectados automáticamente).
2. Clic en **"Add New..." > "Project"**.
3. Busca y selecciona el repositorio `diario-digestivo` que acabas de subir > **"Import"**.
4. Vercel detecta automáticamente que es un proyecto Vite — no cambies nada.
   Clic en **"Deploy"** y espera 1-2 minutos.
5. Cuando termine, Vercel te da un link tipo `https://diario-digestivo-tuusuario.vercel.app`.
   Ese es tu link permanente y gratis, ya fuera de Claude por completo.

## Paso 5 — Instalarla en tu celular

1. Abre ese link de Vercel en el navegador de tu celular (Safari en iPhone, Chrome en Android).
2. Inicia sesión con el correo y contraseña que creaste en el Paso 1.
3. Abre el menú de compartir/opciones del navegador y elige:
   - **iPhone (Safari):** Compartir → "Agregar a pantalla de inicio"
   - **Android (Chrome):** ⋮ (tres puntos) → "Agregar a pantalla de inicio" / "Instalar app"
4. Listo — te queda un ícono real en tu celular. Al abrirlo, entra a pantalla completa
   como cualquier app, sin barra del navegador, y funciona aunque pierdas señal un
   momento (se sincroniza en cuanto vuelve el internet).

---

## Después de esto

- Cualquier cambio futuro que quieras (ajustar colores, agregar un campo, etc.) lo puedes
  pedir en Claude: te doy el código actualizado, lo subes a GitHub reemplazando los
  archivos, y Vercel lo vuelve a publicar solo, automáticamente.
- Nadie más puede entrar a tu app sin tu correo y contraseña, y las reglas de Firestore
  bloquean que cualquier otra persona lea tu base de datos aunque tenga el link.
- Sigue bajando tu respaldo en JSON de vez en cuando desde Ajustes, como red de seguridad extra.
