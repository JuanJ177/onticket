/* ========================================
   EDITOR VISUAL DE PLANOS (web)
   El promotor sube la imagen del plano real como guía y encima arma
   bloques: escenario, filas de sillas, tribunas en curva, palcos de 10,
   zonas generales y bloques de texto (baños, entradas...). Cada bloque se
   arrastra, se gira, se ajusta con la esquina y se le asigna una localidad.
   En planos grandes (estadios) cada bloque numerado es una sección.
   Requiere: planos.js (construirPlanoPropio, validarDiseno), core.js
======================================== */

let disenoEditor = null;     // el diseño que se está editando
let disenoEvento = null;     // el que queda guardado en el evento
let fondoPlano = null;       // imagen guía (no se publica)
let opacidadFondo = 0.55;
let bloqueSel = null;
let arrastrePlano = null;
let dibujoPendiente = false;

const COLORES_ZONA = ["#e53935", "#1e9be9", "#f5b400", "#8bc34a", "#d63ee8", "#f28b82", "#a3a9b3", "#4b4ab5", "#ff7a00", "#00a39b"];

const NOMBRE_TIPO = { asiento: "Sillas numeradas", palco: "Palcos de 10", general: "General (sin silla)" };

const nuevoId = prefijo => prefijo + Math.random().toString(36).slice(2, 7);

const ajustar = v => Math.round(v / 4) * 4;

function abrirEditorPlano(){

    disenoEditor = JSON.parse(JSON.stringify(disenoEvento || { w: 900, h: 640, zonas: [], bloques: [] }));

    bloqueSel = null;

    $("planoAncho").value = disenoEditor.w;

    $("planoAlto").value = disenoEditor.h;

    $("opacidadFondo").value = opacidadFondo;

    $("estadoIA").className = "ayuda";

    $("estadoIA").innerText = "La IA lee la imagen y arma las localidades y los bloques. Tú revisas, corriges y pones los precios.";

    renderEditorPlano();

    abrirModal("editorPlanoModal");
}

function renderEditorPlano(){

    dibujarLienzo();

    renderZonasEditor();

    renderPropiedades();
}

// redibuja como máximo una vez por cuadro (mientras se arrastra)
function pedirDibujo(){

    if(dibujoPendiente) return;

    dibujoPendiente = true;

    requestAnimationFrame(() => {

        dibujoPendiente = false;

        dibujarLienzo();
    });
}


/* ----- lienzo ----- */

function dibujarLienzo(){

    const d = disenoEditor;

    const svg = $("lienzoPlano");

    svg.setAttribute("viewBox", `0 0 ${d.w} ${d.h}`);

    // un objeto nuevo en cada dibujo: el plano se vuelve a calcular con los cambios
    const ev = { id: "editor", diseno: { ...d }, demo: false };

    let html = "";

    try{

        html = planoSVG(ev, 0, crearEstadoVenta(ev, {}, {}, null), [], {
            zonas: new Set(), precioMax: Infinity, soloDisp: false, soloInd: false
        }).replace('id="planoG"', "");

    }catch(e){

        html = `<rect class="planoFondo" x="0" y="0" width="${d.w}" height="${d.h}" rx="18"/>`;
    }

    // la imagen guía va justo encima del fondo oscuro y debajo de todo lo demás
    if(fondoPlano){

        const corte = html.indexOf("/>") + 2;

        html = html.slice(0, corte) +
            `<image href="${fondoPlano}" x="0" y="0" width="${d.w}" height="${d.h}" opacity="${opacidadFondo}" preserveAspectRatio="xMidYMid meet" pointer-events="none"/>` +
            html.slice(corte);
    }

    // la esquina para cambiar el tamaño mide siempre unos 18 px en pantalla
    const ancho = svg.getBoundingClientRect().width || d.w;

    const t = 18 * d.w / ancho;

    html += `<g class="capaEdicion">` + d.bloques.map(b => {

        const m = medidaBloque(b);

        const sel = b.id === bloqueSel;

        if(b.tipo === "curva"){

            return `<path class="marcoBloque ${sel ? "sel" : ""}" data-bloque="${b.id}" d="${contornoBloque(b)}"/>`;
        }

        const giro = b.rot ? ` transform="rotate(${b.rot} ${b.x + m.w / 2} ${b.y + m.h / 2})"` : "";

        // la esquina sigue al bloque cuando está girado
        const esquina = girar(b.x + m.w, b.y + m.h, b.x + m.w / 2, b.y + m.h / 2, b.rot || 0);

        return `
            <rect class="marcoBloque ${sel ? "sel" : ""}" data-bloque="${b.id}" x="${b.x}" y="${b.y}" width="${m.w}" height="${m.h}" rx="6"${giro}/>
            ${sel ? `<rect class="tiradorBloque" data-tirador="${b.id}" x="${esquina.x - t / 2}" y="${esquina.y - t / 2}" width="${t}" height="${t}" rx="${t / 4}"/>` : ""}`;

    }).join("") + `</g>`;

    svg.innerHTML = html;

    renderResumenPlano();
}

