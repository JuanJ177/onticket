// Copia el APK recién compilado a app/OnTicket.apk y a descargas/OnTicket.apk
// (el botón "Descargar para Android" de la web descarga este último).

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const apk = join(app, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");

copyFileSync(apk, join(app, "OnTicket.apk"));

mkdirSync(join(app, "..", "descargas"), { recursive: true });
copyFileSync(apk, join(app, "..", "descargas", "OnTicket.apk"));

// la web anuncia la versión nueva: las apps instaladas la ven y ofrecen actualizar
const version = JSON.parse(readFileSync(join(app, "version.json"), "utf8"));

writeFileSync(join(app, "..", "version-app.json"), JSON.stringify({
    ...version,
    apk: "descargas/OnTicket.apk",
    publicada: new Date().toISOString()
}, null, 2) + "\n");

console.log(`✔ APK ${version.nombre} listo en app/OnTicket.apk y descargas/OnTicket.apk (y anunciado en version-app.json)`);
