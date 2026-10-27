/* ========================================
   APP MÓVIL DE ONTICKET
   Dos funciones principales:
     1. Comprar boletas (explorar → plano → pago)
     2. Mis boletas (QR dinámico, también sin internet)
   Requiere: data.js, planos.js, core.js, db.js
======================================== */

const $ = id => document.getElementById(id);

function toast(mensaje, icono = "fa-circle-check"){

    const t = document.createElement("div");

    t.className = "toast";

    t.innerHTML = `<i class="fa-solid ${icono}"></i> ${mensaje}`;

    $("toastZone").appendChild(t);

    setTimeout(() => t.classList.add("out"), 2200);

    setTimeout(() => t.remove(), 2600);
}



/* ========================================
   ESTADO
======================================== */

let usuario = null;
let compras = [];

let ciudad = "Todas";
let categoria = "Todas";

let evento = null;
let plano = null;
let estado = null;
let dejarDeEscuchar = null;
let dejarDeEscucharReservas = null;
let ventasEvento = {};
let reservasEvento = { holds: {} };
let reservaExpira = null;
let intervaloReserva = null;
let piso = 0;
let zonasFiltro = new Set();
let zoom = { s:1, x:0, y:0 };

let carrito = [];
let paso = 1;
let metodo = "";
let pagando = false;
let factura = { quiere:false };

let intervaloQR = null;
let dejarDeEscucharBoleta = null;
let intervaloDestacados = null;



/* ========================================
   NAVEGACIÓN
   Cada pantalla u hoja abierta es una "capa" en el historial,
   así el botón atrás de Android cierra la última.
======================================== */

const capas = [];

let alLlegar = null;

history.replaceState({ d:0 }, "");

function abrirCapa(tipo, id){

    capas.push({ tipo, id });

    history.pushState({ d: capas.length }, "");
}

function atras(){

    history.back();
}

// cierra capas hasta dejar "n" abiertas y luego ejecuta "luego"
function cerrarHasta(n, luego){

    const pasos = capas.length - n;

    if(pasos <= 0){

        if(luego) luego();

        return;
    }

    alLlegar = luego || null;

    history.go(-pasos);
}

window.addEventListener("popstate", e => {

    const destino = (e.state && e.state.d) || 0;

    while(capas.length > destino){

        cerrarCapa(capas.pop());
    }

    if(alLlegar){

        const f = alLlegar;

        alLlegar = null;

        setTimeout(f, 30);
    }
});

function cerrarCapa(capa){

    if(capa.tipo === "sheet"){

        $("sheet").classList.remove("abierto");

        $("fondoSheet").classList.remove("abierto");

        return;
    }

    $(capa.id).classList.remove("abierta");

    if(capa.id === "pantalla-boleta"){

        clearInterval(intervaloQR);

        if(dejarDeEscucharBoleta){

            dejarDeEscucharBoleta();

            dejarDeEscucharBoleta = null;
        }

        protegerPantalla(false);
    }

    if(capa.id === "pantalla-plano"){

        if(dejarDeEscuchar) dejarDeEscuchar();

        if(dejarDeEscucharReservas) dejarDeEscucharReservas();

        dejarDeEscuchar = dejarDeEscucharReservas = null;
    }

    if(capa.id === "pantalla-escaner") apagarEscaner();
}

function abrirPantalla(id){

    $(id).classList.add("abierta");

    $(id).querySelectorAll(".pantallaScroll").forEach(s => s.scrollTop = 0);

    abrirCapa("pantalla", id);
}

function irATab(tab){

    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.id === "tab-" + tab));

    document.querySelectorAll(".tabBtn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));

    $("tab-" + tab).scrollTop = 0;

    if(tab === "boletas") cargarBoletas();

    if(tab === "perfil") renderPerfil();
}



/* ========================================
   HOJA INFERIOR (bottom sheet)
======================================== */

function sheetAbierto(){

    return $("sheet").classList.contains("abierto");
}

function abrirSheet(html){

    $("sheetBody").innerHTML = html;

    $("sheetBody").scrollTop = 0;

    if(!sheetAbierto()){

        $("sheet").classList.add("abierto");

        $("fondoSheet").classList.add("abierto");

        abrirCapa("sheet", "sheet");
    }
}

function cerrarSheet(luego){

    if(sheetAbierto()){

        cerrarHasta(capas.length - 1, luego);

    }else if(luego){

        luego();
    }
}

// deslizar la hoja hacia abajo para cerrarla
(function(){

    const sheet = $("sheet");

    let y0 = null, dy = 0;

    sheet.addEventListener("touchstart", e => {

        if($("sheetBody").scrollTop > 0 && !e.target.closest(".sheetAsa")) return;

        y0 = e.touches[0].clientY;

        dy = 0;

    }, { passive:true });

    sheet.addEventListener("touchmove", e => {

        if(y0 === null) return;

        dy = Math.max(0, e.touches[0].clientY - y0);

        if(dy > 0) sheet.style.transform = `translateY(${dy}px)`;

    }, { passive:true });

    sheet.addEventListener("touchend", () => {

        sheet.style.transform = "";

        if(y0 !== null && dy > 110) atras();

        y0 = null;
    });
})();



/* ========================================
   EXPLORAR
======================================== */

const CATEGORIAS = ["Todas", "Conciertos", "Festivales", "Humor", "Deportes"];

function renderExplorar(){

    $("saludoTxt").innerText = usuario ? `Hola, ${usuario.name.split(" ")[0]} 👋` : "Hola 👋";

    renderChips();

    renderDestacados();

    renderEventos();
}

function renderChips(){

    const ciudades = ["Todas", ...new Set(eventosPublicos().map(e => lugarDe(e).ciudad))];

    $("chipsCiudad").innerHTML = ciudades.map(c => `
        <button class="chip ${c === ciudad ? "active" : ""}" onclick="ciudad='${c}'; renderChips(); renderEventos();">
            ${c === "Todas" ? '<i class="fa-solid fa-location-dot"></i> Todas las ciudades' : c}
        </button>`).join("");

    $("chipsCategoria").innerHTML = CATEGORIAS.map(c => `
        <button class="chip ${c === categoria ? "active" : ""}" onclick="categoria='${c}'; renderChips(); renderEventos();">${c}</button>`).join("");
}

function renderDestacados(){

    const lista = eventosPublicos().filter(e => e.destacado);

    $("destacados").innerHTML = lista.map(ev => `
        <article class="destacado" onclick="abrirEvento('${ev.id}')">
            <img src="${ev.imagen}" alt="">
            <div class="destacadoInfo">
                <span class="tag">${lugarDe(ev).ciudad} · ${ev.dia || ""} ${ev.mes || ""}</span>
                <span class="tag verde">${faltanTexto(ev)}</span>
                <h3>${ev.artista}</h3>
                <p>${ev.titulo}</p>
                <span class="desde">Desde <b>${fmt(precioDesde(ev))}</b></span>
            </div>
        </article>`).join("");

    $("dotsDestacados").innerHTML = lista.map((_, i) => `<i class="${i === 0 ? "active" : ""}"></i>`).join("");

    const cont = $("destacados");

    cont.onscroll = () => {

        const i = Math.round(cont.scrollLeft / cont.firstElementChild.offsetWidth);

        document.querySelectorAll("#dotsDestacados i").forEach((d, k) => d.classList.toggle("active", k === i));
    };

    // avanza solo cada 5 s (si el usuario no lo está tocando)
    clearInterval(intervaloDestacados);

    let tocando = false;

    cont.ontouchstart = () => tocando = true;

    cont.ontouchend = () => setTimeout(() => tocando = false, 4000);

    intervaloDestacados = setInterval(() => {

        if(tocando || capas.length || !$("tab-explorar").classList.contains("active")) return;

        const ancho = cont.firstElementChild.offsetWidth;

        const siguiente = cont.scrollLeft + ancho + 10 >= cont.scrollWidth ? 0 : cont.scrollLeft + ancho;

        cont.scrollTo({ left: siguiente, behavior: "smooth" });

    }, 5000);
}

function renderEventos(){

    const texto = $("buscar").value.toLowerCase().trim();

    const lista = eventosPublicos().filter(ev => {

        const lugar = lugarDe(ev);

        return (ciudad === "Todas" || lugar.ciudad === ciudad) &&
            (categoria === "Todas" || ev.categoria === categoria) &&
            `${ev.artista} ${ev.titulo} ${lugar.nombre} ${lugar.ciudad}`.toLowerCase().includes(texto);
    });

    $("tituloLista").innerText = ciudad === "Todas" ? "Todos los eventos" : `Eventos en ${ciudad}`;

    $("listaEventos").innerHTML = lista.length ? lista.map(ev => {

        const lugar = lugarDe(ev);

        return `
        <article class="eventoFila" onclick="abrirEvento('${ev.id}')">
            <img src="${ev.imagen}" alt="">
            <div>
                <span class="fecha">${ev.fecha} · ${ev.hora}</span>
                <span class="faltan">${faltanTexto(ev)}</span>
                <h3>${ev.artista}</h3>
                <p><i class="fa-solid fa-location-dot"></i> ${lugar.nombre}, ${lugar.ciudad}</p>
                <span class="desde">Desde <b>${fmt(precioDesde(ev))}</b></span>
            </div>
            <i class="fa-solid fa-chevron-right flecha"></i>
        </article>`;

    }).join("") : `
        <div class="vacio">
            <i class="fa-regular fa-calendar-xmark"></i>
            <p>No hay eventos con estos filtros</p>
        </div>`;
}



