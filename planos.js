/* ========================================
   PLANOS DE LOS LUGARES
   Cada plano genera coordenadas para dibujarlo en SVG:
   - asientos: sillas numeradas
   - palcos: palcos de 10 personas (completos o individuales)
   - generales: zonas sin silla asignada (se compra por cantidad)
   - formas: tarima, FOH, baños, textos, etc.
======================================== */

const TIPO_ZONA = {
    asiento: "Silla numerada",
    palco: "Palco 10 personas",
    general: "General (sin silla)"
};


function letraFila(i){

    return String.fromCharCode(65 + i);
}



/* ========================================
   COLISEO LAS MALOCAS
   Basado en el plano real (Marco Antonio Solís 2025).
   Cada puntico es un palco de 10 personas. La primera fila de cada
   localidad es de palcos completos; de ahí para atrás, cerca del 20 %
   se vende por puesto (palcos individuales), repartidos al azar.
   La Gradería es general (por orden de llegada).
======================================== */

// azar estable (el mismo resultado en la web, la app y el servidor)
function azarPlano(texto){

    let h = 2166136261;

    for(let i = 0; i < texto.length; i++){

        h ^= texto.charCodeAt(i);

        h = Math.imul(h, 16777619);
    }

    return ((h >>> 0) % 10000) / 10000;
}

