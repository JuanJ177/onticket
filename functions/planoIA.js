/* ========================================
   ARMAR PLANO CON IA
   Claude mira la imagen del plano real y devuelve las localidades y los
   bloques (filas de sillas, tribunas en curva, palcos, zonas generales,
   escenario y textos). Este módulo convierte esa respuesta al formato del
   editor de planos (planos.js) para que el promotor solo corrija.

   Las coordenadas que devuelve la IA van en una escala fija: el ancho de la
   imagen mide 1000 y el alto lo que corresponda a su proporción. Aquí se
   escalan al lienzo para que las sillas (24 unidades) queden del tamaño
   que se ve en la imagen.
======================================== */

const MODELO = "claude-opus-5-5";

const TIPOS_BLOQUE = ["escenario", "bloque", "sillas", "palcos", "general", "curva"];

const COLORES_ZONA = ["#e53935", "#1e9be9", "#f5b400", "#8bc34a", "#d63ee8", "#f28b82", "#a3a9b3", "#4b4ab5", "#ff7a00", "#00a39b"];

// precios de partida (el promotor pone los reales antes de guardar)
const PRECIO_BASE = { asiento: 80000, palco: 1500000, general: 60000 };

const CELDA = { sillas: 24, circulo: 24, cuadroW: 52, cuadroH: 40, filaCurva: 24 };

// Lo que la IA debe devolver. Todos los campos son obligatorios (0 o "" cuando no aplican).
const ESQUEMA = {
    type: "object",
    additionalProperties: false,
    required: ["zonas", "bloques", "notas"],
    properties: {
        zonas: {
            type: "array",
            description: "Localidades del evento (cada una con su precio aparte).",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "nombre", "tipo"],
                properties: {
                    id: { type: "string", description: "Identificador corto, por ejemplo z1" },
                    nombre: { type: "string", description: "Nombre como aparece en el plano: VIP, Platea, Oriental Alta..." },
                    tipo: { type: "string", enum: ["asiento", "palco", "general"] }
                }
            }
        },
        bloques: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["tipo", "zona", "nombre", "texto", "centroX", "centroY", "ancho", "alto", "giro",
                    "filas", "columnas", "forma", "capacidad", "radioInterior", "radioExterior", "desde", "hasta"],
                properties: {
                    tipo: { type: "string", enum: TIPOS_BLOQUE },
                    zona: { type: "string", description: "id de la localidad; vacío para escenario y bloque" },
                    nombre: { type: "string", description: "Nombre de la sección o tribuna (Sección 101, Lateral A...). Puede ir vacío." },
                    texto: { type: "string", description: "Texto visible (ESCENARIO, BAÑOS, ENTRADA, CANCHA...)" },
                    centroX: { type: "number" },
                    centroY: { type: "number" },
                    ancho: { type: "number", description: "Ancho del bloque sin girar" },
                    alto: { type: "number", description: "Alto del bloque sin girar" },
                    giro: { type: "number", description: "Grados en el sentido del reloj (0 si está derecho)" },
                    filas: { type: "integer" },
                    columnas: { type: "integer", description: "Sillas o palcos por fila" },
                    forma: { type: "string", enum: ["circulo", "cuadro"], description: "Solo palcos" },
                    capacidad: { type: "integer", description: "Solo zonas generales: personas de pie" },
                    radioInterior: { type: "number", description: "Solo curva" },
                    radioExterior: { type: "number", description: "Solo curva" },
                    desde: { type: "number", description: "Solo curva: ángulo inicial en grados" },
                    hasta: { type: "number", description: "Solo curva: ángulo final en grados" }
                }
            }
        },
        notas: { type: "string", description: "En español y corto: lo que no se alcanzó a leer bien y conviene revisar" }
    }
};

