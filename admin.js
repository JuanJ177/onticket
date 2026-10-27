/* ========================================
   PANEL ADMINISTRATIVO (WEB)
   Ventas · Estadísticas + mapa de calor · Eventos · Taquilla
   Requiere: core.js, db.js, script.js
======================================== */

let adminTabActual = "ventas";
let comprasAdmin = [];
let comprasCargadas = false;



/* ========================================
   NAVEGACIÓN DEL PANEL
======================================== */

async function abrirAdminPanel(){

    mostrarPagina(adminPage);

    const soloTaquilla = currentUser && currentUser.role === "taquilla";

    document.querySelectorAll("#adminTabs button").forEach(b =>
        b.style.display = soloTaquilla && b.dataset.tab !== "taquilla" ? "none" : "");

    adminTab(soloTaquilla ? "taquilla" : adminTabActual);
}

function adminTab(tab){

    adminTabActual = tab;

    document.querySelectorAll("#adminTabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));

    document.querySelectorAll(".adminPanel").forEach(p => p.classList.toggle("active", p.id === "admin-" + tab));

    if(tab !== "taquilla") apagarCamara();

    if(tab !== "estadisticas") detenerFlujo();

    if(tab === "ventas") cargarVentasAdmin();

    if(tab === "eventos") renderEventosAdmin();

    if(tab === "estadisticas") prepararEstadisticas();
}

// al salir del panel se apaga la cámara de la taquilla
const mostrarPaginaBase = mostrarPagina;

mostrarPagina = function(pagina){

    if(pagina !== adminPage){

        apagarCamara();

        detenerFlujo();
    }

    mostrarPaginaBase(pagina);
};

async function cargarComprasAdmin(forzar){

    if(comprasCargadas && !forzar) return comprasAdmin;

    comprasAdmin = await DB.todasLasCompras();

    comprasCargadas = true;

    return comprasAdmin;
}



/* ========================================
   VENTAS
======================================== */

async function cargarVentasAdmin(){

    $("adminTableBody").innerHTML = `<tr><td colspan="8">Cargando...</td></tr>`;

    try{

        renderAdminCompras(await cargarComprasAdmin(true));

    }catch(e){

        $("adminTableBody").innerHTML = `<tr><td colspan="8">No tienes permisos para ver las compras.</td></tr>`;
    }
}

function renderAdminCompras(compras){

    let totalVentas = 0, totalServicio = 0, facturas = 0, ingresos = 0, personas = 0;

    const filas = compras.map(compra => {

        const total = personasCompra(compra);

        totalVentas += compra.total;

        totalServicio += (compra.servicio || 0) + (compra.iva || 0);

        ingresos += compra.ingresos || 0;

        personas += total;

        if(compra.factura) facturas++;

        return `
        <tr class="adminRow">
            <td>${esc(compra.usuario)}<br><small>${esc(compra.email)}</small></td>
            <td>${esc(compra.evento || "Andrés Cepeda Tour 2025")}</td>
            <td>${fmt(compra.subtotal ?? compra.total)}</td>
            <td>${fmt((compra.servicio || 0) + (compra.iva || 0))}</td>
            <td><b>${fmt(compra.total)}</b></td>
            <td><span class="ingresoTag ${(compra.ingresos || 0) >= total ? "completo" : ""}">${compra.ingresos || 0} / ${total}</span></td>
            <td>${compra.factura ? esc(compra.factura.numero) : "—"}</td>
            <td class="mono">${esc(compra.codigo)}</td>
        </tr>`;

    }).join("");

    $("adminTableBody").innerHTML = filas || `<tr><td colspan="8">Aún no hay compras.</td></tr>`;

    $("adminStats").innerHTML = `
        <div><small>Ventas totales</small><b>${fmt(totalVentas)}</b></div>
        <div><small>Compras</small><b>${compras.length}</b></div>
        <div><small>Servicio + IVA</small><b>${fmt(totalServicio)}</b></div>
        <div><small>Ingresaron</small><b>${ingresos} / ${personas}</b></div>
        <div><small>Facturas electrónicas</small><b>${facturas}</b></div>`;
}

function buscarCompraAdmin(){

    const input = $("searchCompra").value.toLowerCase();

    document.querySelectorAll(".adminRow").forEach(fila => {

        fila.style.display = fila.innerText.toLowerCase().includes(input) ? "" : "none";
    });
}



/* ========================================
   EVENTOS (crear / editar / ocultar / borrar)
======================================== */

let eventoEditando = null;
let aficheEditor = null;

// quita los campos que se calculan solos (fecha en texto, etc.)
function eventoCrudo(ev){

    const { fechaReal, fecha, hora, dia, mes, ...crudo } = ev;

    return crudo;
}

// la primera vez, los eventos de ejemplo se suben a la nube para poder editarlos
async function asegurarEventosEnNube(){

    const enNube = await DB.cargarEventos();

    if(!enNube) await DB.publicarEventos(EVENTOS_EJEMPLO.map(eventoCrudo));
}

async function renderEventosAdmin(){

    let enNube = null;

    try{ enNube = await DB.cargarEventos(); }catch(e){}

    $("eventosAdminInfo").innerHTML = enNube
        ? `<i class="fa-solid fa-cloud"></i> ${EVENTOS.length} eventos ${DB.modo === "firebase" ? "en la nube: los cambios se ven al instante en la web y en la app" : "guardados en este navegador (modo local)"}.`
        : `<i class="fa-solid fa-circle-info"></i> Se están mostrando los eventos de ejemplo. Al guardar tu primer cambio se publican todos ${DB.modo === "firebase" ? "en la nube" : ""}.`;

    $("eventosAdmin").innerHTML = EVENTOS.map(ev => {

        const lugar = lugarDe(ev);

        const oculto = ev.visible === false;

        return `
        <article class="eventoAdmin ${oculto ? "oculto" : ""}">
            <img src="${ev.imagen}" alt="">
            <div class="eventoAdminInfo">
                <div class="badges">
                    ${oculto ? '<span class="badge gris"><i class="fa-solid fa-eye-slash"></i> Oculto</span>' : '<span class="badge verde"><i class="fa-solid fa-eye"></i> Publicado</span>'}
                    ${ev.destacado ? '<span class="badge naranja"><i class="fa-solid fa-star"></i> Destacado</span>' : ""}
                </div>
                <b>${ev.artista}</b>
                <small>${ev.titulo}</small>
                <small><i class="fa-regular fa-calendar"></i> ${ev.fecha} · ${ev.hora}</small>
                <small><i class="fa-solid fa-location-dot"></i> ${lugar.nombre}, ${lugar.ciudad}</small>
            </div>
            <div class="eventoAdminBtns">
                <button class="ghostBtn" onclick="editarEvento('${ev.id}')"><i class="fa-solid fa-pen"></i> Editar</button>
                <button class="ghostBtn" onclick="alternarVisible('${ev.id}')"><i class="fa-solid ${oculto ? "fa-eye" : "fa-eye-slash"}"></i> ${oculto ? "Mostrar" : "Ocultar"}</button>
                <button class="ghostBtn danger" onclick="eliminarEventoAdmin('${ev.id}')"><i class="fa-regular fa-trash-can"></i></button>
            </div>
        </article>`;

    }).join("");
}

function editarEvento(id){

    const ev = id ? getEvento(id) : null;

    eventoEditando = ev ? eventoCrudo(ev) : null;

    $("eventoModalTitulo").innerText = ev ? `Editar: ${ev.artista}` : "Nuevo evento";

    $("evLugar").innerHTML = Object.entries(LUGARES).map(([k, l]) =>
        `<option value="${k}">${l.nombre} · ${l.ciudad}</option>`).join("");

    const [fecha, hora] = (ev && ev.fechaISO ? ev.fechaISO : "T20:00").split("T");

    $("evArtista").value = ev ? ev.artista : "";
    $("evTitulo").value = ev ? ev.titulo : "";
    $("evCategoria").value = ev ? ev.categoria : "Conciertos";
    $("evLugar").value = ev ? ev.lugar : Object.keys(LUGARES)[0];
    $("evFecha").value = fecha;
    $("evHora").value = (hora || "20:00").slice(0, 5);
    $("evDescripcion").value = ev ? ev.descripcion || "" : "";
    $("evVideo").value = ev ? ev.video || "" : "";
    $("evDestacado").checked = ev ? !!ev.destacado : true;
    $("evVisible").checked = ev ? ev.visible !== false : true;

    aficheEditor = ev ? ev.imagen : null;

    mostrarAfiche();

    renderPreciosEditor();

    abrirModal("eventoModal");
}

function mostrarAfiche(){

    $("previewAfiche").innerHTML = aficheEditor
        ? `<img src="${aficheEditor}" alt="Afiche">`
        : `<i class="fa-regular fa-image"></i><span>Sin afiche</span>`;
}

// reduce la imagen (máx. 900 px, JPG) para guardarla en la base de datos
function cargarAfiche(input){

    const archivo = input.files[0];

    if(!archivo) return;

    const lector = new FileReader();

    lector.onload = () => {

        const img = new Image();

        img.onload = () => {

            const escala = Math.min(1, 900 / Math.max(img.width, img.height));

            const c = document.createElement("canvas");

            c.width = Math.round(img.width * escala);

            c.height = Math.round(img.height * escala);

            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);

            let calidad = 0.82;

            let data = c.toDataURL("image/jpeg", calidad);

            while(data.length > 650000 && calidad > 0.4){

                calidad -= 0.1;

                data = c.toDataURL("image/jpeg", calidad);
            }

            aficheEditor = data;

            mostrarAfiche();
        };

        img.src = lector.result;
    };

    lector.readAsDataURL(archivo);

    input.value = "";
}