function construirMalocas(){

    const P = 24;          // separación entre sillas
    const COLS = 19;       // sillas por fila
    const X0 = 78;         // margen para las etiquetas laterales
    const W = X0 * 2 + COLS * P;

    // precio = palco completo (10 personas); precioPuesto = un puesto en palco individual
    const zonas = {
        ar:       { nombre:"Alfombra Roja", color:"#e53935", texto:"#fff",    precio:6000000, precioPuesto:650000, tipo:"palco" },
        diamante: { nombre:"Diamante",      color:"#1e9be9", texto:"#fff",    precio:4500000, precioPuesto:480000, tipo:"palco" },
        oro:      { nombre:"Oro",           color:"#f5b400", texto:"#3a2a00", precio:3500000, precioPuesto:380000, tipo:"palco" },
        plata:    { nombre:"Plata",         color:"#a3a9b3", texto:"#1f2328", precio:2700000, precioPuesto:290000, tipo:"palco" },
        platino:  { nombre:"Platino",       color:"#f28b82", texto:"#3b0b07", precio:2200000, precioPuesto:240000, tipo:"palco" },
        bronce:   { nombre:"Bronce",        color:"#8bc34a", texto:"#1b3300", precio:1750000, precioPuesto:190000, tipo:"palco" },
        vip:      { nombre:"VIP",           color:"#d63ee8", texto:"#fff",    precio:1400000, precioPuesto:150000, tipo:"palco" },
        graderia: { nombre:"Gradería",      color:"#4b4ab5", texto:"#fff", precio:90000,  tipo:"general", capacidad:800 }
    };

    // segmentos de cada fila: número = sillas, g = pasillo, f = espacio del FOH
    const R18  = [9, {g:1}, 9];
    const F5   = [7, {f:5}, 7];
    const F3   = [8, {f:3}, 8];
    const F1   = [9, {f:1}, 9];
    const FULL = [19];

    const secciones = [
        ["ar",       [R18, R18, R18, R18]],
        ["diamante", [R18, R18, R18, R18, F5, F5]],
        ["oro",      [F5, F5, F3, F3, F1, FULL]],
        ["plata",    [FULL, FULL, FULL]],
        ["platino",  [FULL, FULL, FULL]],
        ["bronce",   [FULL, FULL, FULL, FULL]],
        ["vip",      [FULL, FULL, FULL, FULL]]
    ];

    const piso = { id:"p1", nombre:"Coliseo", w:W, h:0, formas:[], asientos:[], palcos:[], generales:[] };

    piso.formas.push({ t:"rect", x:X0 + 30, y:10, w:COLS * P - 60, h:56, rx:10, cls:"escenario", texto:"TARIMA" });

    piso.formas.push({ t:"rect", x:X0, y:80, w:COLS * P, h:46, rx:8, cls:"bloque", texto:"INVITADOS" });

    let y = 152;

    const filasInfo = [];

    secciones.forEach(([zona, filas]) => {

        const yInicio = y;

        let num = 1;

        const delaZona = [];

        filas.forEach((segmentos, filaIdx) => {

            let col = 0;

            const foh = [];

            segmentos.forEach(seg => {

                if(typeof seg === "number"){

                    for(let k = 0; k < seg; k++){

                        // palco de 10 personas dibujado como un puntico
                        const palco = {
                            id: `${zona}-${num}`,
                            zona,
                            num,
                            fila: letraFila(filaIdx),
                            x: X0 + col * P + P / 2 - 10,
                            y: y - 10,
                            w: 20, h: 20,
                            circulo: true,
                            capacidad: 10,
                            individual: false
                        };

                        piso.palcos.push(palco);

                        delaZona.push({ palco, filaIdx });

                        num++;
                        col++;
                    }

                }else if(seg.g){

                    col += seg.g;

                }else if(seg.f){

                    foh.push({ x: X0 + col * P, w: seg.f * P });

                    col += seg.f;
                }
            });

            filasInfo.push({ y, foh });

            y += P;
        });

        // palcos individuales: cerca del 20 %, nunca en la primera fila
        const candidatos = delaZona.filter(d => d.filaIdx > 0).sort((a, b) => azarPlano(a.palco.id) - azarPlano(b.palco.id));

        candidatos.slice(0, Math.round(delaZona.length * 0.2)).forEach(d => d.palco.individual = true);

        const alto = (y - P) - yInicio + P - 2;

        const z = zonas[zona];

        // etiquetas laterales (como en el plano real)
        piso.formas.push({ t:"pill", x:8, y:yInicio - P / 2 + 1, w:54, h:alto, zona, texto:z.nombre.toUpperCase() });

        piso.formas.push({ t:"pill", x:W - 62, y:yInicio - P / 2 + 1, w:54, h:alto, zona, texto:z.nombre.toUpperCase() });

        y += 12;
    });


    // FOH (consola de sonido) en el centro
    let fohX = 0, fohY = 0, fohN = 0;

    filasInfo.forEach((fila, i) => {

        const sig = filasInfo[i + 1];

        fila.foh.forEach(c => {

            const y1 = fila.y - P / 2;

            const y2 = (sig && sig.foh.length) ? sig.y - P / 2 : fila.y + P / 2;

            piso.formas.push({ t:"rect", x:c.x + 3, y:y1, w:c.w - 6, h:y2 - y1, rx:0, cls:"foh" });

            if(c.w === 5 * P){

                fohX += c.x + c.w / 2;
                fohY += fila.y;
                fohN++;
            }
        });
    });

    piso.formas.push({ t:"text", x:fohX / fohN, y:fohY / fohN + 6, texto:"FOH", cls:"fohText" });


    piso.generales.push({
        id: "graderia",
        zona: "graderia",
        x: X0, y: y + 4, w: COLS * P, h: 74,
        texto: "GRADERÍA"
    });

    piso.h = y + 96;

    return {
        id: "malocas",
        nombre: "Coliseo Las Malocas",
        zonas,
        pisos: [piso]
    };
}



/* ========================================
   LOS CAPACHOS
   Palcos de 10 personas en 2 pisos.
   Los palcos "individuales" se venden por puesto.
======================================== */

