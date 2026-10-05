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
   Basado en el plano real (Marco Antonio Solís 2025)
======================================== */

function construirMalocas(){

    const P = 24;          // separación entre sillas
    const COLS = 19;       // sillas por fila
    const X0 = 78;         // margen para las etiquetas laterales
    const W = X0 * 2 + COLS * P;

    const zonas = {
        ar:       { nombre:"Alfombra Roja", color:"#e53935", texto:"#fff", precio:650000, tipo:"asiento" },
        diamante: { nombre:"Diamante",      color:"#1e9be9", texto:"#fff", precio:480000, tipo:"asiento" },
        oro:      { nombre:"Oro",           color:"#f5b400", texto:"#3a2a00", precio:380000, tipo:"asiento" },
        plata:    { nombre:"Plata",         color:"#a3a9b3", texto:"#1f2328", precio:290000, tipo:"asiento" },
        platino:  { nombre:"Platino",       color:"#f28b82", texto:"#3b0b07", precio:240000, tipo:"asiento" },
        bronce:   { nombre:"Bronce",        color:"#8bc34a", texto:"#1b3300", precio:190000, tipo:"asiento" },
        vip:      { nombre:"VIP",           color:"#d63ee8", texto:"#fff", precio:150000, tipo:"asiento" },
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

        filas.forEach((segmentos, filaIdx) => {

            let col = 0;

            const foh = [];

            segmentos.forEach(seg => {

                if(typeof seg === "number"){

                    for(let k = 0; k < seg; k++){

                        piso.asientos.push({
                            id: `${zona}-${num}`,
                            zona,
                            fila: letraFila(filaIdx),
                            num,
                            x: X0 + col * P + P / 2,
                            y
                        });

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

function construirTeatro(){

    const zonas = {
        vip:       { nombre:"Platea VIP",          color:"#d63ee8", texto:"#fff", precio:260000, tipo:"asiento" },
        pref:      { nombre:"Platea Preferencial", color:"#1e9be9", texto:"#fff", precio:180000, tipo:"asiento" },
        general:   { nombre:"Platea General",      color:"#f5b400", texto:"#3a2a00", precio:120000, tipo:"asiento" },
        balcon:    { nombre:"Balcón",              color:"#8bc34a", texto:"#1b3300", precio:80000,  tipo:"asiento" }
    };

    const filasPorZona = [["vip", 3], ["pref", 5], ["general", 6], ["balcon", 4]];

    const W = 840, CX = W / 2, CY = -20, P = 24;

    const piso = { id:"p1", nombre:"Teatro", w:W, h:0, formas:[], asientos:[], palcos:[], generales:[] };

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
        id: "teatro",
        nombre: "Teatro",
        zonas,
        pisos: [piso]
    };
}



const PLANOS = {
    malocas: construirMalocas(),
    capachos: construirCapachos(),
    teatro: construirTeatro()
};