function renderPreciosEditor(){

    const lugar = $("evLugar").value;

    const plano = PLANOS[LUGARES[lugar].plano];

    const precios = (eventoEditando && eventoEditando.lugar === lugar && eventoEditando.precios) || {};

    const puestos = (eventoEditando && eventoEditando.lugar === lugar && eventoEditando.preciosPuesto) || {};

    $("preciosEditor").innerHTML = Object.entries(plano.zonas).map(([id, z]) => `
        <div class="precioFila">
            <i class="zonaColor" style="background:${z.color}"></i>
            <div><b>${z.nombre}</b><small>${TIPO_ZONA[z.tipo]}</small></div>
            <label>${z.tipo === "palco" ? "Palco" : "Boleta"}
                <input type="number" min="0" step="1000" data-precio="${id}" value="${precios[id] || z.precio}">
            </label>
            ${z.tipo === "palco" ? `
            <label>Puesto individual
                <input type="number" min="0" step="1000" data-puesto="${id}" value="${puestos[id] || z.precioPuesto}">
            </label>` : "<span></span>"}
        </div>`).join("");
}

function slug(texto){

    return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
}

async function guardarEventoEditor(){

    const artista = $("evArtista").value.trim();

    const fecha = $("evFecha").value;

    if(!artista || !fecha){

        toast("Escribe al menos el artista y la fecha", "fa-triangle-exclamation");

        return;
    }

    const lugar = $("evLugar").value;

    const plano = PLANOS[LUGARES[lugar].plano];

    const precios = {}, preciosPuesto = {};

    document.querySelectorAll("[data-precio]").forEach(i => {

        const v = Number(i.value);

        if(v && v !== plano.zonas[i.dataset.precio].precio) precios[i.dataset.precio] = v;
    });

    document.querySelectorAll("[data-puesto]").forEach(i => {

        const v = Number(i.value);

        if(v && v !== plano.zonas[i.dataset.puesto].precioPuesto) preciosPuesto[i.dataset.puesto] = v;
    });

    const evento = {
        ...(eventoEditando || {}),
        id: eventoEditando ? eventoEditando.id : `${slug(artista)}-${Date.now().toString(36)}`,
        artista,
        titulo: $("evTitulo").value.trim(),
        categoria: $("evCategoria").value,
        lugar,
        fechaISO: `${fecha}T${$("evHora").value || "20:00"}`,
        descripcion: $("evDescripcion").value.trim(),
        video: $("evVideo").value.trim() || null,
        imagen: aficheEditor || "img/logo.png",
        destacado: $("evDestacado").checked,
        visible: $("evVisible").checked,
        precios,
        preciosPuesto
    };

    const btn = $("btnGuardarEvento");

    btn.disabled = true;

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

    try{

        await asegurarEventosEnNube();

        await DB.guardarEvento(evento);

        await refrescarEventos();

        cerrarModal("eventoModal");

        toast(`Evento "${esc(artista)}" guardado`);

    }catch(e){

        toast(esc(e.message), "fa-triangle-exclamation");

    }finally{

        btn.disabled = false;

        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar evento';
    }
}