function construirCapachos(){

    const zonas = {
        ar:       { nombre:"Alfombra Roja", color:"#e53935", texto:"#fff", precio:2500000, precioPuesto:270000, tipo:"palco" },
        diamante: { nombre:"Palcos Diamante", color:"#1e9be9", texto:"#fff", precio:2000000, precioPuesto:215000, tipo:"palco" },
        oro:      { nombre:"Palcos Oro", color:"#f5b400", texto:"#3a2a00", precio:1600000, precioPuesto:175000, tipo:"palco" },
        plata:    { nombre:"Palcos Plata", color:"#a3a9b3", texto:"#1f2328", precio:1200000, precioPuesto:130000, tipo:"palco" },
        bronce:   { nombre:"Palcos Bronce", color:"#a0674b", texto:"#fff", precio:1000000, precioPuesto:110000, tipo:"palco" },
        general:  { nombre:"General", color:"#9ccc3c", texto:"#1b3300", precio:60000, tipo:"general", capacidad:400 },
        mez1:     { nombre:"Mezanine 1", color:"#9c27b0", texto:"#fff", precio:900000, precioPuesto:98000, tipo:"palco" },
        mez2:     { nombre:"Mezanine 2", color:"#f57c00", texto:"#fff", precio:800000, precioPuesto:88000, tipo:"palco" },
        general2: { nombre:"General 2do piso", color:"#7cb342", texto:"#fff", precio:50000, tipo:"general", capacidad:90 }
    };

    // palcos que se venden por puesto (en el plano real: punto verde)
    const individuales = {
        ar:[10], diamante:[10], oro:[10], plata:[5], bronce:[5], mez1:[5], mez2:[5]
    };

    const BX = 110, BW = 330;   // franja de palcos
    const PW = 50, PH = 32, PG = 8;

    function palco(piso, zona, num, x, y, w = PW, h = PH){

        piso.palcos.push({
            id: `${zona}-P${num}`,
            zona, num, x, y, w, h,
            capacidad: 10,
            individual: (individuales[zona] || []).includes(num)
        });
    }

    function franja(piso, zona, y, filas){

        const h = filas * PH + (filas - 1) * PG + 20;

        piso.formas.push({ t:"band", x:BX, y, w:BW, h, zona, texto:zonas[zona].nombre.toUpperCase() });

        let num = 1;

        for(let f = 0; f < filas; f++){

            for(let i = 0; i < 5; i++){

                palco(piso, zona, num++, BX + 30 + i * (PW + PG), y + 10 + f * (PH + PG));
            }
        }

        return y + h + 12;
    }


    // ---------- PISO 1 ----------
    const p1 = { id:"p1", nombre:"Piso 1", w:460, h:0, formas:[], asientos:[], palcos:[], generales:[] };

    p1.formas.push({ t:"rect", x:BX, y:16, w:BW, h:64, rx:10, cls:"escenario", texto:"ESCENARIO" });

    // palcos laterales de Alfombra Roja (11 al 20)
    p1.formas.push({ t:"rect", x:6, y:94, w:94, h:110, rx:8, cls:"marcoZona", zona:"ar" });

    const lateral = [
        [17, 0, 0], [18, 0, 1], [19, 0, 2], [20, 0, 3],
        [14, 1, 0], [15, 1, 1], [16, 1, 2],
        [11, 2, 0], [12, 2, 1], [13, 2, 2]
    ];

    lateral.forEach(([n, c, f]) => palco(p1, "ar", n, 12 + c * 29, 100 + f * 25, 26, 22));

    p1.formas.push({ t:"rect", x:6, y:250, w:54, h:220, rx:8, cls:"bloque", texto:"BAÑOS", vertical:true });

    let y = 96;

    y = franja(p1, "ar", y, 2);
    y = franja(p1, "diamante", y, 2);
    y = franja(p1, "oro", y, 2);
    y = franja(p1, "plata", y, 1);
    y = franja(p1, "bronce", y, 1);

    p1.generales.push({ id:"general", zona:"general", x:BX, y, w:BW, h:120, texto:"GENERAL" });

    p1.h = y + 136;


    // ---------- PISO 2 ----------
    const p2 = { id:"p2", nombre:"Piso 2 · Mezanine", w:470, h:0, formas:[], asientos:[], palcos:[], generales:[] };

    p2.formas.push({ t:"rect", x:BX, y:16, w:BW, h:64, rx:10, cls:"escenario", texto:"ESCENARIO" });

    p2.formas.push({ t:"rect", x:BX, y:96, w:262, h:420, rx:10, cls:"vacio", texto:"VACÍO · VISTA AL PISO 1" });

    p2.formas.push({ t:"text", x:BX + 302, y:318, texto:"GENERAL 2do PISO", cls:"miniText" });

    p2.generales.push({ id:"general2-A", zona:"general2", x:BX + 274, y:326, w:56, h:90, texto:"A", capacidad:45 });

    p2.generales.push({ id:"general2-B", zona:"general2", x:BX + 274, y:424, w:56, h:90, texto:"B", capacidad:45 });

    p2.formas.push({ t:"rect", x:446, y:326, w:18, h:316, rx:4, cls:"bloque", texto:"ESCALERAS", vertical:true, small:true });

    let y2 = 530;

    y2 = franja(p2, "mez1", y2, 1);
    y2 = franja(p2, "mez2", y2, 1);

    p2.h = y2 + 10;

    return {
        id: "capachos",
        nombre: "Los Capachos",
        zonas,
        pisos: [p1, p2]
    };
}



