// Copia a www/ los archivos que la app comparte con la web
// (eventos, planos, lógica, datos, imágenes) y las librerías.
// Se ejecuta con: npm run copiar

import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(app, "..");
const www = join(app, "www");

const compartidos = [
    "firebase-config.js",
    "data.js",
    "planos.js",
    "planos.css",
    "core.js",
    "db.js"
];

compartidos.forEach(f => cpSync(join(web, f), join(www, f)));

cpSync(join(web, "img"), join(www, "img"), { recursive: true });

mkdirSync(join(www, "lib"), { recursive: true });

const librerias = {
    "qrcode-generator/dist/qrcode.js": "qrcode.js",
    "firebase/firebase-app-compat.js": "firebase-app-compat.js",
    "firebase/firebase-auth-compat.js": "firebase-auth-compat.js",
    "firebase/firebase-firestore-compat.js": "firebase-firestore-compat.js"
};

Object.entries(librerias).forEach(([origen, destino]) =>
    cpSync(join(app, "node_modules", origen), join(www, "lib", destino)));

// íconos (Font Awesome) para que funcionen sin internet
const fa = join(app, "node_modules", "@fortawesome", "fontawesome-free");

cpSync(join(fa, "css", "all.min.css"), join(www, "lib", "fontawesome", "css", "all.min.css"));

cpSync(join(fa, "webfonts"), join(www, "lib", "fontawesome", "webfonts"), { recursive: true });

console.log("✔ Archivos compartidos copiados a www/");