function puntoEnLienzo(e){

    const svg = $("lienzoPlano");

    const pt = svg.createSVGPoint();

    pt.x = e.clientX;

    pt.y = e.clientY;

    return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function iniciarArrastre(e){

    const marco = e.target.closest("[data-bloque], [data-tirador]");

    if(!marco){

        bloqueSel = null;

        dibujarLienzo();

        renderPropiedades();

        return;
    }

    const id = marco.dataset.bloque || marco.dataset.tirador;

    const b = disenoEditor.bloques.find(x => x.id === id);

    const p = puntoEnLienzo(e);

    const m = medidaBloque(b);

    arrastrePlano = { b, modo: marco.dataset.tirador ? "tamano" : "mover", x0: p.x, y0: p.y, bx: b.x, by: b.y, bcx: b.cx, bcy: b.cy, bw: m.w, bh: m.h };

    $("lienzoPlano").setPointerCapture(e.pointerId);

    if(bloqueSel !== id){

        bloqueSel = id;

        dibujarLienzo();

        renderPropiedades();
    }

    e.preventDefault();
}

function moverArrastre(e){

    if(!arrastrePlano) return;

    const p = puntoEnLienzo(e);

    let dx = p.x - arrastrePlano.x0, dy = p.y - arrastrePlano.y0;

    const b = arrastrePlano.b, d = disenoEditor;

    if(arrastrePlano.modo === "mover" && b.tipo === "curva"){

        b.cx = clamp(ajustar(arrastrePlano.bcx + dx), 0, d.w);

        b.cy = clamp(ajustar(arrastrePlano.bcy + dy), 0, d.h);

        pedirDibujo();

        return;
    }

    if(arrastrePlano.modo === "mover"){

        // un bloque girado puede quedar con la mitad de su caja por fuera
        b.x = clamp(ajustar(arrastrePlano.bx + dx), -arrastrePlano.bw / 2, d.w - arrastrePlano.bw / 2);

        b.y = clamp(ajustar(arrastrePlano.by + dy), -arrastrePlano.bh / 2, d.h - arrastrePlano.bh / 2);

        pedirDibujo();

        return;
    }

    // la esquina se mueve en la dirección del bloque girado
    if(b.rot){

        const c = Math.cos(rad(-b.rot)), sn = Math.sin(rad(-b.rot));

        [dx, dy] = [dx * c - dy * sn, dx * sn + dy * c];
    }

    if(b.tipo === "sillas" || b.tipo === "palcos"){

        // con la esquina se agregan o quitan filas y columnas
        const c = b.tipo === "sillas" ? CELDA_PLANO.sillas : CELDA_PLANO[b.forma === "cuadro" ? "cuadro" : "circulo"];

        b.columnas = clamp(Math.round((arrastrePlano.bw + dx) / c.w), 1, 200);

        b.filas = clamp(Math.round((arrastrePlano.bh + dy) / c.h), 1, 100);

    }else{

        b.w = clamp(ajustar(arrastrePlano.bw + dx), 20, d.w);

        b.h = clamp(ajustar(arrastrePlano.bh + dy), 20, d.h);
    }

    pedirDibujo();
}

function terminarArrastre(){

    if(!arrastrePlano) return;

    arrastrePlano = null;

    renderPropiedades();
}

(function(){

    const svg = $("lienzoPlano");

    if(!svg) return;

    svg.addEventListener("pointerdown", iniciarArrastre);

    svg.addEventListener("pointermove", moverArrastre);

    svg.addEventListener("pointerup", terminarArrastre);

    svg.addEventListener("pointercancel", terminarArrastre);

    // Supr / Delete borra el bloque elegido (si no se está escribiendo)
    document.addEventListener("keydown", e => {

        if(!$("editorPlanoModal").classList.contains("open") || !bloqueSel) return;

        if(["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;

        if(e.key === "Delete" || e.key === "Backspace") eliminarBloque();
    });
})();


/* ----- agregar bloques ----- */

function zonaDeTipo(tipo){

    const existente = disenoEditor.zonas.find(z => z.tipo === tipo);

    return existente ? existente.id : agregarZona(tipo, true);
}

function agregarBloque(tipo){

    const d = disenoEditor;

    const n = d.bloques.length;

    const cx = d.w / 2, cy = d.h / 2 + (n % 6) * 12;

    let b;

    if(tipo === "escenario") b = { tipo, w: 300, h: 56, texto: "ESCENARIO" };

    if(tipo === "bloque") b = { tipo, w: 120, h: 60, texto: "BAÑOS" };

    if(tipo === "sillas") b = { tipo, zona: zonaDeTipo("asiento"), filas: 4, columnas: 10 };

    if(tipo === "palcos") b = { tipo, zona: zonaDeTipo("palco"), filas: 3, columnas: 8, forma: "circulo", individuales: 20 };

    if(tipo === "general") b = { tipo, zona: zonaDeTipo("general"), w: 300, h: 90, capacidad: 300 };

    if(tipo === "curva"){

        b = { tipo, zona: zonaDeTipo("asiento"), cx: ajustar(cx), cy: ajustar(cy), radio: 160, filas: 8, desde: 200, hasta: 340, id: nuevoId("b") };

        d.bloques.push(b);

        bloqueSel = b.id;

        renderEditorPlano();

        return;
    }

    b.id = nuevoId("b");

    const m = medidaBloque(b);

    b.x = clamp(ajustar(cx - m.w / 2), 0, d.w - m.w);

    b.y = clamp(ajustar(tipo === "escenario" ? 20 : cy - m.h / 2), 0, d.h - m.h);

    d.bloques.push(b);

    bloqueSel = b.id;

    renderEditorPlano();
}

function duplicarBloque(){

    const b = disenoEditor.bloques.find(x => x.id === bloqueSel);

    if(!b) return;

    const copia = b.tipo === "curva"
        ? { ...b, id: nuevoId("b"), nombre: "", cx: b.cx + 24, cy: b.cy + 24 }
        : { ...b, id: nuevoId("b"), nombre: "", x: b.x + 24, y: b.y + 24 };

    disenoEditor.bloques.push(copia);

    bloqueSel = copia.id;

    renderEditorPlano();
}

function eliminarBloque(){

    disenoEditor.bloques = disenoEditor.bloques.filter(x => x.id !== bloqueSel);

    bloqueSel = null;

    renderEditorPlano();
}


/* ----- localidades (zonas) ----- */

function agregarZona(tipo, silencioso){

    tipo = tipo || $("tipoZonaNueva").value;

    const usadas = disenoEditor.zonas.length;

    const base = { asiento: ["Platea", 80000], palco: ["Palcos", 1500000], general: ["General", 60000] }[tipo];

    const z = {
        id: nuevoId("z"),
        nombre: `${base[0]}${disenoEditor.zonas.some(x => x.nombre === base[0]) ? " " + (usadas + 1) : ""}`,
        color: COLORES_ZONA[usadas % COLORES_ZONA.length],
        tipo,
        precio: base[1]
    };

    if(tipo === "palco") z.precioPuesto = Math.round(base[1] / 10 * 1.08 / 1000) * 1000;

    disenoEditor.zonas.push(z);

    if(!silencioso) renderEditorPlano();

    return z.id;
}

function cambiarZona(id, campo, valor){

    const z = disenoEditor.zonas.find(x => x.id === id);

    z[campo] = ["precio", "precioPuesto"].includes(campo) ? Number(valor) : valor;

    dibujarLienzo();

    if(campo === "nombre") renderPropiedades();
}

function eliminarZona(id){

    const usos = disenoEditor.bloques.filter(b => b.zona === id).length;

    if(usos && !confirm(`Esta localidad tiene ${usos} bloque(s) en el plano. ¿Borrar la localidad y sus bloques?`)) return;

    disenoEditor.zonas = disenoEditor.zonas.filter(z => z.id !== id);

    disenoEditor.bloques = disenoEditor.bloques.filter(b => b.zona !== id);

    if(!disenoEditor.bloques.some(b => b.id === bloqueSel)) bloqueSel = null;

    renderEditorPlano();
}

function renderZonasEditor(){

    $("zonasPlano").innerHTML = disenoEditor.zonas.map(z => `
        <div class="zonaEditor">
            <input type="color" value="${z.color}" oninput="cambiarZona('${z.id}', 'color', this.value)" title="Color">
            <div class="zonaEditorDatos">
                <input value="${esc(z.nombre)}" maxlength="30" onchange="cambiarZona('${z.id}', 'nombre', this.value.trim())" placeholder="Nombre">
                <small>${NOMBRE_TIPO[z.tipo]}</small>
                <div class="zonaPrecios">
                    <label>${z.tipo === "palco" ? "Palco" : "Boleta"}
                        <input type="number" min="1000" step="1000" value="${z.precio}" onchange="cambiarZona('${z.id}', 'precio', this.value)">
                    </label>
                    ${z.tipo === "palco" ? `
                    <label>Puesto
                        <input type="number" min="1000" step="1000" value="${z.precioPuesto}" onchange="cambiarZona('${z.id}', 'precioPuesto', this.value)">
                    </label>` : ""}
                </div>
            </div>
            <button class="iconoBorrar" onclick="eliminarZona('${z.id}')" title="Borrar localidad"><i class="fa-regular fa-trash-can"></i></button>
        </div>`).join("") || `<p class="ayuda">Aún no hay localidades. Se crean solas al agregar sillas, palcos o una zona general.</p>`;
}


/* ----- propiedades del bloque elegido ----- */

function cambiarBloque(campo, valor){

    const b = disenoEditor.bloques.find(x => x.id === bloqueSel);

    const numero = ["filas", "columnas", "individuales", "capacidad", "w", "h", "rot", "radio", "desde", "hasta"].includes(campo);

    b[campo] = numero ? Number(valor) : valor;

    if(campo === "rot") b.rot = ((b.rot % 360) + 360) % 360;

    dibujarLienzo();

    if(campo === "rot") renderPropiedades();
}

function girarBloque(grados){

    const b = disenoEditor.bloques.find(x => x.id === bloqueSel);

    cambiarBloque("rot", (b.rot || 0) + grados);
}

function renderPropiedades(){

    const b = disenoEditor.bloques.find(x => x.id === bloqueSel);

    if(!b){

        $("propiedadesBloque").innerHTML = `<p class="ayuda"><i class="fa-solid fa-hand-pointer"></i> Toca un bloque del plano para editarlo. Arrástralo para moverlo y usa la esquina para cambiar su tamaño.</p>`;

        return;
    }

    const tipoZona = { sillas: "asiento", palcos: "palco", general: "general", curva: "asiento" }[b.tipo];

    const campo = (etiqueta, nombre, valor, extra = "") =>
        `<label>${etiqueta}<input type="number" value="${valor}" ${extra} onchange="cambiarBloque('${nombre}', this.value)"></label>`;

    const titulo = { escenario: "Escenario", bloque: "Bloque de texto", sillas: "Filas de sillas", palcos: "Palcos de 10 personas", general: "Zona general", curva: "Tribuna en curva" }[b.tipo];

    const numerado = ["sillas", "palcos", "curva"].includes(b.tipo);

    $("propiedadesBloque").innerHTML = `
        <b class="tituloBloque">${titulo}</b>
        ${tipoZona ? `
        <label>Localidad
            <select onchange="cambiarBloque('zona', this.value)">
                ${disenoEditor.zonas.filter(z => z.tipo === tipoZona).map(z => `<option value="${z.id}" ${z.id === b.zona ? "selected" : ""}>${esc(z.nombre)}</option>`).join("")}
            </select>
        </label>` : ""}
        ${numerado ? `
        <label>Nombre de la sección
            <input value="${esc(b.nombre || "")}" maxlength="30" placeholder="Ej: Oriental 101" onchange="cambiarBloque('nombre', this.value.trim())">
        </label>
        <small class="ayuda">${ubicacionesBloque(b).toLocaleString("es-CO")} ${b.tipo === "palcos" ? "palcos" : "sillas"} en esta sección</small>` : ""}
        ${b.tipo === "curva" ? `
        <div class="dosCampos">
            ${campo("Radio interior", "radio", b.radio, 'min="10" step="10"')}
            ${campo("Filas", "filas", b.filas, 'min="1" max="100"')}
        </div>
        <div class="dosCampos">
            ${campo("Desde (°)", "desde", b.desde, 'step="5"')}
            ${campo("Hasta (°)", "hasta", b.hasta, 'step="5"')}
        </div>
        <small class="ayuda">0° es a la derecha, 90° abajo, 180° a la izquierda y 270° arriba. Arrastra la tribuna para moverla.</small>` : ""}
        ${b.tipo === "sillas" || b.tipo === "palcos" ? `
        <div class="dosCampos">
            ${campo("Filas", "filas", b.filas, 'min="1" max="60"')}
            ${campo("Por fila", "columnas", b.columnas, 'min="1" max="80"')}
        </div>` : ""}
        ${b.tipo === "palcos" ? `
        <label>Forma
            <select onchange="cambiarBloque('forma', this.value)">
                <option value="circulo" ${b.forma !== "cuadro" ? "selected" : ""}>Punticos (como Las Malocas)</option>
                <option value="cuadro" ${b.forma === "cuadro" ? "selected" : ""}>Cuadros (como Los Capachos)</option>
            </select>
        </label>
        ${campo("% de palcos individuales (venta por puesto)", "individuales", b.individuales || 0, 'min="0" max="100" step="5"')}
        <small class="ayuda">Nunca en la primera fila del bloque; van en un color más clarito.</small>` : ""}
        ${b.tipo === "general" ? campo("Capacidad (personas)", "capacidad", b.capacidad, 'min="1" step="10"') : ""}
        ${["escenario", "bloque", "general"].includes(b.tipo) ? `
        <label>Texto
            <input value="${esc(b.texto || "")}" maxlength="30" placeholder="${b.tipo === "general" ? "Ej: GRADERÍA" : ""}" onchange="cambiarBloque('texto', this.value.trim())">
        </label>
        <div class="dosCampos">
            ${campo("Ancho", "w", b.w, 'min="20" step="4"')}
            ${campo("Alto", "h", b.h, 'min="20" step="4"')}
        </div>` : ""}
        ${b.tipo !== "curva" ? `
        <label>Giro
            <div class="filaGiro">
                <button class="ghostBtn" onclick="girarBloque(-15)" title="Girar a la izquierda"><i class="fa-solid fa-rotate-left"></i></button>
                <input type="number" value="${b.rot || 0}" step="5" onchange="cambiarBloque('rot', this.value)">
                <button class="ghostBtn" onclick="girarBloque(15)" title="Girar a la derecha"><i class="fa-solid fa-rotate-right"></i></button>
            </div>
        </label>` : ""}
        <div class="botonesBloque">
            <button class="ghostBtn" onclick="duplicarBloque()"><i class="fa-regular fa-copy"></i> Duplicar</button>
            <button class="ghostBtn danger" onclick="eliminarBloque()"><i class="fa-regular fa-trash-can"></i> Borrar</button>
        </div>`;
}


/* ----- lienzo e imagen guía ----- */

function cambiarTamanoLienzo(){

    disenoEditor.w = clamp(Number($("planoAncho").value) || 900, 300, 6000);

    disenoEditor.h = clamp(Number($("planoAlto").value) || 640, 300, 6000);

    dibujarLienzo();
}

function cambiarOpacidadFondo(v){

    opacidadFondo = Number(v);

    dibujarLienzo();
}

// la imagen se reduce (máx. 1400 px) para guardarla aparte del evento
function cargarFondoPlano(input){

    const archivo = input.files[0];

    if(!archivo) return;

    const lector = new FileReader();

    lector.onload = () => {

        const img = new Image();

        img.onload = () => {

            const escala = Math.min(1, 1400 / Math.max(img.width, img.height));

            const c = document.createElement("canvas");

            c.width = Math.round(img.width * escala);

            c.height = Math.round(img.height * escala);

            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);

            let calidad = 0.75;

            let data = c.toDataURL("image/jpeg", calidad);

            while(data.length > 700000 && calidad > 0.35){

                calidad -= 0.1;

                data = c.toDataURL("image/jpeg", calidad);
            }

            fondoPlano = data;

            // el lienzo toma la proporción de la imagen
            disenoEditor.h = clamp(Math.round(disenoEditor.w * c.height / c.width), 300, 6000);

            $("planoAlto").value = disenoEditor.h;

            dibujarLienzo();
        };

        img.src = lector.result;
    };

    lector.readAsDataURL(archivo);

    input.value = "";
}

// Claude lee la imagen guía y arma las localidades y los bloques
async function armarPlanoConIA(){

    if(!fondoPlano){

        toast("Primero sube la imagen del plano", "fa-image");

        return;
    }

    if(disenoEditor.bloques.length && !confirm("La IA reemplaza los bloques y localidades que ya tienes. ¿Continuar?")) return;

    const btn = $("btnIA"), estado = $("estadoIA");

    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = fondoPlano; });

    btn.disabled = true;

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> La IA está leyendo tu plano...';

    estado.className = "ayuda";

    estado.innerText = "Puede tardar uno o dos minutos. No cierres esta ventana.";

    try{

        const r = await DB.armarPlanoIA(fondoPlano, img.naturalWidth, img.naturalHeight, $("notaIA").value.trim());

        disenoEditor = r.diseno;

        bloqueSel = null;

        $("planoAncho").value = disenoEditor.w;

        $("planoAlto").value = disenoEditor.h;

        renderEditorPlano();

        const numeradas = disenoEditor.bloques.reduce((n, b) => n + ubicacionesBloque(b), 0);

        const generales = disenoEditor.bloques.filter(b => b.tipo === "general").reduce((n, b) => n + (b.capacidad || 0), 0);

        estado.className = "ayuda listo";

        estado.innerHTML = `<b>Listo:</b> ${disenoEditor.zonas.length} localidades, ${disenoEditor.bloques.length} bloques, ` +
            `${numeradas.toLocaleString("es-CO")} ubicaciones numeradas${generales ? ` y ${generales.toLocaleString("es-CO")} de pie` : ""}. ` +
            `Revisa que coincida con la imagen y <b>pon los precios reales</b>.` +
            (r.notas ? `<br>${esc(r.notas)}` : "") + (r.aviso ? `<br>Falta: ${esc(r.aviso)}` : "");

    }catch(e){

        estado.className = "ayuda error";

        estado.innerText = e.message;

    }finally{

        btn.disabled = false;

        btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Armar con IA';
    }
}