/* ========================================
   PANTALLA EVENTO
======================================== */

function abrirEvento(id){

    const ev = getEvento(id);

    if(evento && evento.id !== id) carrito = [];

    evento = ev;

    plano = planoDe(ev);

    ventasEvento = {};

    reservasEvento = { holds: {} };

    recalcularEstado();

    const lugar = lugarDe(ev);

    $("eventoContenido").innerHTML = `

        <div class="eventoHero">
            <img src="${ev.imagen}" alt="">
            <button class="iconBtn flotante" onclick="atras()" aria-label="Volver"><i class="fa-solid fa-arrow-left"></i></button>
        </div>

        <div class="eventoCuerpo">

            <span class="tag">${ev.categoria}</span>

            <h1>${ev.artista}</h1>

            <h3>${ev.titulo}</h3>

            <span class="faltan grande"><i class="fa-solid fa-hourglass-half"></i> ${faltanTexto(ev)}</span>

            <div class="datosEvento">
                <div><i class="fa-regular fa-calendar"></i><span><b>${ev.fecha}</b><small>Fecha</small></span></div>
                <div><i class="fa-regular fa-clock"></i><span><b>${ev.hora}</b><small>Hora</small></span></div>
            </div>

            <p class="descripcion">${ev.descripcion}</p>

            <h2 class="seccionTitulo">¿Dónde es?</h2>

            <div class="tarjeta">
                <div class="mapa">
                    <iframe src="${urlMapaEmbed(lugar)}" loading="lazy" title="Mapa"></iframe>
                </div>
                <b>${lugar.nombre}</b>
                <small>${lugar.direccion} · ${lugar.ciudad}, ${lugar.departamento}</small>
                <div class="dosBotones">
                    <a class="btnSecundario" href="${urlComoLlegar(lugar)}" target="_blank" rel="noopener"><i class="fa-solid fa-diamond-turn-right"></i> Cómo llegar</a>
                    <a class="btnSecundario" href="${urlWaze(lugar)}" target="_blank" rel="noopener"><i class="fa-brands fa-waze"></i> Waze</a>
                </div>
            </div>

            <h2 class="seccionTitulo">Localidades</h2>

            <div class="tarjeta" id="zonasEvento"></div>

            <p class="nota">
                <i class="fa-solid fa-circle-info"></i>
                Al valor de la boleta se suma el cargo por servicio (${CONFIG.feeServicio * 100}%) y el IVA (${CONFIG.ivaServicio * 100}%) sobre el servicio. Verás todo antes de pagar.
            </p>

        </div>`;

    renderZonasEvento();

    $("eventoCta").innerHTML = `
        <div><small>Desde</small><b>${fmt(precioDesde(ev))}</b></div>
        <button class="btnPrimario" onclick="abrirPlano()"><i class="fa-solid fa-chair"></i> Elegir ubicación</button>`;

    abrirPantalla("pantalla-evento");
}

function renderZonasEvento(){

    $("zonasEvento").innerHTML = Object.entries(plano.zonas).map(([id, z]) => {

        const disp = estado.disponiblesZona(id);

        const palco = z.tipo === "palco";

        return `
        <div class="zonaFila" onclick="abrirPlano('${id}')">
            <i class="zonaColor" style="background:${z.color}"></i>
            <div>
                <b>${z.nombre}</b>
                <small>${palco ? `Palco ${fmt(precioZona(evento, id))} · puesto ${fmt(precioPersona(evento, id))}` : TIPO_ZONA[z.tipo]}</small>
            </div>
            <span>
                <b>${fmt(palco ? precioPersona(evento, id) : precioZona(evento, id))}</b>
                <small class="${disp ? "" : "agotado"}">${disp ? disp + " disp." : "Agotado"}</small>
            </span>
        </div>`;

    }).join("");
}



/* ========================================
   PANTALLA PLANO
======================================== */

function abrirPlano(zonaId){

    piso = 0;

    zonasFiltro = new Set(zonaId ? [zonaId] : []);

    if(zonaId){

        const p = pisoDeZona(plano, zonaId);

        if(p >= 0) piso = p;
    }

    zoom = { s:1, x:0, y:0 };

    $("soloDisponibles").checked = false;

    $("soloIndividuales").checked = false;

    const tienePalcos = plano.pisos.some(p => p.palcos.length);

    $("switchIndividuales").style.display = tienePalcos ? "" : "none";

    document.querySelector(".leyenda .lgPalco").style.display = tienePalcos ? "" : "none";

    $("planoEvento").innerText = evento.artista;

    $("planoLugar").innerText = `${lugarDe(evento).nombre} · ${evento.fecha}`;

    $("pistaGesto").classList.add("show");

    setTimeout(() => $("pistaGesto").classList.remove("show"), 3500);

    abrirPantalla("pantalla-plano");

    // sillas vendidas y apartadas en tiempo real
    if(dejarDeEscuchar) dejarDeEscuchar();

    if(dejarDeEscucharReservas) dejarDeEscucharReservas();

    dejarDeEscucharReservas = DB.escucharReservas(evento.id, reservas => {

        reservasEvento = reservas;

        recalcularEstado();

        renderPlanoCompleto();
    });

    dejarDeEscuchar = DB.escucharVentas(evento.id, ventas => {

        ventasEvento = ventas;

        recalcularEstado();

        const antes = carrito.length;

        carrito = carrito.filter(i => !i.ids.some(id => estado.idGuardado(id)));

        if(carrito.length < antes && !pagando) toast("Una de tus ubicaciones acaba de ser vendida", "fa-triangle-exclamation");

        renderPlanoCompleto();

        renderZonasEvento();
    });
}

function recalcularEstado(){

    if(evento) estado = crearEstadoVenta(evento, ventasEvento, reservasEvento, usuario && usuario.uid);
}

function renderPlanoCompleto(){

    $("pisoTabs").innerHTML = plano.pisos.length > 1 ? plano.pisos.map((p, i) => `
        <button class="${i === piso ? "active" : ""}" onclick="cambiarPiso(${i})">${p.nombre}</button>`).join("") : "";

    $("pisoTabs").style.display = plano.pisos.length > 1 ? "" : "none";

    $("chipsZona").innerHTML = `
        <button class="chip ${zonasFiltro.size === 0 ? "active" : ""}" onclick="toggleZona(null)">Todas</button>` +
        Object.entries(plano.zonas).map(([id, z]) => `
        <button class="chip zonaChip ${zonasFiltro.has(id) ? "active" : ""}" style="--zc:${z.color}" onclick="toggleZona('${id}')">
            <i class="punto"></i> ${z.nombre} <small>${fmt(precioPersona(evento, id))}</small>
        </button>`).join("");

    renderPlano();

    renderCarrito();
}

function renderPlano(){

    const p = plano.pisos[piso];

    const svg = $("planoSvg");

    svg.setAttribute("viewBox", `0 0 ${p.w} ${p.h}`);

    svg.innerHTML = planoSVG(evento, piso, estado, carrito, {
        zonas: zonasFiltro,
        precioMax: Infinity,
        soloDisp: $("soloDisponibles").checked,
        soloInd: $("soloIndividuales").checked
    });

    aplicarZoom();
}

function cambiarPiso(i){

    piso = i;

    zoom = { s:1, x:0, y:0 };

    renderPlanoCompleto();
}

function toggleZona(id){

    if(id === null) zonasFiltro.clear();

    else if(zonasFiltro.has(id)) zonasFiltro.delete(id);

    else{

        zonasFiltro.add(id);

        const p = pisoDeZona(plano, id);

        if(p >= 0 && p !== piso){

            piso = p;

            zoom = { s:1, x:0, y:0 };
        }
    }

    renderPlanoCompleto();
}

function cambiarFiltro(){

    renderPlano();
}



/* ----- gestos: pellizcar para zoom, arrastrar, tocar ----- */

const svgPlano = $("planoSvg");

const punteros = new Map();

let gesto = null;

let seMovio = false;

function aSvg(x, y){

    const pt = svgPlano.createSVGPoint();

    pt.x = x;

    pt.y = y;

    return pt.matrixTransform(svgPlano.getScreenCTM().inverse());
}

function datosGesto(){

    const pts = [...punteros.values()];

    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;

    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;

    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;

    return { n: pts.length, centro: aSvg(cx, cy), pantalla: { x:cx, y:cy }, dist };
}