async function alternarVisible(id){

    const ev = eventoCrudo(getEvento(id));

    ev.visible = ev.visible === false;

    try{

        await asegurarEventosEnNube();

        await DB.guardarEvento(ev);

        await refrescarEventos();

        toast(ev.visible ? "Evento publicado" : "Evento oculto para el público");

    }catch(e){

        toast(esc(e.message), "fa-triangle-exclamation");
    }
}

async function eliminarEventoAdmin(id){

    const ev = getEvento(id);

    if(!confirm(`¿Eliminar "${ev.artista}"? Las compras ya hechas se conservan. Si solo quieres sacarlo de la cartelera, usa "Ocultar".`)) return;

    try{

        await asegurarEventosEnNube();

        await DB.eliminarEvento(id);

        await refrescarEventos();

        toast("Evento eliminado");

    }catch(e){

        toast(esc(e.message), "fa-triangle-exclamation");
    }
}

async function refrescarEventos(){

    await sincronizarEventos();

    renderInicio();

    renderEventosAdmin();
}



/* ========================================
   ESTADÍSTICAS
======================================== */

let statsEvento = null;
let statsEstado = null;
let statsZonas = {};
let statsComprasEvento = [];
let statsPiso = 0;
let modoCalor = "ocupacion";
let progresoFlujo = 1;
let intervaloFlujo = null;

// lee un documento una sola vez usando el mismo "escuchar" en tiempo real
function leerUnaVez(escuchar, id){

    return new Promise(resolver => {

        let dejar = null, listo = false;

        dejar = escuchar(id, datos => {

            if(listo) return;

            listo = true;

            resolver(datos);

            setTimeout(() => dejar && dejar(), 0);
        });
    });
}

function prepararEstadisticas(){

    const sel = $("statsEvento");

    const actual = sel.value;

    sel.innerHTML = EVENTOS.map(ev => `<option value="${ev.id}">${ev.artista} · ${ev.fecha}</option>`).join("");

    sel.value = getEvento(actual) ? actual : (EVENTOS[0] && EVENTOS[0].id);

    cargarEstadisticas();
}

async function cargarEstadisticas(){

    detenerFlujo();

    statsEvento = getEvento($("statsEvento").value);

    if(!statsEvento) return;

    statsPiso = 0;

    const [ventas, compras] = await Promise.all([
        leerUnaVez(DB.escucharVentas, statsEvento.id),
        cargarComprasAdmin(true).catch(() => [])
    ]);

    statsEstado = crearEstadoVenta(statsEvento, ventas);

    statsComprasEvento = compras.filter(c => c.eventoId === statsEvento.id);

    statsZonas = ocupacionPorZona(statsEvento, statsEstado);

    renderKpis();

    renderCalorPisos();

    renderCalor();

    graficoLocalidades();

    graficoDias(compras);

    graficoEventos(compras);
}