/* ========================================
   TEATRO (filas curvas)
   Se usa para el Teatro Santiago Londoño (Pereira)
======================================== */

function construirTeatro(id = "teatro", nombre = "Teatro", zonas, filasPorZona){

    zonas = zonas || {
        vip:       { nombre:"Platea VIP",          color:"#d63ee8", texto:"#fff", precio:260000, tipo:"asiento" },
        pref:      { nombre:"Platea Preferencial", color:"#1e9be9", texto:"#fff", precio:180000, tipo:"asiento" },
        general:   { nombre:"Platea General",      color:"#f5b400", texto:"#3a2a00", precio:120000, tipo:"asiento" },
        balcon:    { nombre:"Balcón",              color:"#8bc34a", texto:"#1b3300", precio:80000,  tipo:"asiento" }
    };

    filasPorZona = filasPorZona || [["vip", 3], ["pref", 5], ["general", 6], ["balcon", 4]];

    const W = 840, CX = W / 2, CY = -20, P = 24;

    const piso = { id:"p1", nombre, w:W, h:0, formas:[], asientos:[], palcos:[], generales:[] };

    piso.formas.push({ t:"rect", x:CX - 160, y:12, w:320, h:56, rx:28, cls:"escenario", texto:"ESCENARIO" });

    let r = 150;

    let filaGlobal = 0;

    let maxY = 0;

    filasPorZona.forEach(([zona, filas], zi) => {

        if(zona === "balcon"){

            r += 34;

            piso.formas.push({ t:"text", x:CX, y:CY + r - 14, texto:"— BALCÓN —", cls:"miniText" });
        }

        for(let f = 0; f < filas; f++){

            const paso = P / r;

            let n = Math.floor(1.3 * r / P);

            n -= n % 2;

            const mitad = n / 2;

            const posiciones = [];

            for(let k = mitad - 1; k >= 0; k--) posiciones.push(Math.PI / 2 + (k + 1) * paso);

            for(let k = 0; k < mitad; k++) posiciones.push(Math.PI / 2 - (k + 1) * paso);

            const letra = letraFila(filaGlobal);

            posiciones.forEach((a, i) => {

                const x = CX + r * Math.cos(a);

                const y = CY + r * Math.sin(a);

                maxY = Math.max(maxY, y);

                piso.asientos.push({ id:`${letra}-${i + 1}`, zona, fila:letra, num:i + 1, x, y });
            });

            const aIzq = posiciones[0] + paso;

            piso.formas.push({ t:"text", x:CX + r * Math.cos(aIzq), y:CY + r * Math.sin(aIzq) + 4, texto:letra, cls:"filaText" });

            const aDer = posiciones[posiciones.length - 1] - paso;

            piso.formas.push({ t:"text", x:CX + r * Math.cos(aDer), y:CY + r * Math.sin(aDer) + 4, texto:letra, cls:"filaText" });

            r += P;

            filaGlobal++;
        }

        r += 8;
    });

    piso.h = maxY + 40;

    return {
        id,
        nombre,
        zonas,
        pisos: [piso]
    };
}



const PLANOS = {
    malocas: construirMalocas(),
    capachos: construirCapachos(),
    teatro: construirTeatro(),
    // auditorio (ej. Bethlemitas, Bogotá): VIP adelante, luego Platea y Luneta
    auditorio: construirTeatro("auditorio", "Auditorio", {
        vip:    { nombre:"VIP",    color:"#d63ee8", texto:"#fff",    precio:110000, tipo:"asiento" },
        platea: { nombre:"Platea", color:"#1e9be9", texto:"#fff",    precio:100000, tipo:"asiento" },
        luneta: { nombre:"Luneta", color:"#f5b400", texto:"#3a2a00", precio:90000,  tipo:"asiento" }
    }, [["vip", 4], ["platea", 4], ["luneta", 7]])
};