function reiniciarGesto(){

    gesto = punteros.size ? { ...datosGesto(), zoom: { ...zoom } } : null;
}

svgPlano.addEventListener("pointerdown", e => {

    if(punteros.size === 0) seMovio = false;

    punteros.set(e.pointerId, { x:e.clientX, y:e.clientY });

    reiniciarGesto();
});

svgPlano.addEventListener("pointermove", e => {

    if(!punteros.has(e.pointerId) || !gesto) return;

    punteros.set(e.pointerId, { x:e.clientX, y:e.clientY });

    const g = datosGesto();

    const movPx = Math.hypot(g.pantalla.x - gesto.pantalla.x, g.pantalla.y - gesto.pantalla.y);

    if(g.n >= 2 && gesto.n >= 2 && gesto.dist > 0){

        // pellizco: escala alrededor del punto medio de los dedos
        const s = clamp(gesto.zoom.s * g.dist / gesto.dist, 1, 6);

        zoom.s = s;

        zoom.x = g.centro.x - (gesto.centro.x - gesto.zoom.x) / gesto.zoom.s * s;

        zoom.y = g.centro.y - (gesto.centro.y - gesto.zoom.y) / gesto.zoom.s * s;

        seMovio = true;

        aplicarZoom();

    }else if(g.n === 1 && movPx > 6){

        seMovio = true;

        if(zoom.s > 1){

            zoom.x = gesto.zoom.x + (g.centro.x - gesto.centro.x);

            zoom.y = gesto.zoom.y + (g.centro.y - gesto.centro.y);

            aplicarZoom();
        }
    }
});

["pointerup", "pointercancel", "pointerleave"].forEach(tipo =>
    svgPlano.addEventListener(tipo, e => {

        punteros.delete(e.pointerId);

        reiniciarGesto();
    }));

svgPlano.addEventListener("click", e => {

    if(seMovio){

        seMovio = false;

        return;
    }

    const g = e.target.closest("[data-kind]");

    if(!g || g.classList.contains("dim")) return;

    if(g.dataset.kind === "zona"){

        toggleZona(g.dataset.zona);

        return;
    }

    const el = buscarElementoPlano(plano, g.dataset.kind, g.dataset.id);

    if(g.dataset.kind === "seat") tocarAsiento(el);

    if(g.dataset.kind === "palco") abrirPalco(el);

    if(g.dataset.kind === "ga") abrirGeneral(el);
});

function aplicarZoom(){

    const p = plano.pisos[piso];

    if(zoom.s <= 1.01){

        zoom = { s:1, x:0, y:0 };

    }else{

        zoom.x = clamp(zoom.x, p.w - p.w * zoom.s, 0);

        zoom.y = clamp(zoom.y, p.h - p.h * zoom.s, 0);
    }

    const g = $("planoG");

    if(g) g.setAttribute("transform", `translate(${zoom.x} ${zoom.y}) scale(${zoom.s})`);
}

function zoomBoton(factor){

    const p = plano.pisos[piso];

    const cx = p.w / 2, cy = p.h / 2;

    const s = clamp(zoom.s * factor, 1, 6);

    zoom.x = cx - (cx - zoom.x) * s / zoom.s;

    zoom.y = cy - (cy - zoom.y) * s / zoom.s;

    zoom.s = s;

    aplicarZoom();
}

function resetZoom(){

    zoom = { s:1, x:0, y:0 };

    aplicarZoom();
}



/* ========================================
   SELECCIÓN DE UBICACIONES
======================================== */

function tocarAsiento(a){

    if(estado.reservado(a.id)){

        toast("Alguien está comprando esta silla. Intenta en unos minutos", "fa-hourglass-half");

        return;
    }

    if(estado.asientoVendido(a)){

        toast("Esta silla ya fue vendida", "fa-circle-xmark");

        return;
    }

    if(carrito.find(i => i.key === a.id)){

        quitar(a.id);

    }else{

        agregar(itemAsiento(evento, a));
    }
}

function agregar(item){

    carrito.push(item);

    actualizarSeleccion();
}

function quitar(key){

    carrito = carrito.filter(i => i.key !== key);

    actualizarSeleccion();
}

function actualizarSeleccion(){

    actualizarReserva();

    renderPlano();

    renderCarrito();
}

function renderCarrito(){

    const bar = $("carritoBar");

    bar.classList.toggle("show", carrito.length > 0);

    if(!carrito.length) return;

    const c = calcularCostos(carrito);

    $("carritoCount").innerText = c.personas;

    $("carritoTotal").innerText = fmt(c.total);

    bar.classList.remove("bump");

    void bar.offsetWidth;

    bar.classList.add("bump");
}



/* ----- palcos ----- */

let palcoAbierto = null;

function abrirPalco(p){

    palcoAbierto = p;

    abrirSheet(htmlPalco());
}

function htmlPalco(){

    const p = palcoAbierto;

    const z = plano.zonas[p.zona];

    const vendido = estado.palcoVendido(p);

    const cabecera = `
        <div class="sheetCabecera" style="--c:${z.color}">
            <span class="tipoPalco ${p.individual ? "ind" : ""}">
                ${p.individual ? '<i class="fa-solid fa-user"></i> Palco individual · por puesto' : '<i class="fa-solid fa-users"></i> Palco completo · 10 personas'}
            </span>
            <h2>${z.nombre} · Palco ${p.num}</h2>
        </div>`;

    const silla = (i, total, contenido, clases, accion) => {

        const ang = (i / total) * Math.PI * 2 - Math.PI / 2;

        return `<button class="silla ${clases}" style="left:calc(50% + ${Math.cos(ang) * 100}px); top:calc(50% + ${Math.sin(ang) * 100}px)" ${accion}>${contenido}</button>`;
    };

    if(p.individual){

        const puestos = estado.puestosPalco(p);

        const mios = carrito.filter(i => i.palco === p.id);

        const precio = precioPersona(evento, p.zona);

        return cabecera + `
            <p class="sheetSub">Toca las sillas que quieres. Compartes el palco con otros asistentes.</p>
            <div class="mesa">
                <div class="mesaCentro" style="--c:${z.color}">Palco<b>${p.num}</b></div>
                ${puestos.map((x, i) => silla(i, puestos.length, x.n,
                    `${x.vendido ? "sold" : ""} ${mios.some(m => m.key === x.id) ? "sel" : ""}`,
                    x.vendido ? "disabled" : `onclick="tocarPuesto(${x.n})"`)).join("")}
            </div>
            <div class="resumen3">
                <div><small>Por puesto</small><b>${fmt(precio)}</b></div>
                <div><small>Elegidos</small><b>${mios.length}</b></div>
                <div><small>Subtotal</small><b>${fmt(precio * mios.length)}</b></div>
            </div>
            <button class="btnPrimario ancho" onclick="atras()"><i class="fa-solid fa-check"></i> Listo</button>`;
    }

    const enCarro = carrito.find(i => i.key === p.id);

    const total = precioZona(evento, p.zona);

    return cabecera + `
        <div class="mesa">
            <div class="mesaCentro" style="--c:${z.color}">Palco<b>${p.num}</b></div>
            ${Array.from({ length:10 }, (_, i) => silla(i, 10, '<i class="fa-solid fa-user"></i>',
                `fija ${vendido ? "sold" : ""} ${enCarro ? "sel" : ""}`, "disabled")).join("")}
        </div>
        <div class="resumen3">
            <div><small>Palco</small><b>${fmt(total)}</b></div>
            <div><small>Por persona</small><b>${fmt(total / 10)}</b></div>
            <div><small>Capacidad</small><b>10</b></div>
        </div>
        ${vendido ? `<button class="btnPrimario ancho" disabled>Este palco ya fue vendido</button>`
            : enCarro ? `<button class="btnSecundario ancho peligro" onclick="quitar('${p.id}'); abrirSheet(htmlPalco());"><i class="fa-regular fa-trash-can"></i> Quitar de mi compra</button>`
            : `<button class="btnPrimario ancho" onclick="agregar(itemPalco(evento, palcoAbierto)); atras();"><i class="fa-solid fa-cart-plus"></i> Agregar palco · ${fmt(total)}</button>`}`;
}

function tocarPuesto(n){

    const puesto = estado.puestosPalco(palcoAbierto).find(x => x.n === n);

    if(carrito.find(i => i.key === puesto.id)) quitar(puesto.id);

    else agregar(itemPuesto(evento, palcoAbierto, puesto));

    abrirSheet(htmlPalco());
}



/* ----- zonas generales ----- */

let generalAbierta = null;
let cantidad = 1;

function abrirGeneral(g){

    generalAbierta = g;

    const enCarro = carrito.find(i => i.key === g.id);

    cantidad = enCarro ? enCarro.cantidad : 1;

    abrirSheet(htmlGeneral());
}