function ocupacionPorZona(ev, estado){

    const plano = planoDe(ev);

    const res = {};

    const zona = id => res[id] = res[id] || { cap:0, vend:0 };

    plano.pisos.forEach(p => {

        p.asientos.forEach(a => {

            zona(a.zona).cap++;

            if(estado.asientoVendido(a)) zona(a.zona).vend++;
        });

        p.palcos.forEach(pa => {

            zona(pa.zona).cap += pa.capacidad;

            if(pa.individual) zona(pa.zona).vend += estado.puestosPalco(pa).filter(x => x.vendido).length;

            else if(estado.palcoVendido(pa)) zona(pa.zona).vend += pa.capacidad;
        });

        p.generales.forEach(g => {

            const cap = g.capacidad || plano.zonas[g.zona].capacidad;

            zona(g.zona).cap += cap;

            zona(g.zona).vend += cap - estado.generalDisponible(g);
        });
    });

    return res;
}

function renderKpis(){

    const cap = Object.values(statsZonas).reduce((s, z) => s + z.cap, 0);

    const vend = Object.values(statsZonas).reduce((s, z) => s + z.vend, 0);

    const recaudo = statsComprasEvento.reduce((s, c) => s + c.total, 0);

    const ingresaron = statsComprasEvento.reduce((s, c) => s + (c.ingresos || 0), 0);

    const personas = statsComprasEvento.reduce((s, c) => s + personasCompra(c), 0);

    $("statsKpis").innerHTML = `
        <div class="kpi">
            <small>Aforo total</small>
            <b>${cap.toLocaleString("es-CO")}</b>
            <span>${planoDe(statsEvento).zonas ? Object.keys(planoDe(statsEvento).zonas).length : 0} localidades</span>
        </div>
        <div class="kpi">
            <small>Ocupación</small>
            <b>${Math.round(vend / cap * 100)}%</b>
            <span>${vend.toLocaleString("es-CO")} ubicaciones vendidas</span>
        </div>
        <div class="kpi">
            <small>Recaudo registrado</small>
            <b>${fmt(recaudo)}</b>
            <span>${statsComprasEvento.length} compra${statsComprasEvento.length === 1 ? "" : "s"} real${statsComprasEvento.length === 1 ? "" : "es"}</span>
        </div>
        <div class="kpi">
            <small>Ingresaron (taquilla)</small>
            <b>${ingresaron} / ${personas}</b>
            <span>personas con boleta real</span>
        </div>`;
}

function renderCalorPisos(){

    const pisos = planoDe(statsEvento).pisos;

    $("calorPisos").innerHTML = pisos.length > 1 ? pisos.map((p, i) => `
        <button class="pisoTab ${i === statsPiso ? "active" : ""}" onclick="statsPiso=${i}; renderCalorPisos(); renderCalor();">${p.nombre}</button>`).join("") : "";
}

function cambiarModoCalor(modo){

    modoCalor = modo;

    document.querySelectorAll("#statsModo button").forEach(b => b.classList.toggle("active", b.dataset.modo === modo));

    detenerFlujo();

    progresoFlujo = modo === "flujo" ? 0.55 : 1;

    $("flujoHora").value = progresoFlujo * 100;

    renderCalor();
}


/* ----- mapa de calor ----- */

// Probabilidad de que una persona con boleta ya haya entrado (simulación del flujo):
// las puertas abren 2 horas antes; las zonas generales llegan primero.
function yaEntro(id, zonaId, progreso){

    const zonas = Object.keys(planoDe(statsEvento).zonas);

    const tipo = planoDe(statsEvento).zonas[zonaId].tipo;

    const retraso = tipo === "general" ? 0 : 0.15 + 0.25 * (zonas.indexOf(zonaId) / zonas.length);

    const p = clamp((progreso - retraso) / (1 - retraso), 0, 1);

    return azar(id + "|entra") < Math.pow(p, 0.8);
}

// ids de compras reales que ya pasaron por la taquilla
function idsIngresados(){

    const set = new Set();

    statsComprasEvento.forEach(c => {

        let restantes = c.ingresos || 0;

        (c.items || []).forEach(i => {

            if(restantes <= 0) return;

            if(i.tipo === "general"){

                restantes -= i.cantidad;

            }else{

                i.ids.forEach(id => set.add(id));

                restantes -= i.personas || 1;
            }
        });
    });

    return set;
}

