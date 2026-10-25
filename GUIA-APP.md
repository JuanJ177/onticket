# OnTicket · Web + App móvil

## Estructura

```
onticket-main/
├── index.html, style.css, script.js   → la web (Vercel)
├── data.js            → eventos, lugares y cobros (servicio, IVA)
├── planos.js          → planos (Malocas, Capachos, Teatro)
├── planos.css         → estilos de los planos (web y app)
├── core.js            → lógica compartida: precios, plano SVG, factura, QR dinámico
├── db.js              → datos: Firebase (si está configurado) o localStorage
├── firebase-config.js → credenciales de Firebase (pegar aquí)
├── firestore.rules    → reglas de seguridad de la base de datos
└── app/               → app móvil (Capacitor)
    ├── www/           → interfaz de la app (index.html, app.css, app.js)
    ├── android/       → proyecto nativo Android
    └── scripts/copiar.mjs → copia los archivos compartidos a www/
```

La web y la app usan **los mismos** `data.js`, `planos.js`, `core.js` y `db.js`.
Si cambias un evento o un precio, cambia en las dos.

---

## 1. Conectar Firebase (cuentas y boletas compartidas)

1. Entra a <https://console.firebase.google.com> con tu cuenta de Google → **Agregar proyecto** → nombre `onticket` (Analytics no es necesario).
2. **Authentication** → Comenzar → Método de acceso → habilitar **Correo electrónico/contraseña**.
3. **Firestore Database** → Crear base de datos → ubicación `southamerica-east1` (São Paulo) → modo producción.
4. En Firestore → pestaña **Reglas** → pega el contenido de `firestore.rules` → **Publicar**.
5. ⚙️ Configuración del proyecto → **Tus apps** → ícono web `</>` → registra la app → copia el objeto `firebaseConfig`.
6. Pégalo en `firebase-config.js` (reemplaza `null`):

   ```js
   const FIREBASE_CONFIG = {
       apiKey: "...",
       authDomain: "...",
       projectId: "...",
       storageBucket: "...",
       messagingSenderId: "...",
       appId: "..."
   };
   ```

7. **Administrador:** regístrate en la web con el correo que quieras usar como admin. Luego en Firestore → colección `usuarios` → tu documento → cambia `role` de `user` a `admin`.

Estos datos de configuración son públicos por diseño. Lo que protege la información son las reglas de `firestore.rules`.

Mientras `FIREBASE_CONFIG` sea `null`, todo funciona en **modo local** (como antes).

---

## 2. Generar el APK de Android

Requisitos (ya están en este PC): Node.js, Java 21, Android SDK.

```bash
cd app
npm install          # solo la primera vez
npm run apk          # copia archivos, sincroniza y compila
```

El APK queda en `app/OnTicket.apk` y también se copia a `descargas/OnTicket.apk`,
que es el archivo que descarga el botón **"Descargar para Android"** de la web
(sube los cambios a GitHub para que Vercel publique la versión nueva).
Pásalo al celular e instálalo (hay que permitir "instalar apps de origen desconocido").

Para abrir el proyecto en Android Studio:

```bash
cd app
npm run android
```

> Cada vez que cambies algo en la web compartida (`data.js`, `core.js`, etc.)
> o en `app/www`, vuelve a ejecutar `npm run apk`.

---

## 3. Funciones de la app

- **Explorar / Comprar:** banner de destacados, filtro por ciudad y categoría, detalle con mapa,
  plano táctil (pellizcar para zoom), palcos individuales, zonas generales, checkout en 3 pasos
  con desglose de servicio + IVA y factura electrónica opcional.
- **Mis boletas:** cada compra como boleta digital con **QR dinámico** que cambia cada 30 s
  (código + ventana de tiempo + firma) y su código de compra. Se guardan en el celular para
  mostrarlas **sin internet** en la entrada.
- **Perfil:** misma cuenta que la web, tema claro/oscuro, soporte.