function htmlGeneral(){

    const g = generalAbierta;

    const z = plano.zonas[g.zona];

    const disp = estado.generalDisponible(g);

    const max = Math.min(CONFIG.maxGeneral, disp);

    const precio = precioZona(evento, g.zona);

    const enCarro = carrito.find(i => i.key === g.id);

    return `
        <div class="sheetCabecera" style="--c:${z.color}">
            <span class="tipoPalco"><i class="fa-solid fa-people-group"></i> Sin silla asignada</span>
            <h2>${z.nombre}${g.texto.length === 1 ? " · Zona " + g.texto : ""}</h2>
        </div>
        <p class="sheetSub">${disp} boletas disponibles</p>
        ${disp ? `
        <div class="contador">
            <button onclick="cambiarCantidad(-1)" ${cantidad <= 1 ? "disabled" : ""}><i class="fa-solid fa-minus"></i></button>
            <span>${cantidad}</span>
            <button onclick="cambiarCantidad(1)" ${cantidad >= max ? "disabled" : ""}><i class="fa-solid fa-plus"></i></button>
        </div>
        <div class="resumen3">
            <div><small>Precio</small><b>${fmt(precio)}</b></div>
            <div><small>Cantidad</small><b>${cantidad}</b></div>
            <div><small>Subtotal</small><b>${fmt(precio * cantidad)}</b></div>
        </div>
        <button class="btnPrimario ancho" onclick="agregarGeneral()"><i class="fa-solid fa-cart-plus"></i> ${enCarro ? "Actualizar" : "Agregar a mi compra"}</button>
        ${enCarro ? `<button class="btnSecundario ancho peligro" onclick="quitar('${g.id}'); atras();">Quitar</button>` : ""}
        ` : `<button class="btnPrimario ancho" disabled>Agotado</button>`}`;
}

function cambiarCantidad(d){

    cantidad = clamp(cantidad + d, 1, Math.min(CONFIG.maxGeneral, estado.generalDisponible(generalAbierta)));

    abrirSheet(htmlGeneral());
}

function agregarGeneral(){

    carrito = carrito.filter(i => i.key !== generalAbierta.id);

    agregar(itemGeneral(evento, generalAbierta, cantidad));

    atras();
}



/* ========================================
   CHECKOUT (hoja inferior en 3 pasos)
======================================== */

const METODOS = [
    ["Nequi", "img/nequi.png"],
    ["Daviplata", "img/daviplata.png"],
    ["PSE", "img/pse.png"],
    ["Visa", "img/visa.png"],
    ["Mastercard", "img/mastercard.png"]
];

async function abrirCheckout(){

    if(!carrito.length) return;

    if(!usuario){

        abrirAuth("Inicia sesión para terminar tu compra", () => abrirCheckout());

        return;
    }

    // correo real: para comprar, la cuenta debe estar verificada
    if(!usuario.verificado){

        abrirVerificacion(() => abrirCheckout());

        return;
    }

    // se apartan las ubicaciones mientras paga
    try{

        reservaExpira = await DB.reservar(evento.id, carrito, CONFIG.minutosReserva);

        iniciarContadorReserva();

    }catch(e){

        toast(esc(e.message), "fa-triangle-exclamation");

        return;
    }

    paso = 1;

    metodo = "";

    factura = { quiere:false, tipoPersona:"Natural", tipoDoc:"CC", responsabilidad:"R-99-PN" };

    renderCheckout();
}

function guardarFormularioFactura(){

    if(!$("feDocumento")) return;

    ["tipoPersona", "tipoDoc", "documento", "nombre", "correo", "telefono", "direccion", "ciudad", "responsabilidad"].forEach(k => {

        const el = $("fe" + k[0].toUpperCase() + k.slice(1));

        if(el) factura[k] = el.value.trim();
    });
}

function renderCheckout(){

    const c = calcularCostos(carrito);

    const pasos = ["Resumen", "Facturación", "Pago"].map((n, i) => `
        <div class="paso ${i + 1 === paso ? "active" : ""} ${i + 1 < paso ? "hecho" : ""}">
            <span>${i + 1 < paso ? '<i class="fa-solid fa-check"></i>' : i + 1}</span>${n}
        </div>`).join('<i class="pasoLinea"></i>');

    let cuerpo = "";

    if(paso === 1){

        cuerpo = `
            <h2>Resumen de tu compra</h2>
            <div class="eventoMini">
                <img src="${evento.imagen}" alt="">
                <div><b>${evento.artista}</b><small>${evento.fecha} · ${evento.hora}</small><small>${lugarDe(evento).nombre}</small></div>
            </div>
            ${carrito.map(i => `
            <div class="itemFila">
                <i class="zonaColor" style="background:${plano.zonas[i.zona].color}"></i>
                <div><b>${i.etiqueta}</b><small>${tipoItemTexto(i)}</small></div>
                <span>${fmt(i.precio * i.cantidad)}</span>
                <button onclick="quitarEnCheckout('${i.key}')" aria-label="Quitar"><i class="fa-solid fa-xmark"></i></button>
            </div>`).join("")}`;

    }else if(paso === 2){

        const juridica = factura.tipoPersona === "Jurídica";

        const esNit = factura.tipoDoc === "NIT";

        cuerpo = `
            <h2>Facturación electrónica</h2>
            <label class="opcionFactura ${factura.quiere ? "on" : ""}">
                <input type="checkbox" ${factura.quiere ? "checked" : ""} onchange="guardarFormularioFactura(); factura.quiere=this.checked; renderCheckout();">
                <div><b>Quiero factura electrónica</b><small>Se envía a tu correo. Si no la pides, recibes un comprobante.</small></div>
            </label>
            ${factura.quiere ? `
            <div class="formulario">
                <label>Tipo de persona
                    <select id="feTipoPersona" onchange="guardarFormularioFactura(); if(this.value==='Jurídica') factura.tipoDoc='NIT'; renderCheckout();">
                        <option ${!juridica ? "selected" : ""} value="Natural">Persona natural</option>
                        <option ${juridica ? "selected" : ""} value="Jurídica">Persona jurídica</option>
                    </select>
                </label>
                <label>Tipo de documento
                    <select id="feTipoDoc" onchange="guardarFormularioFactura(); renderCheckout();">
                        ${[["CC", "Cédula de ciudadanía"], ["CE", "Cédula de extranjería"], ["NIT", "NIT"], ["PP", "Pasaporte"]].map(([v, t]) =>
                            `<option value="${v}" ${factura.tipoDoc === v ? "selected" : ""}>${t}</option>`).join("")}
                    </select>
                </label>
                <label>Número de documento
                    <div class="filaDoc">
                        <input id="feDocumento" inputmode="numeric" value="${esc(factura.documento || "")}" oninput="${esNit ? "$('feDV').innerText='DV '+(this.value?digitoVerificacion(this.value):'-')" : ""}">
                        ${esNit ? `<span class="dv" id="feDV">DV ${factura.documento ? digitoVerificacion(factura.documento) : "-"}</span>` : ""}
                    </div>
                </label>
                <label>${juridica ? "Razón social" : "Nombre completo"}<input id="feNombre" value="${esc(factura.nombre ?? usuario.name)}"></label>
                <label>Correo para la factura<input id="feCorreo" type="email" value="${esc(factura.correo ?? usuario.email)}"></label>
                <label>Teléfono<input id="feTelefono" type="tel" value="${esc(factura.telefono || "")}"></label>
                <label>Dirección<input id="feDireccion" value="${esc(factura.direccion || "")}"></label>
                <label>Ciudad<input id="feCiudad" value="${esc(factura.ciudad || "")}"></label>
                <label>Responsabilidad fiscal
                    <select id="feResponsabilidad">
                        ${[["R-99-PN", "No responsable"], ["O-13", "Gran contribuyente"], ["O-15", "Autorretenedor"], ["O-23", "Agente de retención IVA"], ["O-47", "Régimen simple"]].map(([v, t]) =>
                            `<option value="${v}" ${factura.responsabilidad === v ? "selected" : ""}>${v} · ${t}</option>`).join("")}
                    </select>
                </label>
            </div>` : ""}`;

    }else{

        cuerpo = `
            <h2>Método de pago</h2>
            <div class="metodos">
                ${METODOS.map(([n, img]) => `
                <button class="metodo ${metodo === n ? "active" : ""}" onclick="metodo='${n}'; renderCheckout();">
                    <img src="${img}" alt="">${n}
                </button>`).join("")}
            </div>
            <label class="terminos">
                <input type="checkbox" id="terminos">
                Acepto los términos y condiciones y la política de datos.
            </label>
            <p class="nota"><i class="fa-solid fa-circle-info"></i> Pasarela de pago simulada (proyecto académico).</p>`;
    }

    const boton = pagando ? '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...'
        : paso === 1 ? 'Continuar <i class="fa-solid fa-arrow-right"></i>'
        : paso === 2 ? 'Ir a pagar <i class="fa-solid fa-arrow-right"></i>'
        : `<i class="fa-solid fa-lock"></i> Pagar ${fmt(c.total)}`;

    abrirSheet(`
        <div class="reservaApp ${reservaExpira ? "show" : ""}"><i class="fa-solid fa-hourglass-half"></i> Ubicaciones apartadas por <b class="reservaTiempo">${tiempoReserva()}</b></div>
        <div class="pasos">${pasos}</div>
        ${cuerpo}
        <div class="desglose">
            <div><span>Boletas (${c.personas} ${c.personas === 1 ? "persona" : "personas"})</span><span>${fmt(c.subtotal)}</span></div>
            <div><span>Servicio (${CONFIG.feeServicio * 100}%)</span><span>${fmt(c.servicio)}</span></div>
            <div><span>IVA ${CONFIG.ivaServicio * 100}% del servicio</span><span>${fmt(c.iva)}</span></div>
            <div class="total"><span>Total</span><span>${fmt(c.total)}</span></div>
        </div>
        <div class="sheetAcciones">
            ${paso > 1 ? `<button class="btnSecundario" onclick="guardarFormularioFactura(); paso--; renderCheckout();"><i class="fa-solid fa-arrow-left"></i></button>` : ""}
            <button class="btnPrimario ancho" ${pagando ? "disabled" : ""} onclick="siguientePaso()">${boton}</button>
        </div>`);
}