function puntosCalor(){

    const ev = statsEvento;

    const piso = planoDe(ev).pisos[statsPiso];

    const flujo = modoCalor === "flujo";

    const ingresados = idsIngresados();

    const cuenta = (id, zonaId) => !flujo || ingresados.has(id) || yaEntro(id, zonaId, progresoFlujo);

    const puntos = [];

    piso.asientos.forEach(a => {

        if(statsEstado.asientoVendido(a) && cuenta(a.id, a.zona)) puntos.push({ x:a.x, y:a.y, w:1 });
    });

    piso.palcos.forEach(p => {

        const lugares = p.individual
            ? statsEstado.puestosPalco(p).filter(x => x.vendido).map(x => x.id)
            : statsEstado.palcoVendido(p) ? Array.from({ length: p.capacidad }, (_, n) => `${p.id}-${n + 1}`) : [];

        lugares.forEach((id, n) => {

            if(!cuenta(id, p.zona)) return;

            // cada persona del palco se ubica alrededor de la mesa
            const ang = n / 10 * Math.PI * 2;

            puntos.push({ x: p.x + p.w / 2 + Math.cos(ang) * p.w * 0.3, y: p.y + p.h / 2 + Math.sin(ang) * p.h * 0.3, w:1 });
        });
    });

    piso.generales.forEach(g => {

        const cap = g.capacidad || planoDe(ev).zonas[g.zona].capacidad;

        let f = (cap - statsEstado.generalDisponible(g)) / cap;

        if(flujo){

            const p = clamp(progresoFlujo / 0.85, 0, 1);

            f *= Math.pow(p, 0.7);
        }

        const paso = 14;

        for(let x = g.x + paso / 2; x < g.x + g.w; x += paso){

            for(let y = g.y + paso / 2; y < g.y + g.h; y += paso){

                if(azar(`${g.id}|${Math.round(x)}|${Math.round(y)}`) < f) puntos.push({ x, y, w:1.2 });
            }
        }
    });

    return puntos;
}

// paleta "calor": oscuro → naranja → amarillo claro (la luminosidad sube con la densidad)
let lutCalor = null;

function paletaCalor(){

    if(lutCalor) return lutCalor;

    const c = document.createElement("canvas");

    c.width = 256;

    c.height = 1;

    const ctx = c.getContext("2d");

    const g = ctx.createLinearGradient(0, 0, 256, 0);

    g.addColorStop(0.00, "rgba(120, 30, 10, 0)");
    g.addColorStop(0.18, "rgba(150, 40, 15, 0.45)");
    g.addColorStop(0.42, "rgba(220, 70, 20, 0.75)");
    g.addColorStop(0.68, "rgba(249, 140, 30, 0.88)");
    g.addColorStop(0.86, "rgba(252, 200, 60, 0.94)");
    g.addColorStop(1.00, "rgba(255, 246, 205, 0.97)");

    ctx.fillStyle = g;

    ctx.fillRect(0, 0, 256, 1);

    lutCalor = ctx.getImageData(0, 0, 256, 1).data;

    return lutCalor;
}

function imagenCalor(piso, puntos){

    const k = 1.5;

    const W = Math.round(piso.w * k), H = Math.round(piso.h * k);

    const c = document.createElement("canvas");

    c.width = W;

    c.height = H;

    const ctx = c.getContext("2d", { willReadFrequently: true });

    const r = Math.round(34 * k);

    const pincel = document.createElement("canvas");

    pincel.width = pincel.height = r * 2;

    const pc = pincel.getContext("2d");

    const grad = pc.createRadialGradient(r, r, 0, r, r, r);

    grad.addColorStop(0, "rgba(0,0,0,1)");

    grad.addColorStop(1, "rgba(0,0,0,0)");

    pc.fillStyle = grad;

    pc.fillRect(0, 0, r * 2, r * 2);

    puntos.forEach(p => {

        ctx.globalAlpha = Math.min(1, 0.14 * p.w);

        ctx.drawImage(pincel, p.x * k - r, p.y * k - r);
    });

    const img = ctx.getImageData(0, 0, W, H);

    const d = img.data;

    const lut = paletaCalor();

    // escala: la zona más llena llega al tono más "caliente"
    // (con un mínimo para que un lugar casi vacío no se vea rojo)
    let maxA = 0;

    for(let i = 3; i < d.length; i += 4) if(d[i] > maxA) maxA = d[i];

    const escala = 255 / Math.max(maxA, 150);

    for(let i = 0; i < d.length; i += 4){

        const a = Math.min(255, Math.round(d[i + 3] * escala));

        if(!a) continue;

        const j = a * 4;

        d[i] = lut[j];
        d[i + 1] = lut[j + 1];
        d[i + 2] = lut[j + 2];
        d[i + 3] = lut[j + 3];
    }

    ctx.putImageData(img, 0, 0);

    return c.toDataURL();
}

function renderCalor(){

    if(!statsEvento) return;

    const piso = planoDe(statsEvento).pisos[statsPiso];

    const svg = $("calorSvg");

    svg.setAttribute("viewBox", `0 0 ${piso.w} ${piso.h}`);

    let html = planoSVG(statsEvento, statsPiso, statsEstado, [], { zonas: new Set(), precioMax: Infinity, soloDisp: false, soloInd: false });

    const capa = `<image href="${imagenCalor(piso, puntosCalor())}" x="0" y="0" width="${piso.w}" height="${piso.h}" class="capaCalor" preserveAspectRatio="none"/>`;

    const cierre = html.lastIndexOf("</g>");

    svg.innerHTML = html.slice(0, cierre) + capa + html.slice(cierre);

    const flujo = modoCalor === "flujo";

    $("flujoControl").classList.toggle("show", flujo);

    $("calorTitulo").innerText = flujo ? "Flujo de ingreso del público" : "Mapa de calor de ocupación";

    $("calorSub").innerText = flujo
        ? "Cómo se va llenando el lugar desde que abren puertas (2 horas antes)"
        : "Dónde se concentra el público según las ubicaciones vendidas";

    if(flujo) textoFlujo();

    $("calorNota").innerHTML = flujo
        ? `<i class="fa-solid fa-circle-info"></i> Los ingresos registrados en taquilla se muestran tal cual; el resto del público se simula según la hora para visualizar la aglomeración.`
        : `<i class="fa-solid fa-circle-info"></i> Incluye las ubicaciones vendidas de demostración y las compras reales.`;
}

