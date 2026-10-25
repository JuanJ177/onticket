// Copia el APK recién compilado a app/OnTicket.apk y a descargas/OnTicket.apk
// (el botón "Descargar para Android" de la web descarga este último).

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const apk = join(app, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");

copyFileSync(apk, join(app, "OnTicket.apk"));

mkdirSync(join(app, "..", "descargas"), { recursive: true });
copyFileSync(apk, join(app, "..", "descargas", "OnTicket.apk"));

console.log("✔ APK listo en app/OnTicket.apk y descargas/OnTicket.apk");