function quitarEnCheckout(key){

    quitar(key);

    if(carrito.length) renderCheckout();

    else atras();
}

function siguientePaso(){

    if(paso === 2){

        guardarFormularioFactura();

        if(factura.quiere){

            const faltan = ["documento", "nombre", "correo", "direccion", "ciudad"].filter(k => !factura[k]);

            const correoOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(factura.correo || "");

            if(faltan.length || !correoOk){

                toast("Completa los datos de la factura", "fa-triangle-exclamation");

                return;
            }
        }
    }

    if(paso === 3){

        pagar();

        return;
    }

    paso++;

    renderCheckout();
}

async function pagar(){

    if(pagando) return;

    if(!metodo){

        toast("Elige un método de pago", "fa-credit-card");

        return;
    }

    if(!$("terminos").checked){

        toast("Acepta los términos y condiciones", "fa-triangle-exclamation");

        return;
    }

    pagando = true;

    renderCheckout();

    try{

        if(!reservaExpira || reservaExpira < Date.now()) throw new Error("Tu reserva venció. Vuelve a intentarlo.");

        const compra = crearCompra(evento, carrito, metodo, null);

        if(factura.quiere){

            const adquiriente = {
                tipoPersona: factura.tipoPersona,
                tipoDoc: factura.tipoDoc,
                documento: factura.documento,
                dv: factura.tipoDoc === "NIT" ? digitoVerificacion(factura.documento) : null,
                nombre: factura.nombre,
                correo: factura.correo,
                telefono: factura.telefono || "",
                direccion: factura.direccion,
                ciudad: factura.ciudad,
                responsabilidad: factura.responsabilidad
            };

            compra.factura = await crearFactura(`OTFE-${await DB.siguienteFactura()}`, adquiriente, compra.total, compra.codigo);
        }

        const guardada = await DB.comprar(compra);

        detenerReserva();

        // boletas (y factura, si la pidió) a su correo
        DB.encolarCorreo(
            [usuario.email, guardada.factura && guardada.factura.adquiriente.correo],
            correoCompra(guardada, CONFIG.sitioWeb || "")
        ).catch(() => {});

        compras.unshift(guardada);

        guardarCache();

        carrito = [];

        pagando = false;

        mostrarExito(guardada);

    }catch(e){

        pagando = false;

        toast(esc(e.message), "fa-triangle-exclamation");

        renderCheckout();
    }
}

/* ----- reserva temporal ----- */

