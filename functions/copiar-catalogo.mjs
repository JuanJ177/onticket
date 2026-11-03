// Copia a functions/catalogo/ los archivos con los eventos, lugares, precios y planos
// (los mismos que usan la web y la app). Así el servidor calcula los precios
// con la misma información oficial. Se ejecuta solo antes de publicar.

import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));

mkdirSync(join(aqui, "catalogo"), { recursive: true });

["data.js", "planos.js"].forEach(f => cpSync(join(aqui, "..", f), join(aqui, "catalogo", f)));

console.log("✔ Catálogo copiado a functions/catalogo/");
