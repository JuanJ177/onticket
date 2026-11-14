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

    return i < 26 ? String.fromCharCode(65 + i) : letraFila(Math.floor(i / 26) - 1) + String.fromCharCode(65 + i % 26);
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
       { id, tipo:"escenario" | "bloque", x, y, w, h, rot, texto },
       { id, tipo:"sillas", zona, nombre, x, y, filas, columnas, rot },
       { id, tipo:"palcos", zona, nombre, x, y, filas, columnas, rot, forma:"circulo" | "cuadro", individuales:% },
       { id, tipo:"general", zona, x, y, w, h, rot, capacidad, texto },
       { id, tipo:"curva", zona, nombre, cx, cy, radio, filas, desde, hasta }   tribuna en curva (grados)
     ]
   }

   Planos grandes (estadios): más de 2.500 ubicaciones numeradas se muestran
   en dos niveles. El "piso" 0 es el mapa con las secciones; cada sección es
   su propio piso con sus sillas. Así el celular nunca dibuja miles a la vez.
======================================== */

const CELDA_PLANO = {
    sillas: { w:24, h:24 },
    circulo: { w:24, h:24 },
    cuadro: { w:52, h:40 }
};

const UMBRAL_SECCIONES = 2500;

const MAX_POR_SECCION = 5000;

const NUMERADOS = ["sillas", "palcos", "curva"];

const rad = g => g * Math.PI / 180;

// ancho y alto del bloque sin girar
function medidaBloque(b){

    if(b.tipo === "sillas" || b.tipo === "palcos"){

        const c = b.tipo === "sillas" ? CELDA_PLANO.sillas : CELDA_PLANO[b.forma === "cuadro" ? "cuadro" : "circulo"];

        return { w: b.columnas * c.w, h: b.filas * c.h };
    }

    if(b.tipo === "curva"){

        const r = b.radio + b.filas * 24;

        return { w: r * 2, h: r * 2 };
    }

    return { w: b.w, h: b.h };
}

// sillas de cada fila de una tribuna en curva (una cada 24 unidades de arco)
function sillasFilaCurva(b, f){

    const r = b.radio + f * 24 + 12;

    const grados = Math.abs(b.hasta - b.desde);

    return Math.max(1, Math.floor(r * rad(grados) / 24));
}

// cuántas ubicaciones numeradas tiene un bloque
function ubicacionesBloque(b){

    if(b.tipo === "sillas" || b.tipo === "palcos") return b.filas * b.columnas;

    if(b.tipo === "curva"){

        let n = 0;

        for(let f = 0; f < b.filas; f++) n += sillasFilaCurva(b, f);

        return n;
    }

    return 0;
}

// gira un punto alrededor de un centro
function girar(x, y, cx, cy, grados){

    if(!grados) return { x, y };

    const c = Math.cos(rad(grados)), s = Math.sin(rad(grados));

    return { x: cx + (x - cx) * c - (y - cy) * s, y: cy + (x - cx) * s + (y - cy) * c };
}

// contorno de un bloque en el lienzo (para el mapa de secciones y el editor)
function contornoBloque(b){

    if(b.tipo === "curva"){

        const r1 = b.radio, r2 = b.radio + b.filas * 24;

        const a1 = rad(b.desde), a2 = rad(b.hasta);

        const p = (r, a) => `${(b.cx + r * Math.cos(a)).toFixed(1)} ${(b.cy + r * Math.sin(a)).toFixed(1)}`;

        const grande = Math.abs(b.hasta - b.desde) > 180 ? 1 : 0;

        const sentido = b.hasta > b.desde ? 1 : 0;

        return `M ${p(r1, a1)} L ${p(r2, a1)} A ${r2} ${r2} 0 ${grande} ${sentido} ${p(r2, a2)} L ${p(r1, a2)} A ${r1} ${r1} 0 ${grande} ${1 - sentido} ${p(r1, a1)} Z`;
    }

    const m = medidaBloque(b);

    const cx = b.x + m.w / 2, cy = b.y + m.h / 2;

    const esquinas = [[b.x, b.y], [b.x + m.w, b.y], [b.x + m.w, b.y + m.h], [b.x, b.y + m.h]]
        .map(([x, y]) => girar(x, y, cx, cy, b.rot || 0));

    return "M " + esquinas.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ") + " Z";
}