function tiempoReserva(){

    const s = reservaExpira ? Math.max(0, Math.round((reservaExpira - Date.now()) / 1000)) : CONFIG.minutosReserva * 60;

    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function iniciarContadorReserva(){

    clearInterval(intervaloReserva);

    const tic = () => {

        if(!reservaExpira) return;

        const s = Math.max(0, Math.round((reservaExpira - Date.now()) / 1000));

        document.querySelectorAll(".reservaTiempo").forEach(el => el.innerText = tiempoReserva());

        document.querySelectorAll(".reservaApp, .reservaBarra").forEach(el => {

            el.classList.add("show");

            el.classList.toggle("urgente", s <= 60);
        });

        if(s <= 0){

            detenerReserva();

            if(sheetAbierto() && !pagando) cerrarSheet();

            toast(`Tu reserva de ${CONFIG.minutosReserva} minutos venció. Toca Continuar para apartarlas de nuevo.`, "fa-hourglass-end");
        }
    };

    tic();

    intervaloReserva = setInterval(tic, 1000);
}

function detenerReserva(){

    clearInterval(intervaloReserva);

    reservaExpira = null;

    document.querySelectorAll(".reservaApp, .reservaBarra").forEach(el => el.classList.remove("show"));
}

function actualizarReserva(){

    if(!reservaExpira || !evento) return;

    if(!carrito.length){

        DB.liberar(evento.id);

        detenerReserva();

        return;
    }

    DB.reservar(evento.id, carrito, (reservaExpira - Date.now()) / 60000).catch(() => {});
}

function mostrarExito(compra){

    abrirSheet(`
        <div class="exito">
            <div class="exitoIcono"><i class="fa-solid fa-check"></i></div>
            <h2>¡Tu experiencia está asegurada!</h2>
            <p>${esc(compra.evento)}</p>
            <p class="codigo">${esc(compra.codigo)}</p>
            ${compra.factura ? `<span class="chipFactura"><i class="fa-solid fa-file-invoice"></i> Factura ${esc(compra.factura.numero)} enviada a ${esc(compra.factura.adquiriente.correo)}</span>` : ""}
            <button class="btnPrimario ancho" onclick="irABoletaNueva('${esc(compra.codigo)}')">
                <i class="fa-solid fa-qrcode"></i> Ver mi boleta
            </button>
        </div>`);
}

function irABoletaNueva(codigo){

    cerrarHasta(0, () => {

        irATab("boletas");

        abrirBoleta(codigo);
    });
}



/* ========================================
   INICIAR SESIÓN / REGISTRO (hoja inferior)
======================================== */

let modoAuth = "login";
let despuesAuth = null;

function abrirAuth(mensaje, luego){

    despuesAuth = luego || null;

    abrirSheet(htmlAuth(mensaje));
}

function htmlAuth(mensaje = ""){

    const registro = modoAuth === "registro";

    return `
        <div class="auth">
            <img src="img/logo.png" alt="OnTicket">
            <h2>${registro ? "Crea tu cuenta" : "Bienvenido de nuevo"}</h2>
            <p class="sheetSub">${mensaje || "Compra y lleva tus boletas siempre contigo."}</p>
            ${registro ? `<input id="authNombre" placeholder="Nombre completo" autocomplete="name">` : ""}
            <input id="authCorreo" type="email" placeholder="Correo electrónico" autocomplete="email">
            <input id="authClave" type="password" placeholder="Contraseña (mín. 6 caracteres)" autocomplete="${registro ? "new-password" : "current-password"}">
            <button class="btnPrimario ancho" id="authBtn" onclick="enviarAuth()">${registro ? "Crear cuenta" : "Iniciar sesión"}</button>
            ${registro ? "" : `<button class="enlace pequeno" onclick="olvideClave()">¿Olvidaste tu contraseña?</button>`}
            <button class="enlace" onclick="modoAuth='${registro ? "login" : "registro"}'; abrirSheet(htmlAuth(${JSON.stringify(mensaje).replace(/"/g, "&quot;")}));">
                ${registro ? "Ya tengo cuenta" : "¿No tienes cuenta? Regístrate"}
            </button>
        </div>`;
}

async function olvideClave(){

    const correo = $("authCorreo").value.trim();

    if(!correo){

        toast("Escribe tu correo y vuelve a tocar \"¿Olvidaste tu contraseña?\"", "fa-envelope");

        $("authCorreo").focus();

        return;
    }

    try{

        await DB.recuperarClave(correo);

        toast(`Te enviamos un correo a ${esc(correo)} para crear una contraseña nueva`, "fa-envelope-circle-check");

    }catch(e){

        toast(esc(e.message), "fa-circle-xmark");
    }
}

let despuesVerificar = null;

function abrirVerificacion(luego){

    despuesVerificar = luego || null;

    abrirSheet(`
        <div class="auth">
            <div class="verificaIcono"><i class="fa-solid fa-envelope-open-text"></i></div>
            <h2>Verifica tu correo</h2>
            <p class="sheetSub">Te enviamos un enlace a <b>${esc(usuario.email)}</b>. Ábrelo para confirmar que es tuyo: ahí llegarán tus boletas y tu factura electrónica.</p>
            <p class="sheetSub"><small>¿No lo ves? Revisa Spam o Promociones.</small></p>
            <button class="btnPrimario ancho" onclick="yaVerifique()"><i class="fa-solid fa-circle-check"></i> Ya lo verifiqué</button>
            <button class="enlace" onclick="reenviarVerificacion()">Reenviar correo</button>
        </div>`);
}

async function yaVerifique(){

    const u = await DB.refrescarUsuario();

    if(u && u.verificado){

        usuario = u;

        recalcularEstado();

        alCambiarUsuario();

        toast("¡Correo verificado! Ya puedes comprar", "fa-circle-check");

        const luego = despuesVerificar;

        despuesVerificar = null;

        if(luego) luego();

        else cerrarSheet();

    }else{

        toast("Aún no aparece verificado. Abre el enlace del correo", "fa-envelope");
    }
}

async function reenviarVerificacion(){

    try{

        await DB.reenviarVerificacion();

        toast("Te reenviamos el correo de verificación", "fa-envelope-circle-check");

    }catch(e){

        toast(esc(e.message), "fa-circle-xmark");
    }
}

async function enviarAuth(){

    const correo = $("authCorreo").value.trim();

    const clave = $("authClave").value;

    const btn = $("authBtn");

    btn.disabled = true;

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try{

        if(modoAuth === "registro"){

            await DB.registrar($("authNombre").value.trim(), correo, clave);

            usuario = DB.usuario();

            alCambiarUsuario();

            modoAuth = "login";

            // correo real: debe verificarlo antes de comprar
            if(!usuario.verificado){

                abrirVerificacion(despuesAuth);

                despuesAuth = null;

                return;
            }

        }else{

            await DB.login(correo, clave, true);
        }

        usuario = DB.usuario();

        toast(`¡Hola, ${esc(usuario.name.split(" ")[0])}!`, "fa-hand");

        alCambiarUsuario();

        const luego = despuesAuth;

        despuesAuth = null;

        if(luego) luego();

        else cerrarSheet();

    }catch(e){

        toast(esc(e.message), "fa-circle-xmark");

        btn.disabled = false;

        btn.innerText = modoAuth === "registro" ? "Crear cuenta" : "Iniciar sesión";
    }
}



/* ========================================
   MIS BOLETAS
======================================== */

const claveCache = () => "boletas_" + (usuario ? usuario.uid : "");

function guardarCache(){

    try{ localStorage.setItem(claveCache(), JSON.stringify(compras)); }catch(e){}
}

async function cargarBoletas(){

    if(!usuario){

        compras = [];

        renderBoletas();

        return;
    }

    $("iconRefrescar").classList.add("fa-spin");

    try{

        compras = await DB.misCompras();

        guardarCache();

        $("avisoOffline").classList.remove("show");

    }catch(e){

        // sin internet: se muestran las boletas guardadas en el celular
        compras = JSON.parse(localStorage.getItem(claveCache()) || "[]");

        $("avisoOffline").classList.add("show");
    }

    $("iconRefrescar").classList.remove("fa-spin");

    renderBoletas();
}

function renderBoletas(){

    const cont = $("listaBoletas");

    $("badgeBoletas").innerText = compras.length || "";

    if(!usuario){

        cont.innerHTML = `
            <div class="vacio grande">
                <i class="fa-solid fa-ticket"></i>
                <h3>Tus boletas viven aquí</h3>
                <p>Inicia sesión para ver tus compras y entrar con tu QR.</p>
                <button class="btnPrimario" onclick="abrirAuth()">Iniciar sesión</button>
            </div>`;

        return;
    }

    if(!compras.length){

        cont.innerHTML = `
            <div class="vacio grande">
                <i class="fa-solid fa-ticket"></i>
                <h3>Aún no tienes boletas</h3>
                <p>Tu próxima experiencia te está esperando.</p>
                <button class="btnPrimario" onclick="irATab('explorar')">Explorar eventos</button>
            </div>`;

        return;
    }

    cont.innerHTML = compras.map(c => {

        const ev = getEvento(c.eventoId);

        const n = (c.items || []).reduce((s, i) => s + (i.tipo === "general" ? i.cantidad : i.personas || 1), 0) || (c.entradas || []).length;

        const ing = estadoIngreso(c);

        return `
        <article class="boletaTarjeta ${ing.completa ? "usada" : ""}" onclick="abrirBoleta('${esc(c.codigo)}')">
            <div class="boletaImg" style="background-image:url('${ev ? ev.imagen : "img/logo.png"}')"></div>
            <div class="boletaInfo">
                ${ing.completa ? `<span class="selloLista"><i class="fa-solid fa-circle-check"></i> Ya ingresaste</span>` : ing.parcial ? `<span class="selloLista parcial">${ing.usados} de ${ing.total} ingresaron</span>` : ""}
                <b>${esc(ev ? ev.artista : c.evento)}</b>
                <small><i class="fa-regular fa-calendar"></i> ${esc(c.fecha || "")}</small>
                <small><i class="fa-solid fa-location-dot"></i> ${esc(c.lugar || "")}</small>
                <span class="boletaCodigo">${esc(c.codigo)}</span>
            </div>
            <div class="boletaTalon">
                <b>${n}</b>
                <small>${n === 1 ? "entrada" : "entradas"}</small>
                <i class="fa-solid fa-qrcode"></i>
            </div>
        </article>`;

    }).join("");
}

function abrirBoleta(codigo){

    const c = compras.find(x => x.codigo === codigo);

    if(!c) return;

    const ev = getEvento(c.eventoId);

    const lugar = ev ? lugarDe(ev) : null;

    $("boletaContenido").innerHTML = `
        <div class="boleta">

            <div class="boletaCabeza" style="background-image:url('${ev ? ev.imagen : "img/logo.png"}')">
                <div>
                    <span class="tag">${esc(ev ? ev.categoria : "Evento")}</span>
                    <h2>${esc(ev ? ev.artista : c.evento)}</h2>
                    <p>${esc(ev ? ev.titulo : "")}</p>
                </div>
            </div>

            <div class="boletaDatos">
                <div><small>Fecha</small><b>${esc(ev ? ev.fecha : c.fecha)}</b></div>
                <div><small>Hora</small><b>${esc(ev ? ev.hora : "")}</b></div>
                <div class="ancho"><small>Lugar</small><b>${esc(c.lugar || "")}</b></div>
            </div>

            <div class="perforado"></div>

            <div class="boletaQR" id="boletaQR">${htmlQRBoleta(c)}</div>

            <div class="perforado"></div>

            <div class="boletaItems">
                <h3>Tus ubicaciones</h3>
                ${(c.items || []).map(i => `
                    <div class="itemFila simple">
                        <i class="zonaColor" style="background:${ev ? planoDe(ev).zonas[i.zona]?.color || "#888" : "#888"}"></i>
                        <div><b>${esc(i.etiqueta)}</b><small>${tipoItemTexto(i)}</small></div>
                    </div>`).join("") || (c.entradas || []).map(e => `<div class="itemFila simple"><div><b>${esc(e)}</b></div></div>`).join("")}
            </div>

            <div class="boletaAcciones">
                ${lugar ? `<a class="btnSecundario" href="${urlComoLlegar(lugar)}" target="_blank" rel="noopener"><i class="fa-solid fa-diamond-turn-right"></i> Cómo llegar</a>` : ""}
                <button class="btnSecundario" onclick="verPago('${esc(c.codigo)}')"><i class="fa-solid fa-receipt"></i> ${c.factura ? "Factura" : "Comprobante"}</button>
            </div>

        </div>`;

    abrirPantalla("pantalla-boleta");

    if(!estadoIngreso(c).completa) iniciarQR(c.codigo);

    // no se permiten capturas mientras se ve el QR (solo en la app de Android)
    protegerPantalla(true);

    // si la escanean en la entrada, la boleta se actualiza sola
    if(dejarDeEscucharBoleta) dejarDeEscucharBoleta();

    let ingresosAntes = c.ingresos || 0;

    dejarDeEscucharBoleta = DB.escucharCompra(codigo, nueva => {

        if((nueva.ingresos || 0) === ingresosAntes) return;

        ingresosAntes = nueva.ingresos || 0;

        const i = compras.findIndex(x => x.codigo === codigo);

        if(i >= 0) compras[i] = nueva;

        guardarCache();

        renderBoletas();

        const est = estadoIngreso(nueva);

        if(navigator.vibrate) navigator.vibrate([60, 40, 60]);

        if(est.completa){

            clearInterval(intervaloQR);

            $("boletaQR").innerHTML = htmlQRBoleta(nueva, true);

        }else{

            $("estadoParcial").outerHTML = htmlParcial(est);

            toast(`Ingreso registrado: ${est.usados} de ${est.total}`, "fa-door-open");
        }
    });
}

function htmlParcial(est){

    return est.parcial
        ? `<div class="estadoParcial" id="estadoParcial"><i class="fa-solid fa-person-walking-arrow-right"></i> Ya ingresaron <b>${est.usados} de ${est.total}</b>. El QR sigue activo para los demás.</div>`
        : `<div id="estadoParcial"></div>`;
}

function htmlQRBoleta(c, recien){

    const est = estadoIngreso(c);

    if(est.completa){

        const hora = c.ultimoIngreso ? new Date(c.ultimoIngreso).toLocaleString("es-CO", { weekday:"short", day:"numeric", month:"short", hour:"numeric", minute:"2-digit" }) : "";

        return `
            <div class="qrUsado ${recien ? "recien" : ""}">
                <div class="qrFantasma"><i class="fa-solid fa-qrcode"></i></div>
                <div class="sello">UTILIZADA</div>
            </div>
            <h3 class="usadaTitulo">${recien ? "¡Ingreso registrado! Disfruta el show 🎉" : "Ya ingresaste a este evento"}</h3>
            <p class="usadaTexto">${est.total === 1 ? "Esta boleta" : `Las ${est.total} entradas de esta boleta`} ya ${est.total === 1 ? "fue usada" : "fueron usadas"}${hora ? " · " + esc(hora) : ""}</p>
            <p class="codigoGrande usado">${esc(c.codigo)}</p>`;
    }

    return `
        ${htmlParcial(est)}
        <div class="qr" id="qrBoleta"></div>
        <div class="qrTiempo">
            <div class="qrBarra"><i id="qrBarra"></i></div>
            <small>El código se renueva en <b id="qrSegundos">30</b> s</small>
        </div>
        <p class="codigoGrande">${esc(c.codigo)}</p>
        <small class="ayudaQR"><i class="fa-solid fa-shield-halved"></i> QR dinámico y protegido: no se puede capturar la pantalla</small>`;
}

// FLAG_SECURE de Android (plugin propio "Privacidad"): bloquea capturas y grabaciones
function protegerPantalla(activar){

    const cap = window.Capacitor;

    if(!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;

    const privacidad = cap.Plugins && cap.Plugins.Privacidad;

    if(!privacidad) return;

    (activar ? privacidad.activar() : privacidad.desactivar()).catch(() => {});
}

function dibujarQR(codigo){

    const qr = qrcode(0, "M");

    qr.addData(qrDinamico(codigo));

    qr.make();

    $("qrBoleta").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

function iniciarQR(codigo){

    clearInterval(intervaloQR);

    let ventana = ventanaQR();

    dibujarQR(codigo);

    const tic = () => {

        if(ventanaQR() !== ventana){

            ventana = ventanaQR();

            dibujarQR(codigo);
        }

        const s = segundosQR();

        $("qrSegundos").innerText = s;

        $("qrBarra").style.width = (s / QR_PERIODO * 100) + "%";
    };

    tic();

    intervaloQR = setInterval(tic, 1000);
}

function verPago(codigo){

    const c = compras.find(x => x.codigo === codigo);

    const f = c.factura;

    abrirSheet(`
        <h2>${f ? '<i class="fa-solid fa-file-invoice-dollar"></i> Factura electrónica' : '<i class="fa-solid fa-receipt"></i> Comprobante de compra'}</h2>
        ${f ? `
        <span class="chipFactura"><i class="fa-solid fa-circle-check"></i> Enviada a ${esc(f.adquiriente.correo)}</span>
        <div class="datosFactura">
            <div><small>Número</small><b>${esc(f.numero)}</b></div>
            <div><small>Fecha</small><b>${new Date(f.fecha).toLocaleString("es-CO")}</b></div>
            <div><small>Adquiriente</small><b>${esc(f.adquiriente.nombre)}</b></div>
            <div><small>${esc(f.adquiriente.tipoDoc)}</small><b>${esc(f.adquiriente.documento)}${f.adquiriente.dv !== null ? "-" + f.adquiriente.dv : ""}</b></div>
        </div>
        <p class="cufe"><b>CUFE:</b> ${esc(f.cufe)}</p>` : `<p class="sheetSub">No solicitaste factura electrónica para esta compra.</p>`}
        <div class="desglose">
            <div><span>Boletas</span><span>${fmt(c.subtotal ?? c.total)}</span></div>
            <div><span>Servicio</span><span>${fmt(c.servicio || 0)}</span></div>
            <div><span>IVA del servicio</span><span>${fmt(c.iva || 0)}</span></div>
            <div class="total"><span>Total pagado</span><span>${fmt(c.total)}</span></div>
        </div>
        <p class="nota">Pagado con <b>${esc(c.metodo)}</b> · ${c.fechaCompra ? new Date(c.fechaCompra).toLocaleString("es-CO") : ""}</p>
        ${f ? `<p class="nota"><i class="fa-solid fa-circle-info"></i> Factura simulada (proyecto académico), sin validez fiscal.</p>` : ""}`);
}



/* ========================================
   PERFIL
======================================== */

function renderPerfil(){

    const oscuro = !document.body.classList.contains("claro");

    $("perfilContenido").innerHTML = usuario ? `
        <div class="perfilTarjeta">
            <div class="avatarGrande">${esc(usuario.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase())}</div>
            <h2>${esc(usuario.name)}</h2>
            <p>${esc(usuario.email)}</p>
            ${usuario.role === "admin" ? '<span class="tag">Administrador</span>' : usuario.role === "taquilla" ? '<span class="tag">Taquilla</span>' : ""}
            ${usuario.verificado ? "" : `<button class="chipVerificar" onclick="abrirVerificacion()"><i class="fa-solid fa-envelope"></i> Verifica tu correo</button>`}
        </div>
        ${["admin", "taquilla"].includes(usuario.role) ? `
        <button class="botonTaquilla" onclick="abrirEscaner()">
            <i class="fa-solid fa-qrcode"></i>
            <div><b>Modo taquilla</b><small>Escanea las boletas en la entrada del evento</small></div>
            <i class="fa-solid fa-chevron-right"></i>
        </button>` : ""}
        ${opcionesPerfil(oscuro)}
        <button class="opcion peligro" onclick="salir()"><i class="fa-solid fa-right-from-bracket"></i> Cerrar sesión</button>
    ` : `
        <div class="vacio grande">
            <i class="fa-solid fa-circle-user"></i>
            <h3>Tu cuenta OnTicket</h3>
            <p>La misma cuenta de la web: tus boletas aparecen en ambos lados.</p>
            <button class="btnPrimario" onclick="abrirAuth()">Iniciar sesión o registrarse</button>
        </div>
        ${opcionesPerfil(oscuro)}`;
}

function opcionesPerfil(oscuro){

    return `
        <div class="opciones">
            <div class="opcion temaFila">
                <i class="fa-solid fa-circle-half-stroke"></i> Tema
                <div class="segmentoTema">
                    ${[["auto", "Automático"], ["claro", "Claro"], ["oscuro", "Oscuro"]].map(([v, t]) =>
                        `<button class="${temaElegido() === v ? "active" : ""}" onclick="elegirTema('${v}')">${t}</button>`).join("")}
                </div>
            </div>
            <a class="opcion" href="mailto:soporte@onticket.com"><i class="fa-regular fa-envelope"></i> soporte@onticket.com</a>
            <a class="opcion" href="tel:+573205557788"><i class="fa-solid fa-phone"></i> +57 320 555 7788 · 24/7</a>
            <div class="opcion info"><i class="fa-solid fa-database"></i> ${DB.modo === "firebase" ? "Conectado a la nube (Firebase)" : "Modo local (sin Firebase)"}</div>
        </div>
        <button class="opcion" onclick="buscarActualizacion(true)"><i class="fa-solid fa-rotate"></i> Buscar actualizaciones</button>
        <p class="version">OnTicket App v${esc(VERSION_LOCAL.nombre)} · Vive la mejor experiencia</p>`;
}

async function salir(){

    if(!confirm("¿Cerrar sesión?")) return;

    await DB.logout();

    usuario = null;

    compras = [];

    alCambiarUsuario();
}

/* ----- tema: automático (sigue al celular), claro u oscuro ----- */

const sistemaClaro = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

function temaElegido(){

    return localStorage.getItem("temaApp") || "auto";
}

function aplicarTema(){

    const t = temaElegido();

    const claro = t === "claro" || (t === "auto" && sistemaClaro && sistemaClaro.matches);

    document.body.classList.toggle("claro", claro);

    const meta = document.querySelector('meta[name="theme-color"]');

    if(meta) meta.content = claro ? "#f4f4f7" : "#0e0e12";

    const btn = $("temaBtn");

    if(btn) btn.innerHTML = `<i class="fa-solid ${claro ? "fa-moon" : "fa-sun"}"></i>`;
}

function elegirTema(t){

    localStorage.setItem("temaApp", t);

    aplicarTema();

    renderPerfil();
}

// botón rápido ☀️/🌙 de la barra superior
function cambiarTema(){

    elegirTema(document.body.classList.contains("claro") ? "oscuro" : "claro");
}

if(sistemaClaro && sistemaClaro.addEventListener){

    sistemaClaro.addEventListener("change", () => { if(temaElegido() === "auto") aplicarTema(); });
}



/* ========================================
   INICIO
======================================== */

function alCambiarUsuario(){

    $("avatarBtn").innerHTML = usuario
        ? `<span>${esc(usuario.name[0].toUpperCase())}</span>`
        : '<i class="fa-solid fa-user"></i>';

    $("saludoTxt").innerText = usuario ? `Hola, ${usuario.name.split(" ")[0]} 👋` : "Hola 👋";

    if($("tab-perfil").classList.contains("active")) renderPerfil();

    recalcularEstado();

    if(usuario){

        compras = JSON.parse(localStorage.getItem(claveCache()) || "[]");

        cargarBoletas();

    }else{

        renderBoletas();
    }
}

aplicarTema();

// barra de estado del celular (solo dentro de la app nativa)
(function(){

    const plugins = window.Capacitor && window.Capacitor.Plugins;

    if(plugins && plugins.StatusBar){

        plugins.StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});

        plugins.StatusBar.setBackgroundColor({ color: "#0e0e12" }).catch(() => {});

        plugins.StatusBar.setStyle({ style: "DARK" }).catch(() => {});
    }
})();

renderExplorar();

// eventos creados por el administrador (Firebase)
sincronizarEventos().then(cambio => { if(cambio) renderExplorar(); });

DB.onUsuario(u => {

    usuario = u;

    alCambiarUsuario();
});

setTimeout(() => $("splash").classList.add("fuera"), 900);



/* ========================================
   MODO TAQUILLA (escáner de entrada)
   Solo para usuarios con rol "admin" o "taquilla".
======================================== */

let apagarCamaraApp = null;
let validando = false;
let ingresosTurno = 0;

async function abrirEscaner(){

    sincronizarReloj();

    abrirPantalla("pantalla-escaner");

    $("resultadoEscaner").className = "resultadoEscaner";

    $("contadorTurno").innerText = ingresosTurno;

    try{

        apagarCamaraApp = await iniciarEscaner($("videoEscaner"), leerBoleta);

        $("camaraAviso").classList.remove("show");

    }catch(e){

        $("camaraAviso").classList.add("show");
    }
}

function apagarEscaner(){

    if(apagarCamaraApp){

        apagarCamaraApp();

        apagarCamaraApp = null;
    }
}

function codigoManualApp(){

    const t = $("codigoEscaner").value.trim();

    if(t) leerBoleta(t);
}

function avisoEntrada(ok){

    if(navigator.vibrate) navigator.vibrate(ok ? 80 : [100, 60, 100]);

    try{

        const ctx = new (window.AudioContext || window.webkitAudioContext)();

        const o = ctx.createOscillator(), g = ctx.createGain();

        o.frequency.value = ok ? 1046 : 220;

        g.gain.setValueAtTime(0.2, ctx.currentTime);

        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

        o.connect(g).connect(ctx.destination);

        o.start();

        o.stop(ctx.currentTime + 0.4);

    }catch(e){}
}

async function leerBoleta(texto){

    if(validando) return;

    validando = true;

    const panel = $("resultadoEscaner");

    panel.className = "resultadoEscaner show cargando";

    panel.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Validando...`;

    let r;

    try{

        r = await validarEntrada(texto);

    }catch(e){

        r = { ok:false, motivo: e.message };
    }

    avisoEntrada(r.ok);

    const c = r.compra;

    const detalle = c ? `
        <div class="resDatos">
            <b>${esc(c.evento)}</b>
            <small>${esc(c.usuario || c.email || "")}</small>
            <small>${(c.items || []).map(i => esc(i.etiqueta)).join(" · ")}</small>
        </div>` : "";

    if(r.ok){

        panel.className = "resultadoEscaner show valida";

        panel.innerHTML = `
            <div class="resFila"><span class="resIcono"><i class="fa-solid fa-check"></i></span>
            <div><h3>Boleta válida</h3><p>Ingresaron ${r.usados} de ${r.total} · faltan ${r.restantes}</p></div></div>
            ${r.manual ? `<p class="aviso">Validación manual: verifica el documento de identidad</p>` : ""}
            ${detalle}
            <div class="resAcciones">
                <button class="btnPrimario" onclick="registrarEntradaApp('${esc(r.codigo)}', 1)"><i class="fa-solid fa-person"></i> Entra 1</button>
                ${r.restantes > 1 ? `<button class="btnSecundario" onclick="registrarEntradaApp('${esc(r.codigo)}', ${r.restantes})">Entran ${r.restantes}</button>` : ""}
            </div>`;

    }else{

        panel.className = "resultadoEscaner show rechazada";

        panel.innerHTML = `
            <div class="resFila"><span class="resIcono"><i class="fa-solid fa-xmark"></i></span>
            <div><h3>No puede entrar</h3><p>${esc(r.motivo)}</p></div></div>
            ${detalle}
            <button class="btnSecundario ancho" onclick="siguienteBoleta()">Escanear otra</button>`;
    }

    validando = false;
}

async function registrarEntradaApp(codigo, n){

    try{

        const c = await DB.registrarIngreso(codigo, n);

        ingresosTurno += n;

        $("contadorTurno").innerText = ingresosTurno;

        avisoEntrada(true);

        const panel = $("resultadoEscaner");

        panel.className = "resultadoEscaner show valida";

        panel.innerHTML = `
            <div class="resFila"><span class="resIcono"><i class="fa-solid fa-door-open"></i></span>
            <div><h3>¡Bienvenidos!</h3><p>Ingreso registrado: ${c.ingresos} de ${personasCompra(c)}</p></div></div>`;

        setTimeout(siguienteBoleta, 1800);

    }catch(e){

        toast(esc(e.message), "fa-triangle-exclamation");
    }
}

function siguienteBoleta(){

    $("resultadoEscaner").className = "resultadoEscaner";

    $("codigoEscaner").value = "";
}



/* ========================================
   ACTUALIZACIONES DE LA APP
   La web publica version-app.json con la última versión.
   Si la instalada es más vieja, se ofrece descargar la nueva
   (se instala encima: se conservan sesión y boletas).
======================================== */

const VERSION_LOCAL = typeof APP_VERSION !== "undefined" ? APP_VERSION : { codigo: 0, nombre: "?" };

let ultimaRevision = 0;

async function buscarActualizacion(manual){

    if(!CONFIG.sitioWeb) return;

    ultimaRevision = Date.now();

    try{

        const r = await fetch(`${CONFIG.sitioWeb}version-app.json?t=${Date.now()}`, { cache: "no-store" });

        const remota = await r.json();

        if(remota.codigo > VERSION_LOCAL.codigo){

            // si dijo "Más tarde", no se insiste hasta que vuelva a abrir la app
            if(!manual && sessionStorage.getItem("actualizacionPospuesta") === String(remota.codigo)) return;

            // no interrumpe una compra o una boleta abierta
            if(!manual && capas.length) return;

            mostrarActualizacion(remota);

        }else if(manual){

            toast(`Tienes la última versión (${esc(VERSION_LOCAL.nombre)})`, "fa-circle-check");
        }

    }catch(e){

        if(manual) toast("No se pudo revisar. Revisa tu conexión", "fa-wifi");
    }
}

function mostrarActualizacion(v){

    const url = new URL(v.apk || "descargas/OnTicket.apk", CONFIG.sitioWeb).href;

    abrirSheet(`
        <div class="auth actualizacion">
            <div class="verificaIcono"><i class="fa-solid fa-rocket"></i></div>
            <h2>¡Nueva versión ${esc(v.nombre)}!</h2>
            <p class="sheetSub">Tienes la ${esc(VERSION_LOCAL.nombre)}. Esto es lo nuevo:</p>
            <ul class="novedades">
                ${(v.notas || []).map(n => `<li><i class="fa-solid fa-check"></i> ${esc(n)}</li>`).join("")}
            </ul>
            <button class="btnPrimario ancho" onclick="descargarActualizacion('${esc(url)}')">
                <i class="fa-solid fa-download"></i> Actualizar ahora
            </button>
            <button class="enlace" onclick="sessionStorage.setItem('actualizacionPospuesta', '${Number(v.codigo)}'); atras();">Más tarde</button>
            <p class="nota">
                <i class="fa-solid fa-circle-info"></i>
                Se descarga el instalador: ábrelo y toca <b>Actualizar</b>. Conservas tu sesión y tus boletas.
            </p>
        </div>`);
}

async function descargarActualizacion(url){

    const plugins = window.Capacitor && window.Capacitor.Plugins;

    if(plugins && plugins.Browser){

        // abre el navegador del celular, que descarga el APK
        await plugins.Browser.open({ url });

    }else{

        window.open(url, "_blank");
    }
}

// al abrir la app y cada vez que vuelve a primer plano (máximo una vez por hora)
setTimeout(() => buscarActualizacion(false), 3000);

document.addEventListener("visibilitychange", () => {

    if(document.visibilityState === "visible" && Date.now() - ultimaRevision > 3600000){

        buscarActualizacion(false);
    }
});