/* ========================================
   PLANOS PROPIOS (editor visual)
   Un promotor arma el plano de un lugar nuevo con bloques.
   Aquí se convierten en sillas, palcos y zonas: el mismo
   resultado en la web, la app y el servidor.

   diseno = {
     w, h,                                      tamaño del lienzo
     zonas: [{ id, nombre, color, tipo, precio, precioPuesto }],
     bloques: [
       { id, tipo:"escenario" | "bloque", x, y, w, h, texto },
       { id, tipo:"sillas", zona, x, y, filas, columnas },
       { id, tipo:"palcos", zona, x, y, filas, columnas, forma:"circulo" | "cuadro", individuales:% },
       { id, tipo:"general", zona, x, y, w, h, capacidad }
     ]
   }
======================================== */

// tamaño de cada celda en el lienzo
const CELDA_PLANO = {
    sillas: { w:24, h:24 },
    circulo: { w:24, h:24 },
    cuadro: { w:52, h:40 }
};

// ancho y alto que ocupa un bloque
function medidaBloque(b){

    if(b.tipo === "sillas" || b.tipo === "palcos"){

        const c = b.tipo === "sillas" ? CELDA_PLANO.sillas : CELDA_PLANO[b.forma === "cuadro" ? "cuadro" : "circulo"];

        return { w: b.columnas * c.w, h: b.filas * c.h };
    }

    return { w: b.w, h: b.h };
}

// Revisa que el diseño sea válido y razonable (también lo usa el servidor)
function validarDiseno(d){

    const n = v => Number.isFinite(v);

    if(!d || !Array.isArray(d.zonas) || !Array.isArray(d.bloques)) throw new Error("El plano está vacío");

    if(!(d.w >= 200 && d.w <= 3000 && d.h >= 200 && d.h <= 3000)) throw new Error("El tamaño del plano no es válido");

    if(d.zonas.length > 40 || d.bloques.length > 300) throw new Error("El plano tiene demasiados elementos");

    const zonas = {};

    d.zonas.forEach(z => {

        if(!z || !/^[\w-]{1,20}$/.test(z.id) || zonas[z.id]) throw new Error("Hay una localidad inválida");

        if(!["asiento", "palco", "general"].includes(z.tipo)) throw new Error("Tipo de localidad inválido");

        if(!String(z.nombre || "").trim()) throw new Error("Todas las localidades necesitan nombre");

        if(!(n(z.precio) && z.precio > 0)) throw new Error(`Ponle precio a ${z.nombre}`);

        if(z.tipo === "palco" && !(n(z.precioPuesto) && z.precioPuesto > 0)) throw new Error(`Ponle precio por puesto a ${z.nombre}`);

        zonas[z.id] = z;
    });

    let total = 0;

    const ids = new Set();

    const tipoZona = { sillas:"asiento", palcos:"palco", general:"general" };

    d.bloques.forEach(b => {

        if(!b || !/^[\w-]{1,20}$/.test(b.id) || ids.has(b.id)) throw new Error("Hay un bloque inválido");

        ids.add(b.id);

        if(!["escenario", "bloque", "sillas", "palcos", "general"].includes(b.tipo)) throw new Error("Tipo de bloque inválido");

        if(!(n(b.x) && n(b.y))) throw new Error("Hay un bloque sin posición");

        if(tipoZona[b.tipo]){

            const z = zonas[b.zona];

            if(!z || z.tipo !== tipoZona[b.tipo]) throw new Error("Hay un bloque sin localidad");
        }

        if(b.tipo === "sillas" || b.tipo === "palcos"){

            if(!(b.filas >= 1 && b.filas <= 60 && b.columnas >= 1 && b.columnas <= 80)) throw new Error("Filas o columnas fuera de rango");

            total += b.filas * b.columnas;
        }

        if(b.tipo === "general" && !(b.capacidad >= 1 && b.capacidad <= 100000)) throw new Error("Ponle capacidad a la zona general");

        if(["escenario", "bloque", "general"].includes(b.tipo) && !(b.w >= 10 && b.h >= 10)) throw new Error("Hay un bloque demasiado pequeño");
    });

    if(total > 30000) throw new Error("El plano tiene demasiadas ubicaciones");

    if(!d.bloques.some(b => tipoZona[b.tipo])) throw new Error("El plano no tiene ubicaciones para vender");

    return true;
}