// centro visual del bloque (para escribir su nombre)
function centroBloque(b){

    if(b.tipo === "curva"){

        const medio = rad((b.desde + b.hasta) / 2);

        const r = b.radio + b.filas * 12;

        return { x: b.cx + r * Math.cos(medio), y: b.cy + r * Math.sin(medio) };
    }

    const m = medidaBloque(b);

    return { x: b.x + m.w / 2, y: b.y + m.h / 2 };
}

// Revisa que el diseño sea válido y razonable (también lo usa el servidor)
function validarDiseno(d){

    const n = v => Number.isFinite(v);

    if(!d || !Array.isArray(d.zonas) || !Array.isArray(d.bloques)) throw new Error("El plano está vacío");

    if(!(d.w >= 200 && d.w <= 6000 && d.h >= 200 && d.h <= 6000)) throw new Error("El tamaño del plano no es válido");

    if(d.zonas.length > 60 || d.bloques.length > 400) throw new Error("El plano tiene demasiados elementos");

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

    const tipoZona = { sillas:"asiento", palcos:"palco", general:"general", curva:"asiento" };

    d.bloques.forEach(b => {

        if(!b || !/^[\w-]{1,20}$/.test(b.id) || ids.has(b.id)) throw new Error("Hay un bloque inválido");

        ids.add(b.id);

        if(!["escenario", "bloque", "sillas", "palcos", "general", "curva"].includes(b.tipo)) throw new Error("Tipo de bloque inválido");

        if(b.tipo === "curva"){

            if(!(n(b.cx) && n(b.cy) && b.radio >= 10 && b.radio <= 5000 && b.filas >= 1 && b.filas <= 100)) throw new Error("Una tribuna en curva tiene medidas inválidas");

            if(!(n(b.desde) && n(b.hasta) && Math.abs(b.hasta - b.desde) >= 5 && Math.abs(b.hasta - b.desde) <= 360)) throw new Error("Una tribuna en curva tiene ángulos inválidos");

        }else if(!(n(b.x) && n(b.y))){

            throw new Error("Hay un bloque sin posición");
        }

        if(b.rot !== undefined && !(n(b.rot) && Math.abs(b.rot) <= 360)) throw new Error("Hay un bloque con un giro inválido");

        if(tipoZona[b.tipo]){

            const z = zonas[b.zona];

            if(!z || z.tipo !== tipoZona[b.tipo]) throw new Error("Hay un bloque sin localidad");
        }

        if(b.tipo === "sillas" || b.tipo === "palcos"){

            if(!(b.filas >= 1 && b.filas <= 100 && b.columnas >= 1 && b.columnas <= 200)) throw new Error("Filas o columnas fuera de rango");
        }

        const u = ubicacionesBloque(b);

        if(u > MAX_POR_SECCION) throw new Error(`Una sección tiene ${u.toLocaleString("es-CO")} ubicaciones; divídela (máximo ${MAX_POR_SECCION.toLocaleString("es-CO")} por sección)`);

        total += u;

        if(b.tipo === "general" && !(b.capacidad >= 1 && b.capacidad <= 100000)) throw new Error("Ponle capacidad a la zona general");

        if(["escenario", "bloque", "general"].includes(b.tipo) && !(b.w >= 10 && b.h >= 10)) throw new Error("Hay un bloque demasiado pequeño");
    });

    if(total > 120000) throw new Error("El plano tiene demasiadas ubicaciones (máximo 120.000 numeradas)");

    if(!d.bloques.some(b => tipoZona[b.tipo])) throw new Error("El plano no tiene ubicaciones para vender");

    return true;
}