function textoFlujo(){

    const inicio = statsEvento.fechaReal ? new Date(statsEvento.fechaReal) : new Date();

    const hora = new Date(inicio.getTime() - (1 - progresoFlujo) * 2 * 3600000);

    const total = Object.values(statsZonas).reduce((s, z) => s + z.vend, 0);

    const dentro = puntosAforoDentro();

    $("flujoTxt").innerHTML = `<b>${hora.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" })}</b> · ${Math.round(dentro / Math.max(1, total) * 100)}% del público adentro`;
}

// cuántas personas con boleta ya entraron (todas las zonas y pisos)
function puntosAforoDentro(){

    const ev = statsEvento;

    const ingresados = idsIngresados();

    let n = 0;

    planoDe(ev).pisos.forEach(p => {

        p.asientos.forEach(a => {

            if(statsEstado.asientoVendido(a) && (ingresados.has(a.id) || yaEntro(a.id, a.zona, progresoFlujo))) n++;
        });

        p.palcos.forEach(pa => {

            const ids = pa.individual
                ? statsEstado.puestosPalco(pa).filter(x => x.vendido).map(x => x.id)
                : statsEstado.palcoVendido(pa) ? Array.from({ length: pa.capacidad }, (_, k) => `${pa.id}-${k + 1}`) : [];

            ids.forEach(id => { if(ingresados.has(id) || yaEntro(id, pa.zona, progresoFlujo)) n++; });
        });

        p.generales.forEach(g => {

            const cap = g.capacidad || planoDe(ev).zonas[g.zona].capacidad;

            n += Math.round((cap - statsEstado.generalDisponible(g)) * Math.pow(clamp(progresoFlujo / 0.85, 0, 1), 0.7));
        });
    });

    return n;
}

function moverFlujo(){

    progresoFlujo = Number($("flujoHora").value) / 100;

    renderCalor();
}

function animarFlujo(){

    if(intervaloFlujo){

        detenerFlujo();

        return;
    }

    if(progresoFlujo >= 1) progresoFlujo = 0;

    $("flujoPlay").innerHTML = '<i class="fa-solid fa-pause"></i>';

    intervaloFlujo = setInterval(() => {

        progresoFlujo = Math.min(1, progresoFlujo + 0.02);

        $("flujoHora").value = progresoFlujo * 100;

        renderCalor();

        if(progresoFlujo >= 1) detenerFlujo();

    }, 120);
}

function detenerFlujo(){

    clearInterval(intervaloFlujo);

    intervaloFlujo = null;

    const btn = $("flujoPlay");

    if(btn) btn.innerHTML = '<i class="fa-solid fa-play"></i>';
}

// información de la zona al pasar el mouse por el mapa de calor
$("calorSvg").addEventListener("mousemove", e => {

    const tip = $("calorTooltip");

    const g = e.target.closest("[data-kind]");

    if(!g || !statsEvento){

        tip.classList.remove("show");

        return;
    }

    let zonaId = g.dataset.zona;

    if(!zonaId){

        const el = buscarElementoPlano(planoDe(statsEvento), g.dataset.kind, g.dataset.id);

        zonaId = el && el.zona;
    }

    const z = statsZonas[zonaId];

    if(!z) return;

    const nombre = planoDe(statsEvento).zonas[zonaId].nombre;

    tip.innerHTML = `<b>${nombre}</b><br>${Math.round(z.vend / z.cap * 100)}% vendido<br>${z.vend.toLocaleString("es-CO")} de ${z.cap.toLocaleString("es-CO")} personas`;

    tip.classList.add("show");

    const r = e.currentTarget.parentElement.getBoundingClientRect();

    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;

    if(x + tip.offsetWidth > r.width) x -= tip.offsetWidth + 28;

    tip.style.left = x + "px";

    tip.style.top = y + "px";
});

$("calorSvg").addEventListener("mouseleave", () => $("calorTooltip").classList.remove("show"));


/* ----- gráficas (SVG/HTML propios, con tooltip al pasar el mouse) ----- */

function tooltipViz(){

    let t = document.querySelector(".vizTip");

    if(!t){

        t = document.createElement("div");

        t.className = "vizTip";

        document.body.appendChild(t);
    }

    return t;
}

document.addEventListener("mousemove", e => {

    const el = e.target.closest("[data-viztip]");

    const t = tooltipViz();

    if(!el){

        t.classList.remove("show");

        return;
    }

    t.innerHTML = el.dataset.viztip;

    t.classList.add("show");

    let x = e.clientX + 14, y = e.clientY + 14;

    if(x + t.offsetWidth > innerWidth - 10) x = e.clientX - t.offsetWidth - 14;

    t.style.left = x + "px";

    t.style.top = y + "px";
});