function quitarFondoPlano(){

    fondoPlano = null;

    dibujarLienzo();
}


/* ----- resumen y guardar ----- */

function resumenDiseno(d){

    try{

        const plano = construirPlanoPropio(d);

        const asientos = plano.pisos.flatMap(p => p.asientos);

        const palcos = plano.pisos.flatMap(p => p.palcos);

        const general = plano.pisos[0].generales.reduce((s, g) => s + g.capacidad, 0);

        return {
            sillas: asientos.length,
            palcos: palcos.length,
            individuales: palcos.filter(x => x.individual).length,
            general,
            personas: asientos.length + palcos.length * 10 + general,
            secciones: plano.secciones ? plano.pisos.length - 1 : 0
        };

    }catch(e){

        return { sillas: 0, palcos: 0, individuales: 0, general: 0, personas: 0, secciones: 0 };
    }
}

function renderResumenPlano(){

    const r = resumenDiseno(disenoEditor);

    $("resumenPlano").innerHTML = `
        <span><b>${r.personas.toLocaleString("es-CO")}</b> personas</span>
        <span>${r.sillas.toLocaleString("es-CO")} sillas</span>
        <span>${r.palcos} palcos (${r.individuales} individuales)</span>
        <span>${r.general.toLocaleString("es-CO")} en general</span>
        ${r.secciones ? `<span class="enSecciones"><i class="fa-solid fa-layer-group"></i> Plano por secciones: ${r.secciones} secciones (el público ve primero el mapa)</span>` : ""}`;
}

function guardarEditorPlano(){

    try{

        validarDiseno(disenoEditor);

    }catch(e){

        toast(esc(e.message), "fa-triangle-exclamation");

        return;
    }

    disenoEvento = JSON.parse(JSON.stringify(disenoEditor));

    cerrarModal("editorPlanoModal");

    renderPreciosEditor();

    toast("Plano listo. Recuerda guardar el evento.");
}