// Sillas y palcos de un bloque. Con "local" quedan derechas desde (0, 0)
// (vista de una sección); si no, en su lugar real del lienzo, giradas.
function ubicacionesDeBloque(b, z, numPalco, local){

    const asientos = [], palcos = [];

    const nombreSeccion = b.nombre || "";

    if(b.tipo === "curva"){

        // en una curva la vista de la sección también es curva: se corre al origen después
        for(let f = 0; f < b.filas; f++){

            const r = b.radio + f * 24 + 12;

            const cuantas = sillasFilaCurva(b, f);

            const paso = (b.hasta - b.desde) / cuantas;

            const fila = letraFila(f);

            for(let k = 0; k < cuantas; k++){

                const a = rad(b.desde + paso * (k + 0.5));

                asientos.push({ id:`${b.id}-${fila}${k + 1}`, zona:b.zona, fila, num:k + 1, seccion:nombreSeccion, x:b.cx + r * Math.cos(a), y:b.cy + r * Math.sin(a) });
            }
        }

        return { asientos, palcos };
    }

    const m = medidaBloque(b);

    const cx = m.w / 2, cy = m.h / 2;

    // de coordenadas del bloque al lienzo
    const ubicar = (x, y) => {

        if(local) return { x, y };

        const p = girar(x, y, cx, cy, b.rot || 0);

        return { x: b.x + p.x, y: b.y + p.y };
    };

    if(b.tipo === "sillas"){

        for(let f = 0; f < b.filas; f++){

            const fila = letraFila(f);

            for(let c = 0; c < b.columnas; c++){

                const p = ubicar(c * 24 + 12, f * 24 + 12);

                asientos.push({ id:`${b.id}-${fila}${c + 1}`, zona:b.zona, fila, num:c + 1, seccion:nombreSeccion, x:p.x, y:p.y });
            }
        }

        return { asientos, palcos };
    }

    // palcos de 10 personas: la primera fila del bloque siempre es de palcos completos
    const circulo = b.forma !== "cuadro";

    const celda = CELDA_PLANO[circulo ? "circulo" : "cuadro"];

    const delBloque = [];

    for(let f = 0; f < b.filas; f++){

        for(let c = 0; c < b.columnas; c++){

            numPalco[b.zona] = (numPalco[b.zona] || 0) + 1;

            const num = numPalco[b.zona];

            const centro = ubicar(c * celda.w + celda.w / 2, f * celda.h + celda.h / 2);

            const w = circulo ? 20 : celda.w - 6, h = circulo ? 20 : celda.h - 8;

            const palco = { id:`${b.id}-P${num}`, zona:b.zona, num, seccion:nombreSeccion, x:centro.x - w / 2, y:centro.y - h / 2, w, h, capacidad:10, individual:false };

            if(circulo) palco.circulo = true;

            else if(!local && b.rot) palco.rot = b.rot;

            palcos.push(palco);

            delBloque.push({ palco, f });
        }
    }

    const cuantos = Math.round(delBloque.length * Math.min(100, Math.max(0, Number(b.individuales) || 0)) / 100);

    delBloque.filter(x => x.f > 0)
        .sort((a, c) => azarPlano(a.palco.id) - azarPlano(c.palco.id))
        .slice(0, cuantos)
        .forEach(x => x.palco.individual = true);

    return { asientos, palcos };
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

    const total = d.bloques.reduce((s, b) => s + ubicacionesBloque(b), 0);

    const porSecciones = total > UMBRAL_SECCIONES;

    const mapa = { id:"mapa", nombre:"Mapa", w:d.w, h:d.h, formas:[], asientos:[], palcos:[], generales:[] };

    const pisos = [mapa];

    const numPalco = {};

    const numSeccion = {};

    d.bloques.forEach(b => {

        if(b.tipo === "escenario" || b.tipo === "bloque"){

            mapa.formas.push({ t:"rect", x:b.x, y:b.y, w:b.w, h:b.h, rx:10, rot:b.rot || 0, cls:b.tipo === "escenario" ? "escenario" : "bloque", texto:b.texto || "", vertical:b.h > b.w * 1.6 });

            return;
        }

        const z = zonas[b.zona];

        if(b.tipo === "general"){

            mapa.generales.push({ id:b.id, zona:b.zona, x:b.x, y:b.y, w:b.w, h:b.h, rot:b.rot || 0, texto:(b.texto || z.nombre).toUpperCase(), capacidad:b.capacidad });

            return;
        }

        if(!porSecciones){

            // plano pequeño: todo en una sola vista, en su lugar real
            const u = ubicacionesDeBloque(b, z, numPalco, false);

            mapa.asientos.push(...u.asientos);

            mapa.palcos.push(...u.palcos);

            const c = centroBloque(b);

            const m = medidaBloque(b);

            if(b.tipo !== "curva") mapa.formas.push({ t:"text", x:c.x, y:b.y - 6, texto:(b.nombre || z.nombre).toUpperCase(), cls:"miniText", rotar:b.rot || 0, cx:c.x, cy:c.y, alto:m.h });

            return;
        }

        // estadio: cada bloque numerado es una sección con su propia vista
        numSeccion[b.zona] = (numSeccion[b.zona] || 0) + 1;

        const nombre = b.nombre || `${z.nombre} ${numSeccion[b.zona]}`;

        const u = ubicacionesDeBloque({ ...b, nombre }, z, numPalco, true);

        const todos = [...u.asientos.map(a => ({ x:a.x - 12, y:a.y - 12, w:24, h:24 })), ...u.palcos];

        const minX = Math.min(...todos.map(p => p.x)), minY = Math.min(...todos.map(p => p.y));

        const maxX = Math.max(...todos.map(p => p.x + p.w)), maxY = Math.max(...todos.map(p => p.y + p.h));

        const PAD = 40;

        const dx = PAD - minX, dy = PAD + 30 - minY;

        u.asientos.forEach(a => { a.x += dx; a.y += dy; });

        u.palcos.forEach(p => { p.x += dx; p.y += dy; });

        const ancho = maxX - minX + PAD * 2, alto = maxY - minY + PAD * 2 + 30;

        // letra de cada fila a la izquierda (en tribunas rectas)
        const letras = [];

        if(b.tipo === "sillas"){

            const filas = {};

            u.asientos.forEach(a => { if(!filas[a.fila] || a.x < filas[a.fila].x) filas[a.fila] = a; });

            Object.values(filas).forEach(a => letras.push({ t:"text", x:a.x - 22, y:a.y + 4, texto:a.fila, cls:"filaText" }));
        }

        const piso = {
            id: b.id,
            nombre,
            w: Math.max(ancho, 260),
            h: alto,
            formas: [{ t:"text", x:Math.max(ancho, 260) / 2, y:30, texto:`${z.nombre.toUpperCase()} · ${nombre.toUpperCase()}`, cls:"miniText" }, ...letras],
            asientos: u.asientos,
            palcos: u.palcos,
            generales: []
        };

        pisos.push(piso);

        const c = centroBloque(b);

        mapa.formas.push({ t:"seccion", piso:pisos.length - 1, zona:b.zona, d:contornoBloque(b), texto:nombre, x:c.x, y:c.y });
    });

    return { id:"propio", nombre:"Plano propio", zonas, pisos, secciones: porSecciones };
}

// blanco o casi negro según qué se lea mejor sobre el color de la localidad
function textoSobreColor(hex){

    const v = parseInt(String(hex || "#888888").slice(1), 16);

    const luz = (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;

    return luz > 0.62 ? "#1f2328" : "#fff";
}