function instrucciones(ancho, alto, nota){

    return `Eres un experto en planos de escenarios, teatros y estadios. La imagen es el plano de ubicaciones de un evento en Colombia.
Conviértela en bloques para un editor de planos de boletería. El objetivo es que el plano quede casi idéntico al de la imagen y que la cantidad de sillas sea la real.

ESCALA: el ancho de la imagen mide 1000 unidades y el alto ${alto}. El origen (0, 0) es la esquina superior izquierda; "y" crece hacia abajo.
Todas las posiciones y medidas van en esa escala (no en píxeles).

LOCALIDADES (zonas): una por cada precio o color distinto del plano (VIP, Platea, Preferencia, Gramilla...).
- tipo "asiento": sillas numeradas. "palco": palcos de 10 personas que se venden completos. "general": de pie o sin silla asignada.
- Usa el nombre que tenga en el plano. Si no tiene nombre, inventa uno corto y claro.

BLOQUES (cada uno con su localidad en "zona", menos escenario y bloque):
- "escenario": la tarima o escenario, con texto "ESCENARIO" (o "CANCHA" en un estadio si no se vende).
- "bloque": cosas que no se venden: baños, entradas, consola de sonido, pasillos con nombre. "texto" con lo que dice.
- "sillas": un grupo rectangular de sillas numeradas. "filas" y "columnas" (sillas por fila) deben ser el número real: cuéntalas si se ven; si el plano solo muestra áreas, calcúlalas con el tamaño del área (cada silla ocupa más o menos lo mismo en todo el plano). Si las filas tienen distinta cantidad de sillas, usa el promedio o divide en varios bloques.
- "palcos": grupo de palcos en cuadrícula; "forma" circulo (mesas redondas) o cuadro.
- "general": área sin sillas; "capacidad" = personas de pie (unas 2,5 por metro cuadrado si no se indica).
- "curva": tribuna en arco (estadios, teatros en herradura). (centroX, centroY) es el centro del círculo, radioInterior y radioExterior marcan el arco, "filas" es cuántas filas tiene, y "desde"/"hasta" son los ángulos en grados: 0 = derecha, 90 = abajo, 180 = izquierda, 270 = arriba (sentido del reloj, porque y crece hacia abajo).
- Para los demás: (centroX, centroY) es el centro del bloque, ancho y alto su tamaño SIN girar y "giro" los grados para dejarlo como se ve (sentido del reloj).
- En estadios divide cada tribuna en las secciones que muestre el plano (cada una es un bloque con su nombre).
- Máximo 150 bloques. Los campos que no apliquen van en 0 o "".

En "notas" escribe en español, máximo dos frases, qué conviene revisar (por ejemplo "No se alcanzan a contar las sillas de la Platea; revisa las columnas").${nota ? `\n\nINDICACIONES DEL ORGANIZADOR (úsalas solo para entender el plano): ${nota}` : ""}`;
}

const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const entero = (v, a, b) => clamp(Math.round(num(v)), a, b);

