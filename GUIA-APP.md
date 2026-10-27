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
- **Modo taquilla** (rol `admin` o `taquilla`): escanea el QR con la cámara, valida la firma y la
  hora del QR, y registra cuántas personas de la boleta ya entraron.

---

## 4. Panel administrativo (web → botón "Admin")

| Pestaña | Qué hace |
|---|---|
| **Ventas** | Todas las compras, servicio + IVA, facturas e ingresos por boleta |
| **Estadísticas** | Aforo, ocupación, recaudo, gráficas y **mapa de calor** del plano (ocupación o flujo de ingreso por hora) |
| **Eventos** | Crear, editar, ocultar o borrar eventos (afiche, fecha, lugar, precios por localidad) |
| **Taquilla** | Validar boletas con la cámara del computador o escribiendo el código |

**Roles** (Firestore → colección `usuarios` → campo `role`):

- `user`: cliente (por defecto)
- `taquilla`: personal de la entrada; solo ve la pestaña Taquilla
- `admin`: todo

---

## 5. Configuración en Firebase (cada vez que se actualicen las reglas)

1. **Reglas:** Firestore Database → Reglas → pegar `firestore.rules` → Publicar.
2. **Inicio con Google:** Authentication → Método de acceso → Agregar proveedor → Google → Habilitar.
3. **Dominio de la web:** Authentication → Configuración → Dominios autorizados → agregar el dominio de Vercel.
4. **Correos en español:** Authentication → Plantillas → idioma de las plantillas: Español.

---

## 6. Detalles técnicos

- **Fechas:** cada evento tiene `fechaISO`. Si `CONFIG.moverEventosPasados` está activo, los
  eventos cuya fecha ya pasó se muestran automáticamente en el año siguiente (eventos de demostración).
- **Reserva:** al pasar a pagar, las ubicaciones quedan apartadas `CONFIG.minutosReserva` minutos
  (colección `reservas`). Las demás personas las ven como "en proceso de compra".
- **Correo verificado:** para comprar se exige correo verificado (las reglas lo validan).
- **Correos de compra:** cada compra deja un mensaje en la colección `correos`. La extensión
  *Trigger Email* de Firebase (plan Blaze) los envía automáticamente.
- **Ocupación de demostración:** el plano simula ventas por localidad con un azar estable para
  que se vea real; las compras reales se suman encima. Las estadísticas lo indican.
- **Pruebas sin Firebase:** abrir la web con `?modo=local` usa el almacenamiento del navegador.