// barras horizontales de una sola serie (un solo color)
function barrasHorizontales(cont, datos, formato){

    if(!datos.length){

        cont.innerHTML = `<p class="vizVacio"><i class="fa-regular fa-chart-bar"></i> Aún no hay datos</p>`;

        return;
    }

    const max = Math.max(...datos.map(d => d.max ?? d.valor), 1);

    cont.innerHTML = datos.map(d => `
        <div class="barraFila" data-viztip="${esc(d.tip)}">
            <span class="barraEtiqueta">${d.punto ? `<i class="punto" style="background:${d.punto}"></i>` : ""}${d.etiqueta}</span>
            <span class="barraPista"><i style="width:${Math.max(0.5, d.valor / max * 100)}%"></i></span>
            <span class="barraValor">${formato(d.valor)}</span>
        </div>`).join("");
}

function graficoLocalidades(){

    const zonas = planoDe(statsEvento).zonas;

    const datos = Object.entries(statsZonas).map(([id, z]) => ({
        etiqueta: zonas[id].nombre,
        punto: zonas[id].color,
        valor: Math.round(z.vend / z.cap * 100),
        max: 100,
        tip: `<b>${zonas[id].nombre}</b><br>${z.vend.toLocaleString("es-CO")} de ${z.cap.toLocaleString("es-CO")} vendidas`
    })).sort((a, b) => b.valor - a.valor);

    barrasHorizontales($("chartLocalidades"), datos, v => v + "%");
}

function graficoEventos(compras){

    const datos = EVENTOS.map(ev => {

        const lista = compras.filter(c => c.eventoId === ev.id);

        const total = lista.reduce((s, c) => s + c.total, 0);

        return {
            etiqueta: ev.artista,
            valor: total,
            tip: `<b>${ev.artista}</b><br>${fmt(total)} · ${lista.length} compra${lista.length === 1 ? "" : "s"}`
        };

    }).filter(d => d.valor > 0).sort((a, b) => b.valor - a.valor);

    barrasHorizontales($("chartEventos"), datos, v => fmt(v));
}

// línea de 14 días con área suave, cuadrícula tenue y cruz al pasar el mouse
function graficoDias(compras){

    const dias = [];

    const hoy = new Date();

    hoy.setHours(0, 0, 0, 0);

    for(let i = 13; i >= 0; i--){

        const d = new Date(hoy.getTime() - i * 86400000);

        dias.push({ fecha: d, total: 0, n: 0 });
    }

    compras.forEach(c => {

        if(!c.fechaCompra) return;

        const d = new Date(c.fechaCompra);

        d.setHours(0, 0, 0, 0);

        const dia = dias.find(x => x.fecha.getTime() === d.getTime());

        if(dia){

            dia.total += c.total;

            dia.n++;
        }
    });

    const W = 560, H = 220, mi = 64, md = 24, ms = 14, mb = 28;

    const max = Math.max(...dias.map(d => d.total), 1);

    const tope = Math.pow(10, Math.floor(Math.log10(max))) * Math.ceil(max / Math.pow(10, Math.floor(Math.log10(max))));

    const x = i => mi + i * (W - mi - md) / (dias.length - 1);

    const y = v => ms + (1 - v / tope) * (H - ms - mb);

    const linea = dias.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.total).toFixed(1)}`).join(" ");

    const area = `${linea} L${x(dias.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

    const corto = v => v >= 1e6 ? `$${(v / 1e6).toLocaleString("es-CO", { maximumFractionDigits:1 })} M` : v >= 1e3 ? `$${Math.round(v / 1e3)} mil` : `$${v}`;

    const grilla = [0, 0.5, 1].map(f => `
        <line x1="${mi}" x2="${W - md}" y1="${y(tope * f)}" y2="${y(tope * f)}" class="${f ? "grid" : "base"}"/>
        <text x="${mi - 8}" y="${y(tope * f) + 4}" text-anchor="end" class="eje">${corto(tope * f)}</text>`).join("");

    const etiquetas = dias.map((d, i) => i % 3 === 1 || i === dias.length - 1
        ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="eje">${d.fecha.getDate()}/${d.fecha.getMonth() + 1}</text>` : "").join("");

    const zonasHover = dias.map((d, i) => `
        <g class="hoverDia" data-viztip="${esc(`<b>${d.fecha.toLocaleDateString("es-CO", { weekday:"short", day:"numeric", month:"short" })}</b><br>${fmt(d.total)} · ${d.n} compra${d.n === 1 ? "" : "s"}`)}">
            <rect x="${x(i) - (W - mi - md) / 26}" y="${ms}" width="${(W - mi - md) / 13}" height="${H - ms - mb}" fill="transparent"/>
            <line x1="${x(i)}" x2="${x(i)}" y1="${ms}" y2="${y(0)}" class="cruz"/>
            <circle cx="${x(i)}" cy="${y(d.total)}" r="5" class="punto"/>
        </g>`).join("");

    const hayVentas = dias.some(d => d.total > 0);

    $("chartDias").innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" class="lineaSvg" role="img" aria-label="Ventas por día de los últimos 14 días">
            ${grilla}
            <path d="${area}" class="area"/>
            <path d="${linea}" class="linea"/>
            ${etiquetas}
            ${zonasHover}
        </svg>
        ${hayVentas ? "" : `<p class="vizVacio">Sin compras en los últimos 14 días</p>`}`;
}



/* ========================================
   TAQUILLA (validación de entradas)
======================================== */

let detenerCamara = null;
let procesando = false;
let ingresosSesion = 0;

async function encenderCamara(){

    if(typeof jsQR === "undefined"){

        toast("No se pudo cargar el lector de QR. Revisa tu conexión", "fa-triangle-exclamation");

        return;
    }

    try{

        detenerCamara = await iniciarEscaner($("videoTaquilla"), procesarLectura);

        $("camaraOff").classList.add("oculta");

    }catch(e){

        toast("No se pudo abrir la cámara (permiso denegado o sin cámara). Puedes escribir el código.", "fa-video-slash");
    }
}

function apagarCamara(){

    if(detenerCamara){

        detenerCamara();

        detenerCamara = null;
    }

    const off = $("camaraOff");

    if(off) off.classList.remove("oculta");
}

function validarManual(){

    const codigo = $("codigoManual").value.trim();

    if(codigo) procesarLectura(codigo);
}

// sonido corto: agudo = válida, grave = rechazada
function pitido(ok){

    try{

        const ctx = new (window.AudioContext || window.webkitAudioContext)();

        const o = ctx.createOscillator();

        const g = ctx.createGain();

        o.frequency.value = ok ? 1046 : 220;

        g.gain.setValueAtTime(0.15, ctx.currentTime);

        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.18 : 0.4));

        o.connect(g).connect(ctx.destination);

        o.start();

        o.stop(ctx.currentTime + 0.4);

    }catch(e){}

    if(navigator.vibrate) navigator.vibrate(ok ? 60 : [80, 60, 80]);
}