const mediana = l => { const s = [...l].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

// Convierte la respuesta de la IA al diseño del editor ({ w, h, zonas, bloques })
function aDiseno(r, anchoImg, altoImg){

    const proporcion = altoImg / anchoImg;

    const altoEscala = 1000 * proporcion;

    // 1) localidades
    const idsZona = {};

    const zonas = (r.zonas || []).slice(0, 40).map((z, i) => {

        const tipo = ["asiento", "palco", "general"].includes(z.tipo) ? z.tipo : "asiento";

        const id = "z" + (i + 1);

        idsZona[String(z.id)] = id;

        const zona = { id, nombre: String(z.nombre || "").trim().slice(0, 40) || `Localidad ${i + 1}`, color: COLORES_ZONA[i % COLORES_ZONA.length], tipo, precio: PRECIO_BASE[tipo] };

        if(tipo === "palco") zona.precioPuesto = Math.round(PRECIO_BASE.palco / 10 * 1.08 / 1000) * 1000;

        return zona;
    });

    const tipoDe = id => (zonas.find(z => z.id === id) || {}).tipo;

    const tipoZona = { sillas: "asiento", palcos: "palco", general: "general", curva: "asiento" };

    // 2) bloques (todavía en la escala de la imagen)
    const crudos = (r.bloques || []).slice(0, 150).filter(b => TIPOS_BLOQUE.includes(b.tipo)).map(b => {

        const zona = idsZona[String(b.zona)] || "";

        // si el bloque necesita localidad y la que trae no sirve, se crea una del tipo correcto
        if(tipoZona[b.tipo] && tipoDe(zona) !== tipoZona[b.tipo]){

            let z = zonas.find(x => x.tipo === tipoZona[b.tipo]);

            if(!z){

                const t = tipoZona[b.tipo];

                z = { id: "z" + (zonas.length + 1), nombre: { asiento: "Platea", palco: "Palcos", general: "General" }[t], color: COLORES_ZONA[zonas.length % COLORES_ZONA.length], tipo: t, precio: PRECIO_BASE[t] };

                if(t === "palco") z.precioPuesto = Math.round(PRECIO_BASE.palco / 10 * 1.08 / 1000) * 1000;

                zonas.push(z);
            }

            return { ...b, zona: z.id };
        }

        return { ...b, zona };
    });

    // 3) escala: unidades del lienzo por unidad de la imagen, para que las sillas
    //    (24 unidades cada una) ocupen en el lienzo lo mismo que en la imagen
    const muestras = [];

    crudos.forEach(b => {

        if(b.tipo === "sillas" && num(b.ancho) > 5 && num(b.columnas) >= 1){

            muestras.push(entero(b.columnas, 1, 200) * CELDA.sillas / num(b.ancho));
        }

        if(b.tipo === "palcos" && num(b.ancho) > 5 && num(b.columnas) >= 1){

            muestras.push(entero(b.columnas, 1, 200) * (b.forma === "cuadro" ? CELDA.cuadroW : CELDA.circulo) / num(b.ancho));
        }

        const grosor = num(b.radioExterior) - num(b.radioInterior);

        if(b.tipo === "curva" && grosor > 3 && num(b.filas) >= 1){

            muestras.push(entero(b.filas, 1, 100) * CELDA.filaCurva / grosor);
        }
    });

    // sin sillas que medir, un lienzo de 1.000 de ancho
    let k = mediana(muestras) || 1;

    // el lienzo debe quedar entre 600 y 6.000 de ancho (y de alto)
    const maxK = Math.min(6, 6000 / Math.max(1000, altoEscala));

    k = clamp(k, 0.6, maxK);

    const w = clamp(Math.round(1000 * k / 20) * 20, 300, 6000);

    const h = clamp(Math.round(altoEscala * k / 20) * 20, 300, 6000);

    // 4) bloques en el lienzo
    const bloques = [];

    crudos.forEach((b, i) => {

        const id = "b" + (i + 1);

        const giro = clamp(Math.round(num(b.giro)), -360, 360);

        const cx = num(b.centroX) * k, cy = num(b.centroY) * k;

        if(b.tipo === "curva"){

            const radio = clamp(Math.round(num(b.radioInterior) * k), 10, 5000);

            const filas = entero(b.filas, 1, 100);

            let desde = Math.round(num(b.desde)), hasta = Math.round(num(b.hasta));

            if(Math.abs(hasta - desde) < 5) return;

            if(Math.abs(hasta - desde) > 360) hasta = desde + 360 * Math.sign(hasta - desde);

            bloques.push({ id, tipo: "curva", zona: b.zona, nombre: String(b.nombre || "").slice(0, 30), cx: Math.round(cx), cy: Math.round(cy), radio, filas, desde, hasta });

            return;
        }

        if(b.tipo === "sillas" || b.tipo === "palcos"){

            const filas = entero(b.filas, 1, 100);

            const columnas = entero(b.columnas, 1, 200);

            const forma = b.forma === "cuadro" ? "cuadro" : "circulo";

            const anchoReal = columnas * (b.tipo === "sillas" ? CELDA.sillas : (forma === "cuadro" ? CELDA.cuadroW : CELDA.circulo));

            const altoReal = filas * (b.tipo === "sillas" ? CELDA.sillas : (forma === "cuadro" ? CELDA.cuadroH : CELDA.circulo));

            const bloque = { id, tipo: b.tipo, zona: b.zona, nombre: String(b.nombre || "").slice(0, 30), x: Math.round(cx - anchoReal / 2), y: Math.round(cy - altoReal / 2), filas, columnas, rot: giro };

            if(b.tipo === "palcos") bloque.forma = forma;

            bloques.push(bloque);

            return;
        }

        const bw = Math.max(10, Math.round(num(b.ancho) * k));

        const bh = Math.max(10, Math.round(num(b.alto) * k));

        const bloque = { id, tipo: b.tipo, x: Math.round(cx - bw / 2), y: Math.round(cy - bh / 2), w: bw, h: bh, rot: giro, texto: String(b.texto || "").slice(0, 40) };

        if(b.tipo === "general"){

            bloque.zona = b.zona;

            bloque.capacidad = entero(b.capacidad, 1, 100000) || Math.max(1, Math.round(bw * bh / 900));
        }

        bloques.push(bloque);
    });

    // localidades que no quedaron con ningún bloque
    const usadas = new Set(bloques.map(b => b.zona).filter(Boolean));

    return { w, h, zonas: zonas.filter(z => usadas.has(z.id)), bloques };
}

// Llama a Claude con la imagen y devuelve { diseno, notas, uso }
async function armarConIA(cliente, { imagenBase64, tipoImagen, anchoImg, altoImg, nota }){

    const altoEscala = Math.round(1000 * altoImg / anchoImg);

    const respuesta = await cliente.beta.messages.create({
        model: MODELO,
        max_tokens: 32000,
        // si un filtro de seguridad rechaza por error, el servidor reintenta con otro modelo
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
            effort: "high",
            format: { type: "json_schema", schema: ESQUEMA }
        },
        messages: [{
            role: "user",
            content: [
                { type: "image", source: { type: "base64", media_type: tipoImagen, data: imagenBase64 } },
                { type: "text", text: instrucciones(1000, altoEscala, nota) }
            ]
        }]
    });

    if(respuesta.stop_reason === "refusal") throw new Error("La IA no pudo procesar esta imagen. Intenta con otra o arma el plano a mano.");

    if(respuesta.stop_reason === "max_tokens") throw new Error("El plano es demasiado grande para armarlo de una vez. Recorta la imagen por partes.");

    const texto = respuesta.content.filter(c => c.type === "text").map(c => c.text).join("");

    let datos;

    try{ datos = JSON.parse(texto); }catch(e){ throw new Error("La IA devolvió un plano que no se pudo leer. Intenta de nuevo."); }

    return {
        diseno: aDiseno(datos, anchoImg, altoImg),
        notas: String(datos.notas || "").slice(0, 400),
        uso: respuesta.usage ? { entrada: respuesta.usage.input_tokens, salida: respuesta.usage.output_tokens } : null
    };
}

module.exports = { armarConIA, aDiseno, ESQUEMA, MODELO };