function construirPlanoPropio(d){

    const zonas = {};

    d.zonas.forEach(z => {

        zonas[z.id] = {
            nombre: z.nombre,
            color: z.color,
            texto: textoSobreColor(z.color),
            precio: z.precio,
            tipo: z.tipo
        };

        if(z.tipo === "palco") zonas[z.id].precioPuesto = z.precioPuesto;
    });

    const piso = { id:"p1", nombre:"Plano", w:d.w, h:d.h, formas:[], asientos:[], palcos:[], generales:[] };

    const numPalco = {};

    d.bloques.forEach(b => {

        if(b.tipo === "escenario" || b.tipo === "bloque"){

            piso.formas.push({ t:"rect", x:b.x, y:b.y, w:b.w, h:b.h, rx:10, cls:b.tipo === "escenario" ? "escenario" : "bloque", texto:b.texto || "", vertical:b.h > b.w * 1.6 });

            return;
        }

        const z = zonas[b.zona];

        if(b.tipo === "general"){

            piso.generales.push({ id:b.id, zona:b.zona, x:b.x, y:b.y, w:b.w, h:b.h, texto:(b.texto || z.nombre).toUpperCase(), capacidad:b.capacidad });

            return;
        }

        // nombre de la localidad encima del bloque
        const m = medidaBloque(b);

        piso.formas.push({ t:"text", x:b.x + m.w / 2, y:b.y - 6, texto:z.nombre.toUpperCase(), cls:"miniText" });

        if(b.tipo === "sillas"){

            for(let f = 0; f < b.filas; f++){

                for(let c = 0; c < b.columnas; c++){

                    const fila = letraFila(f);

                    piso.asientos.push({ id:`${b.id}-${fila}${c + 1}`, zona:b.zona, fila, num:c + 1, x:b.x + c * 24 + 12, y:b.y + f * 24 + 12 });
                }
            }

            return;
        }

        // palcos de 10 personas: la primera fila del bloque siempre es de palcos completos
        const circulo = b.forma !== "cuadro";

        const celda = CELDA_PLANO[circulo ? "circulo" : "cuadro"];

        const delBloque = [];

        for(let f = 0; f < b.filas; f++){

            for(let c = 0; c < b.columnas; c++){

                numPalco[b.zona] = (numPalco[b.zona] || 0) + 1;

                const num = numPalco[b.zona];

                const palco = circulo
                    ? { id:`${b.id}-P${num}`, zona:b.zona, num, x:b.x + c * 24 + 2, y:b.y + f * 24 + 2, w:20, h:20, circulo:true, capacidad:10, individual:false }
                    : { id:`${b.id}-P${num}`, zona:b.zona, num, x:b.x + c * celda.w + 3, y:b.y + f * celda.h + 4, w:celda.w - 6, h:celda.h - 8, capacidad:10, individual:false };

                piso.palcos.push(palco);

                delBloque.push({ palco, f });
            }
        }

        const cuantos = Math.round(delBloque.length * Math.min(100, Math.max(0, Number(b.individuales) || 0)) / 100);

        delBloque.filter(x => x.f > 0)
            .sort((a, c) => azarPlano(a.palco.id) - azarPlano(c.palco.id))
            .slice(0, cuantos)
            .forEach(x => x.palco.individual = true);
    });

    return { id:"propio", nombre:"Plano propio", zonas, pisos:[piso] };
}

// blanco o casi negro según qué se lea mejor sobre el color de la localidad
function textoSobreColor(hex){

    const v = parseInt(String(hex || "#888888").slice(1), 16);

    const luz = (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;

    return luz > 0.62 ? "#1f2328" : "#fff";
}