async function procesarLectura(texto){

    if(procesando) return;

    procesando = true;

    $("resultadoTaquilla").className = "resultadoTaquilla cargando";

    $("resultadoTaquilla").innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><p>Validando...</p>`;

    try{

        const r = await validarEntrada(texto);

        pitido(r.ok);

        renderResultado(r);

    }catch(e){

        pitido(false);

        renderResultado({ ok:false, motivo: e.message });
    }

    procesando = false;
}

function htmlResultado(r){

    const c = r.compra;

    const detalle = c ? `
        <div class="resDetalle">
            <b>${esc(c.evento)}</b>
            <small>${esc(c.fecha || "")}</small>
            <small><i class="fa-solid fa-user"></i> ${esc(c.usuario || c.email || "")}</small>
            <ul>${(c.items || []).map(i => `<li>${esc(i.etiqueta)}</li>`).join("")}</ul>
            <span class="mono">${esc(c.codigo)}</span>
        </div>` : "";

    if(!r.ok){

        return {
            clase: "rechazada",
            html: `
            <div class="resIcono"><i class="fa-solid fa-xmark"></i></div>
            <h3>No puede entrar</h3>
            <p>${esc(r.motivo)}</p>
            ${detalle}`
        };
    }

    return {
        clase: "valida",
        html: `
        <div class="resIcono"><i class="fa-solid fa-check"></i></div>
        <h3>Boleta válida</h3>
        <p>Ingresaron <b>${r.usados}</b> de <b>${r.total}</b> · faltan <b>${r.restantes}</b></p>
        ${r.manual ? `<p class="aviso"><i class="fa-solid fa-triangle-exclamation"></i> Validación manual (sin QR dinámico): verifica el documento de identidad.</p>` : ""}
        ${detalle}
        <div class="resBotones">
            <button class="primaryBtn" onclick="registrarIngresoUI('${esc(r.codigo)}', 1)"><i class="fa-solid fa-person"></i> Ingresa 1</button>
            ${r.restantes > 1 ? `<button class="ghostBtn" onclick="registrarIngresoUI('${esc(r.codigo)}', ${r.restantes})"><i class="fa-solid fa-people-group"></i> Ingresan los ${r.restantes}</button>` : ""}
        </div>`
    };
}

function renderResultado(r){

    const { clase, html } = htmlResultado(r);

    const el = $("resultadoTaquilla");

    el.className = "resultadoTaquilla " + clase;

    el.innerHTML = html;
}

async function registrarIngresoUI(codigo, n){

    try{

        const c = await DB.registrarIngreso(codigo, n);

        ingresosSesion += n;

        $("contadorIngresos").innerText = ingresosSesion;

        $("historialTaquilla").insertAdjacentHTML("afterbegin", `
            <div class="histItem">
                <i class="fa-solid fa-circle-check"></i>
                <div><b>${esc(c.evento)}</b><small>${esc(codigo)} · ${n} persona${n > 1 ? "s" : ""}</small></div>
                <span>${new Date().toLocaleTimeString("es-CO", { hour:"2-digit", minute:"2-digit" })}</span>
            </div>`);

        const total = personasCompra(c);

        $("resultadoTaquilla").className = "resultadoTaquilla valida";

        $("resultadoTaquilla").innerHTML = `
            <div class="resIcono"><i class="fa-solid fa-door-open"></i></div>
            <h3>¡Bienvenidos!</h3>
            <p>Ingreso registrado: <b>${c.ingresos}</b> de <b>${total}</b></p>`;

        $("codigoManual").value = "";

        comprasCargadas = false;

    }catch(e){

        toast(esc(e.message), "fa-triangle-exclamation");
    }
}
