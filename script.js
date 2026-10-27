/* ========================================
   WEB DE ONTICKET
   Requiere: data.js, planos.js, core.js, db.js
======================================== */

const $ = id => document.getElementById(id);

function toast(mensaje, icono = "fa-circle-check"){

    const t = document.createElement("div");

    t.className = "toast";

    t.innerHTML = `<i class="fa-solid ${icono}"></i> ${mensaje}`;

    $("toastZone").appendChild(t);

    setTimeout(() => t.classList.add("out"), 2300);

    setTimeout(() => t.remove(), 2700);
}



/* ========================================
   REFERENCIAS
======================================== */

const landing = $("landing");
const homePage = $("homePage");
const eventoPage = $("eventoPage");
const adminPage = $("adminPage");
const btnLogin = $("btnLogin");
const adminBtn = $("adminBtn");
const svg = $("planoSvg");
const tooltip = $("planoTooltip");



/* ========================================
   VARIABLES
======================================== */

let currentUser = null;
let authMode = "login";
let pendienteCheckout = false;
let comprasUsuario = [];

let eventoActual = null;
let planoActual = null;
let estadoVenta = null;
let ventasActual = {};
let reservasActual = { holds: {} };
let dejarDeEscuchar = null;
let dejarDeEscucharReservas = null;
let reservaExpira = null;
let intervaloReserva = null;
let pisoActual = 0;
let zonasActivas = new Set();
let precioMaximo = Infinity;
let zoom = { s:1, x:0, y:0 };

let carrito = [];
let pasoActual = 1;
let metodoPago = "";
let pagando = false;

let ciudadActiva = "Todas";
let categoriaActiva = "Todas";

let slideActual = 0;
let intervaloSlides;

let intervaloQR;
let compraEnPantalla = null;



/* ========================================
   NAVEGACIÓN
======================================== */

function mostrarPagina(pagina){

    document.body.classList.remove("landingMode");

    landing.style.display = "none";

    [homePage, eventoPage, adminPage].forEach(p => p.style.display = "none");

    pagina.style.display = "block";

    $("navInicio").classList.toggle("activeNav", pagina === homePage);

    renderCartBar();

    window.scrollTo(0, 0);
}

function mostrarHome(){

    mostrarPagina(homePage);

    iniciarCarrusel();
}

function volverHome(){

    mostrarHome();
}

function irASeccion(id){

    if(homePage.style.display !== "block"){

        mostrarHome();
    }

    setTimeout(() => $(id).scrollIntoView({ behavior:"smooth" }), 50);
}



/* ========================================
   BANNER INTERACTIVO (CARRUSEL)
======================================== */

function renderCarrusel(){

    const destacados = eventosPublicos().filter(e => e.destacado);

    $("heroSlides").innerHTML = destacados.map((ev, i) => {

        const lugar = lugarDe(ev);

        return `
        <div class="slide ${i === 0 ? "active" : ""}">

            <div class="slideBg" style="background-image:url('${ev.imagen}')"></div>

            <div class="slideShade"></div>

            <div class="slideContent">

                <div class="slideText">

                    <span class="slideTag">
                        <i class="fa-solid fa-location-dot"></i> ${lugar.ciudad} · ${ev.categoria}
                    </span>

                    <h2>${ev.artista}</h2>

                    <h3>${ev.titulo}</h3>

                    <div class="slideMeta">
                        <span><i class="fa-regular fa-calendar"></i> ${ev.fecha}</span>
                        <span><i class="fa-regular fa-clock"></i> ${ev.hora}</span>
                        <span><i class="fa-solid fa-building"></i> ${lugar.nombre}</span>
                        <span class="faltan"><i class="fa-solid fa-hourglass-half"></i> ${faltanTexto(ev)}</span>
                    </div>

                    <div class="slideActions">

                        <button class="primaryBtn big" onclick="abrirEvento('${ev.id}')">
                            <i class="fa-solid fa-ticket"></i> Vivir esta experiencia
                        </button>

                        <span class="slidePrice">Desde <b>${fmt(precioDesde(ev))}</b></span>

                    </div>

                </div>

                <div class="slidePoster" onclick="abrirEvento('${ev.id}')">
                    <img src="${ev.imagen}" alt="${ev.artista}">
                </div>

            </div>

        </div>`;

    }).join("");

    $("heroDots").innerHTML = destacados.map((ev, i) => `
        <button class="dot ${i === 0 ? "active" : ""}" onclick="irASlide(${i})" aria-label="${ev.artista}">
            <span></span>
        </button>`).join("");


    const carrusel = $("heroCarousel");

    carrusel.onmouseenter = () => carrusel.classList.add("paused");

    carrusel.onmouseleave = () => {

        carrusel.classList.remove("paused");

        const poster = carrusel.querySelector(".slide.active .slidePoster");

        if(poster) poster.style.transform = "";
    };

    // efecto 3D del afiche siguiendo el mouse
    carrusel.onmousemove = e => {

        const r = carrusel.getBoundingClientRect();

        const dx = (e.clientX - r.left) / r.width - 0.5;

        const dy = (e.clientY - r.top) / r.height - 0.5;

        const poster = carrusel.querySelector(".slide.active .slidePoster");

        if(poster){

            poster.style.transform = `perspective(900px) rotateY(${dx * 14}deg) rotateX(${-dy * 10}deg) translateZ(10px)`;
        }
    };

    // deslizar con el dedo
    let inicioX = null;

    carrusel.ontouchstart = e => inicioX = e.touches[0].clientX;

    carrusel.ontouchend = e => {

        if(inicioX === null) return;

        const dx = e.changedTouches[0].clientX - inicioX;

        if(Math.abs(dx) > 50) moverSlide(dx < 0 ? 1 : -1);

        inicioX = null;
    };
}

function irASlide(i){

    const slides = document.querySelectorAll(".slide");

    const dots = document.querySelectorAll(".heroDots .dot");

    if(!slides.length) return;

    slideActual = (i + slides.length) % slides.length;

    slides.forEach((s, k) => s.classList.toggle("active", k === slideActual));

    dots.forEach((d, k) => {

        d.classList.remove("active");

        if(k === slideActual){

            void d.offsetWidth; // reinicia la animación de la barra

            d.classList.add("active");
        }
    });

    iniciarCarrusel();
}

function moverSlide(dir){

    irASlide(slideActual + dir);
}

function iniciarCarrusel(){

    clearInterval(intervaloSlides);

    intervaloSlides = setInterval(() => {

        if(homePage.style.display !== "block") return;

        if($("heroCarousel").classList.contains("paused")) return;

        moverSlide(1);

    }, 6000);
}



/* ========================================
   FILTROS: CIUDAD, CATEGORÍA, BÚSQUEDA
======================================== */

const CATEGORIAS = [
    ["Todas", "fa-border-all"],
    ["Conciertos", "fa-music"],
    ["Festivales", "fa-microphone"],
    ["Humor", "fa-face-laugh"],
    ["Deportes", "fa-futbol"]
];

function renderFiltros(){

    const ciudades = ["Todas", ...new Set(eventosPublicos().map(e => lugarDe(e).ciudad))];

    $("cityChips").innerHTML = ciudades.map(c => {

        const n = c === "Todas" ? eventosPublicos().length : eventosPublicos().filter(e => lugarDe(e).ciudad === c).length;

        return `
        <button class="chip ${c === ciudadActiva ? "active" : ""}" onclick="filtrarCiudad('${c}')">
            ${c} <small>${n}</small>
        </button>`;

    }).join("");

    $("categoryChips").innerHTML = CATEGORIAS.map(([c, icono]) => `
        <button class="chip ${c === categoriaActiva ? "active" : ""}" onclick="filtrarCategoria('${c}')">
            <i class="fa-solid ${icono}"></i> ${c}
        </button>`).join("");
}

function filtrarCiudad(ciudad){

    ciudadActiva = ciudad;

    aplicarFiltros();
}

function filtrarCategoria(categoria){

    categoriaActiva = categoria;

    aplicarFiltros();
}

function aplicarFiltros(){

    renderFiltros();

    const texto = $("searchInput").value.toLowerCase().trim();

    const lista = eventosPublicos().filter(ev => {

        const lugar = lugarDe(ev);

        const coincideCiudad = ciudadActiva === "Todas" || lugar.ciudad === ciudadActiva;

        const coincideCategoria = categoriaActiva === "Todas" || ev.categoria === categoriaActiva;

        const contenido = `${ev.artista} ${ev.titulo} ${lugar.nombre} ${lugar.ciudad}`.toLowerCase();

        return coincideCiudad && coincideCategoria && contenido.includes(texto);
    });

    $("eventosTitulo").innerText =
        ciudadActiva === "Todas" ? "Todos los eventos" : `Eventos en ${ciudadActiva}`;

    $("resultCount").innerText = `${lista.length} evento${lista.length === 1 ? "" : "s"}`;

    renderEventos(lista);
}

// compatibilidad con la versión anterior
function buscarEventos(){

    aplicarFiltros();
}

function renderEventos(lista){

    if(!lista.length){

        $("eventsGrid").innerHTML = `
        <div class="emptyState">
            <i class="fa-regular fa-calendar-xmark"></i>
            <p>No hay eventos con estos filtros.</p>
            <button class="ghostBtn" onclick="ciudadActiva='Todas'; categoriaActiva='Todas'; $('searchInput').value=''; aplicarFiltros();">
                Ver todos los eventos
            </button>
        </div>`;

        return;
    }

    $("eventsGrid").innerHTML = lista.map(ev => {

        const lugar = lugarDe(ev);

        return `
        <article class="eventCard" onclick="abrirEvento('${ev.id}')">

            <div class="eventImg">

                <img src="${ev.imagen}" alt="${ev.artista}">

                ${ev.dia ? `<span class="eventFecha"><b>${ev.dia}</b>${ev.mes}</span>` : ""}

                <span class="eventCat">${ev.categoria}</span>

                <span class="eventCity"><i class="fa-solid fa-location-dot"></i> ${lugar.ciudad}</span>

            </div>

            <div class="eventCardInfo">

                <span class="eventDate">${ev.fecha} · ${ev.hora}</span>

                <span class="faltanTag">${faltanTexto(ev)}</span>

                <h3>${ev.artista}</h3>

                <p>${ev.titulo}</p>

                <p class="eventPlace"><i class="fa-solid fa-building"></i> ${lugar.nombre}</p>

                <div class="eventCardFoot">

                    <span>Desde <b>${fmt(precioDesde(ev))}</b></span>

                    <span class="miniBtn">Boletas <i class="fa-solid fa-arrow-right"></i></span>

                </div>

            </div>

        </article>`;

    }).join("");
}



/* ========================================
   PÁGINA DEL EVENTO
======================================== */

function abrirEvento(id){

    const evento = getEvento(id);

    if(!evento) return;

    if(eventoActual && eventoActual.id !== id && carrito.length){

        if(!confirm("Tienes boletas seleccionadas de otro evento. ¿Deseas descartarlas?")) return;

        carrito = [];
    }

    eventoActual = evento;

    planoActual = planoDe(evento);

    ventasActual = {};

    reservasActual = { holds: {} };

    recalcularEstado();

    pisoActual = 0;

    zonasActivas = new Set();

    zoom = { s:1, x:0, y:0 };

    renderEventoHero();

    prepararFiltrosPlano();

    // sillas vendidas y apartadas en tiempo real
    if(dejarDeEscuchar) dejarDeEscuchar();

    if(dejarDeEscucharReservas) dejarDeEscucharReservas();

    dejarDeEscucharReservas = DB.escucharReservas(evento.id, reservas => {

        reservasActual = reservas;

        recalcularEstado();

        renderSidebar();

        renderPlano();
    });

    dejarDeEscuchar = DB.escucharVentas(evento.id, ventas => {

        ventasActual = ventas;

        recalcularEstado();

        // si alguien compró algo que estaba en mi carrito, se quita
        const antes = carrito.length;

        carrito = carrito.filter(i => !i.ids.some(id => estadoVenta.idGuardado(id)));

        if(carrito.length < antes && !pagando){

            toast("Una de tus ubicaciones acaba de ser vendida", "fa-triangle-exclamation");

            renderCartBar();
        }

        renderSidebar();

        renderPlano();
    });

    mostrarPagina(eventoPage);
}

function recalcularEstado(){

    if(!eventoActual) return;

    estadoVenta = crearEstadoVenta(eventoActual, ventasActual, reservasActual, currentUser && currentUser.uid);
}

function renderEventoHero(){

    const ev = eventoActual;

    const lugar = lugarDe(ev);

    $("eventHero").innerHTML = `

        <div class="eventHeroBg" style="background-image:url('${ev.imagen}')"></div>

        <div class="eventHeroInner">

            <img src="${ev.imagen}" class="eventPoster" alt="${ev.artista}">

            <div class="eventHeroText">

                <button class="backLink" onclick="volverHome()">
                    <i class="fa-solid fa-arrow-left"></i> Todos los eventos
                </button>

                <span class="slideTag">${ev.categoria}</span>

                <h1>${ev.artista}</h1>

                <h3>${ev.titulo}</h3>

                <p>${ev.descripcion}</p>

                <div class="slideMeta">
                    <span><i class="fa-regular fa-calendar"></i> ${ev.fecha}</span>
                    <span><i class="fa-regular fa-clock"></i> ${ev.hora}</span>
                    <span><i class="fa-solid fa-location-dot"></i> ${lugar.nombre}, ${lugar.ciudad}</span>
                </div>

                <div class="slideActions">

                    <button class="primaryBtn big" onclick="$('planoSection').scrollIntoView({behavior:'smooth'})">
                        <i class="fa-solid fa-chair"></i> Elegir ubicación
                    </button>

                    <a class="ghostBtn light" href="${urlComoLlegar(lugar)}" target="_blank" rel="noopener">
                        <i class="fa-solid fa-diamond-turn-right"></i> Cómo llegar
                    </a>

                    <span class="slidePrice">Desde <b>${fmt(precioDesde(ev))}</b></span>

                </div>

            </div>

        </div>`;


    // ----- mapa -----
    $("mapaEvento").innerHTML = `

        <div class="mapFrame">
            <iframe
                src="${urlMapaEmbed(lugar)}"
                loading="lazy"
                referrerpolicy="no-referrer-when-downgrade"
                title="Mapa de ${lugar.nombre}"
            ></iframe>
        </div>

        <div class="mapInfo">
            <b>${lugar.nombre}</b>
            <span>${lugar.direccion}</span>
            <span>${lugar.ciudad}, ${lugar.departamento}</span>
        </div>

        <div class="mapBtns">

            <a class="ghostBtn" href="${urlComoLlegar(lugar)}" target="_blank" rel="noopener">
                <i class="fa-brands fa-google"></i> Cómo llegar
            </a>

            <a class="ghostBtn" href="${urlWaze(lugar)}" target="_blank" rel="noopener">
                <i class="fa-brands fa-waze"></i> Waze
            </a>

        </div>`;


    // ----- video -----
    const video = $("eventVideo");

    if(ev.video){

        $("videoCard").style.display = "block";

        video.src = ev.video;

    }else{

        $("videoCard").style.display = "none";

        video.removeAttribute("src");
    }
}

function renderSidebar(){

    const ev = eventoActual;

    $("zonasLista").innerHTML = Object.entries(planoActual.zonas).map(([id, z]) => {

        const disp = estadoVenta.disponiblesZona(id);

        let precioTxt = fmt(precioZona(ev, id));

        let detalle = TIPO_ZONA[z.tipo];

        if(z.tipo === "palco"){

            precioTxt = `${fmt(precioZona(ev, id))} <small>palco</small>`;

            detalle = `Puesto individual ${fmt(precioPersona(ev, id))}`;
        }

        return `
        <div class="zonaItem" onclick="enfocarZona('${id}')">

            <i class="zonaColor" style="background:${z.color}"></i>

            <div class="zonaInfo">
                <b>${z.nombre}</b>
                <small>${detalle}</small>
            </div>

            <div class="zonaPrecio">
                <b>${precioTxt}</b>
                <small class="${disp ? "" : "agotado"}">${disp ? disp + " disp." : "Agotado"}</small>
            </div>

        </div>`;

    }).join("");

    $("feeNote").innerHTML = `
        <i class="fa-solid fa-circle-info"></i>
        Al valor de la boleta se suma el <b>cargo por servicio (${CONFIG.feeServicio * 100}%)</b>
        y el <b>IVA (${CONFIG.ivaServicio * 100}%) sobre el servicio</b>. Verás el desglose completo antes de pagar.`;
}



/* ========================================
   FILTROS DEL PLANO
======================================== */

function prepararFiltrosPlano(){

    const precios = Object.keys(planoActual.zonas).map(z => precioPersona(eventoActual, z));

    const min = Math.min(...precios);

    const max = Math.max(...precios);

    const rango = $("precioMax");

    rango.min = min;

    rango.max = max;

    rango.step = 5000;

    rango.value = max;

    precioMaximo = max;

    $("precioMaxTxt").innerText = fmt(max);

    $("soloDisponibles").checked = false;

    $("soloIndividuales").checked = false;

    const tienePalcos = planoActual.pisos.some(p => p.palcos.length);

    $("switchIndividuales").style.display = tienePalcos ? "" : "none";

    document.querySelectorAll(".lgPalcoItem").forEach(el => el.style.display = tienePalcos ? "" : "none");

    renderPisoTabs();

    renderZonaChips();
}

function renderPisoTabs(){

    if(planoActual.pisos.length < 2){

        $("pisoTabs").innerHTML = "";

        return;
    }

    $("pisoTabs").innerHTML = planoActual.pisos.map((p, i) => `
        <button class="pisoTab ${i === pisoActual ? "active" : ""}" onclick="cambiarPiso(${i})">
            ${p.nombre}
        </button>`).join("");
}

function renderZonaChips(){

    const chips = Object.entries(planoActual.zonas).map(([id, z]) => `
        <button class="chip zonaChip ${zonasActivas.has(id) ? "active" : ""}" onclick="toggleZona('${id}')" style="--zc:${z.color}">
            <i class="dotColor"></i> ${z.nombre}
        </button>`).join("");

    $("zonaChips").innerHTML = `
        <button class="chip ${zonasActivas.size === 0 ? "active" : ""}" onclick="toggleZona(null)">
            Todas las localidades
        </button>` + chips;
}

function toggleZona(id){

    if(id === null){

        zonasActivas.clear();

    }else if(zonasActivas.has(id)){

        zonasActivas.delete(id);

    }else{

        zonasActivas.add(id);

        irAPisoDeZona(id);
    }

    renderZonaChips();

    renderPlano();
}

function enfocarZona(id){

    zonasActivas = new Set([id]);

    irAPisoDeZona(id);

    renderZonaChips();

    renderPlano();

    $("planoSection").scrollIntoView({ behavior:"smooth" });
}

function irAPisoDeZona(id){

    const i = pisoDeZona(planoActual, id);

    if(i >= 0 && i !== pisoActual) cambiarPiso(i);
}

function cambiarPiso(i){

    pisoActual = i;

    zoom = { s:1, x:0, y:0 };

    renderPisoTabs();

    renderPlano();
}

function cambiarPrecioMax(){

    precioMaximo = Number($("precioMax").value);

    $("precioMaxTxt").innerText = fmt(precioMaximo);

    renderPlano();
}



/* ========================================
   DIBUJAR EL PLANO
======================================== */

function renderPlano(){

    if(!planoActual) return;

    const piso = planoActual.pisos[pisoActual];

    svg.setAttribute("viewBox", `0 0 ${piso.w} ${piso.h}`);

    svg.innerHTML = planoSVG(eventoActual, pisoActual, estadoVenta, carrito, {
        zonas: zonasActivas,
        precioMax: precioMaximo,
        soloDisp: $("soloDisponibles").checked,
        soloInd: $("soloIndividuales").checked
    });

    aplicarZoom();
}



/* ========================================
   INTERACCIÓN CON EL PLANO
======================================== */

let arrastre = null;
let seArrastro = false;

svg.addEventListener("click", e => {

    if(seArrastro){

        seArrastro = false;

        return;
    }

    const g = e.target.closest("[data-kind]");

    if(!g || g.classList.contains("dim")) return;

    const kind = g.dataset.kind;

    if(kind === "zona"){

        enfocarZona(g.dataset.zona);

        return;
    }

    const el = buscarElementoPlano(planoActual, kind, g.dataset.id);

    if(kind === "seat") clickAsiento(el);

    if(kind === "palco") abrirPalco(el);

    if(kind === "ga") abrirGeneral(el);
});

svg.addEventListener("mousemove", e => {

    const g = e.target.closest("[data-tip]");

    if(!g || g.classList.contains("dim") || arrastre){

        tooltip.classList.remove("show");

        return;
    }

    const r = $("planoWrap").getBoundingClientRect();

    tooltip.innerHTML = g.dataset.tip;

    tooltip.classList.add("show");

    let x = e.clientX - r.left + 14;

    let y = e.clientY - r.top + 14;

    if(x + tooltip.offsetWidth > r.width) x -= tooltip.offsetWidth + 28;

    if(y + tooltip.offsetHeight > r.height) y -= tooltip.offsetHeight + 28;

    tooltip.style.left = x + "px";

    tooltip.style.top = y + "px";
});

svg.addEventListener("mouseleave", () => tooltip.classList.remove("show"));



/* ----- zoom y desplazamiento ----- */

function puntoSvg(e){

    const pt = svg.createSVGPoint();

    pt.x = e.clientX;

    pt.y = e.clientY;

    return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function aplicarZoom(){

    const piso = planoActual.pisos[pisoActual];

    if(zoom.s <= 1){

        zoom = { s:1, x:0, y:0 };

    }else{

        zoom.x = clamp(zoom.x, piso.w - piso.w * zoom.s, 0);

        zoom.y = clamp(zoom.y, piso.h - piso.h * zoom.s, 0);
    }

    const g = $("planoG");

    if(g) g.setAttribute("transform", `translate(${zoom.x} ${zoom.y}) scale(${zoom.s})`);

    svg.classList.toggle("zoomed", zoom.s > 1);
}

function zoomPlano(factor, cx, cy){

    const piso = planoActual.pisos[pisoActual];

    if(cx === undefined){

        cx = piso.w / 2;

        cy = piso.h / 2;
    }

    const nuevo = clamp(zoom.s * factor, 1, 5);

    const k = nuevo / zoom.s;

    zoom.x = cx - (cx - zoom.x) * k;

    zoom.y = cy - (cy - zoom.y) * k;

    zoom.s = nuevo;

    aplicarZoom();
}

function resetZoom(){

    zoom = { s:1, x:0, y:0 };

    aplicarZoom();
}

svg.addEventListener("wheel", e => {

    if(!e.ctrlKey && zoom.s <= 1) return;

    e.preventDefault();

    const p = puntoSvg(e);

    zoomPlano(e.deltaY < 0 ? 1.15 : 0.87, p.x, p.y);

}, { passive:false });

svg.addEventListener("pointerdown", e => {

    if(zoom.s <= 1) return;

    const p = puntoSvg(e);

    arrastre = { x:p.x, y:p.y, zx:zoom.x, zy:zoom.y };

    seArrastro = false;
});

window.addEventListener("pointermove", e => {

    if(!arrastre) return;

    const p = puntoSvg(e);

    const dx = p.x - arrastre.x;

    const dy = p.y - arrastre.y;

    if(Math.abs(dx) + Math.abs(dy) > 4) seArrastro = true;

    if(seArrastro){

        zoom.x = arrastre.zx + dx;

        zoom.y = arrastre.zy + dy;

        aplicarZoom();
    }
});

window.addEventListener("pointerup", () => arrastre = null);



/* ========================================
   ASIENTOS
======================================== */

function clickAsiento(a){

    if(estadoVenta.reservado(a.id)){

        toast("Alguien está comprando esta silla. Intenta en unos minutos", "fa-hourglass-half");

        return;
    }

    if(estadoVenta.asientoVendido(a)){

        toast("Esta silla ya fue vendida", "fa-circle-xmark");

        return;
    }

    if(carrito.find(i => i.key === a.id)){

        quitarDelCarrito(a.id);

        return;
    }

    agregarAlCarrito(itemAsiento(eventoActual, a));
}



/* ========================================
   POPUP PALCOS
======================================== */

let palcoAbierto = null;

function abrirPalco(p){

    palcoAbierto = p;

    renderPalcoModal();

    abrirModal("palcoModal");
}

function renderPalcoModal(){

    const p = palcoAbierto;

    const z = planoActual.zonas[p.zona];

    const vendido = estadoVenta.palcoVendido(p);

    const total = precioZona(eventoActual, p.zona);

    let html = `
    <div class="palcoHead" style="--c:${z.color}">
        <span class="palcoTipo ${p.individual ? "ind" : ""}">
            ${p.individual ? '<i class="fa-solid fa-user"></i> Palco individual · venta por puesto' : '<i class="fa-solid fa-users"></i> Palco completo · 10 personas'}
        </span>
        <h2>${z.nombre} · Palco ${p.num}</h2>
        <p>${eventoActual.artista} · ${lugarDe(eventoActual).nombre}</p>
    </div>`;

    if(p.individual){

        const puestos = estadoVenta.puestosPalco(p);

        const precio = precioPersona(eventoActual, p.zona);

        const mios = carrito.filter(i => i.palco === p.id);

        html += `
        <p class="modalSub">Toca las sillas que quieres. Compartes el palco con otros asistentes.</p>

        <div class="mesa">
            <div class="mesaCentro" style="--c:${z.color}">Palco<br><b>${p.num}</b></div>
            ${puestos.map((x, i) => {

                const ang = (i / puestos.length) * Math.PI * 2 - Math.PI / 2;

                const sel = mios.some(m => m.key === x.id);

                return `<button class="silla ${x.vendido ? "sold" : ""} ${sel ? "sel" : ""}"
                    style="left:calc(50% + ${Math.cos(ang) * 112}px); top:calc(50% + ${Math.sin(ang) * 112}px)"
                    ${x.vendido ? "disabled" : ""}
                    onclick="togglePuesto(${x.n})">${x.n}</button>`;

            }).join("")}
        </div>

        <div class="palcoResumen">
            <div><small>Precio por puesto</small><b>${fmt(precio)}</b></div>
            <div><small>Seleccionados</small><b>${mios.length}</b></div>
            <div><small>Subtotal</small><b>${fmt(precio * mios.length)}</b></div>
        </div>

        <button class="primaryBtn" onclick="cerrarModal('palcoModal')">
            <i class="fa-solid fa-check"></i> Listo
        </button>`;

    }else{

        const enCarro = carrito.find(i => i.key === p.id);

        html += `
        <div class="mesa">
            <div class="mesaCentro" style="--c:${z.color}">Palco<br><b>${p.num}</b></div>
            ${Array.from({ length:10 }, (_, i) => {

                const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;

                return `<span class="silla fija ${vendido ? "sold" : ""} ${enCarro ? "sel" : ""}"
                    style="left:calc(50% + ${Math.cos(ang) * 112}px); top:calc(50% + ${Math.sin(ang) * 112}px)">
                    <i class="fa-solid fa-user"></i></span>`;

            }).join("")}
        </div>

        <div class="palcoResumen">
            <div><small>Valor del palco</small><b>${fmt(total)}</b></div>
            <div><small>Por persona</small><b>${fmt(total / 10)}</b></div>
            <div><small>Capacidad</small><b>10</b></div>
        </div>

        ${vendido
            ? `<button class="primaryBtn" disabled>Este palco ya fue vendido</button>`
            : enCarro
                ? `<button class="ghostBtn danger" onclick="quitarDelCarrito('${p.id}'); renderPalcoModal();"><i class="fa-regular fa-trash-can"></i> Quitar de mi compra</button>`
                : `<button class="primaryBtn" onclick="agregarPalcoCompleto()"><i class="fa-solid fa-cart-plus"></i> Agregar palco completo · ${fmt(total)}</button>`}`;
    }

    $("palcoContenido").innerHTML = html;
}

function togglePuesto(n){

    const p = palcoAbierto;

    const puesto = estadoVenta.puestosPalco(p).find(x => x.n === n);

    if(carrito.find(i => i.key === puesto.id)){

        quitarDelCarrito(puesto.id);

    }else{

        agregarAlCarrito(itemPuesto(eventoActual, p, puesto));
    }

    renderPalcoModal();
}

function agregarPalcoCompleto(){

    agregarAlCarrito(itemPalco(eventoActual, palcoAbierto));

    cerrarModal("palcoModal");
}



/* ========================================
   POPUP ZONA GENERAL
======================================== */

let generalAbierta = null;
let cantidadGeneral = 1;

function abrirGeneral(g){

    generalAbierta = g;

    const enCarro = carrito.find(i => i.key === g.id);

    cantidadGeneral = enCarro ? enCarro.cantidad : 1;

    renderGeneralModal();

    abrirModal("generalModal");
}

function renderGeneralModal(){

    const g = generalAbierta;

    const z = planoActual.zonas[g.zona];

    const disp = estadoVenta.generalDisponible(g);

    const precio = precioZona(eventoActual, g.zona);

    const max = Math.min(CONFIG.maxGeneral, disp);

    const enCarro = carrito.find(i => i.key === g.id);

    $("generalContenido").innerHTML = `
    <div class="palcoHead" style="--c:${z.color}">
        <span class="palcoTipo"><i class="fa-solid fa-people-group"></i> Sin silla asignada</span>
        <h2>${z.nombre}${g.texto.length === 1 ? " · Zona " + g.texto : ""}</h2>
        <p>${disp} boletas disponibles</p>
    </div>

    ${disp ? `
    <div class="stepperQty">
        <button onclick="cambiarCantidad(-1)" ${cantidadGeneral <= 1 ? "disabled" : ""}><i class="fa-solid fa-minus"></i></button>
        <span>${cantidadGeneral}</span>
        <button onclick="cambiarCantidad(1)" ${cantidadGeneral >= max ? "disabled" : ""}><i class="fa-solid fa-plus"></i></button>
    </div>

    <div class="palcoResumen">
        <div><small>Precio</small><b>${fmt(precio)}</b></div>
        <div><small>Cantidad</small><b>${cantidadGeneral}</b></div>
        <div><small>Subtotal</small><b>${fmt(precio * cantidadGeneral)}</b></div>
    </div>

    <button class="primaryBtn" onclick="agregarGeneral()">
        <i class="fa-solid fa-cart-plus"></i> ${enCarro ? "Actualizar cantidad" : "Agregar a mi compra"}
    </button>

    ${enCarro ? `<button class="ghostBtn danger full" onclick="quitarDelCarrito('${g.id}'); cerrarModal('generalModal');">Quitar</button>` : ""}
    ` : `<button class="primaryBtn" disabled>Agotado</button>`}`;
}

function cambiarCantidad(d){

    cantidadGeneral = clamp(cantidadGeneral + d, 1, Math.min(CONFIG.maxGeneral, estadoVenta.generalDisponible(generalAbierta)));

    renderGeneralModal();
}

function agregarGeneral(){

    carrito = carrito.filter(i => i.key !== generalAbierta.id);

    agregarAlCarrito(itemGeneral(eventoActual, generalAbierta, cantidadGeneral));

    cerrarModal("generalModal");
}



/* ========================================
   CARRITO
======================================== */

function agregarAlCarrito(item){

    carrito.push(item);

    toast(`Agregado: ${item.etiqueta}`, "fa-cart-plus");

    actualizarTrasCambio(true);
}

function quitarDelCarrito(key){

    carrito = carrito.filter(i => i.key !== key);

    actualizarTrasCambio(false);
}

function vaciarCarrito(){

    if(!confirm("¿Vaciar tu selección?")) return;

    carrito = [];

    actualizarTrasCambio(false);
}

function actualizarTrasCambio(animar){

    actualizarReserva();

    renderPlano();

    renderCartBar(animar);

    if($("checkoutModal").classList.contains("open")){

        if(!carrito.length){

            cerrarModal("checkoutModal");

        }else{

            renderCheckout();
        }
    }
}

function renderCartBar(animar){

    const bar = $("cartBar");

    const visible = carrito.length > 0 && eventoPage.style.display === "block";

    bar.classList.toggle("show", visible);

    document.body.classList.toggle("conCarrito", visible);

    if(!carrito.length) return;

    const c = calcularCostos(carrito);

    $("cartCount").innerText = c.personas;

    const nombres = carrito.map(i => i.corto);

    $("cartItemsTxt").innerText =
        nombres.slice(0, 3).join(" · ") + (nombres.length > 3 ? ` +${nombres.length - 3} más` : "");

    $("cartTotal").innerText = fmt(c.total);

    if(animar){

        bar.classList.remove("bump");

        void bar.offsetWidth;

        bar.classList.add("bump");
    }
}



/* ========================================
   RESERVA TEMPORAL (sillas apartadas mientras se paga)
======================================== */

function iniciarContadorReserva(){

    clearInterval(intervaloReserva);

    const tic = () => {

        if(!reservaExpira) return;

        const s = Math.max(0, Math.round((reservaExpira - Date.now()) / 1000));

        const txt = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

        document.querySelectorAll(".reservaTiempo").forEach(el => el.innerText = txt);

        document.querySelectorAll(".reservaTimer").forEach(el => {

            el.classList.add("show");

            el.classList.toggle("urgente", s <= 60);
        });

        if(s <= 0) reservaVencida();
    };

    tic();

    intervaloReserva = setInterval(tic, 1000);
}

function detenerReserva(){

    clearInterval(intervaloReserva);

    reservaExpira = null;

    document.querySelectorAll(".reservaTimer").forEach(el => el.classList.remove("show"));
}

function reservaVencida(){

    detenerReserva();

    cerrarModal("checkoutModal");

    toast(`Tu reserva de ${CONFIG.minutosReserva} minutos venció. Vuelve a dar Comprar para apartarlas de nuevo.`, "fa-hourglass-end");
}

// si el carrito cambia mientras hay una reserva, se actualiza lo apartado
function actualizarReserva(){

    if(!reservaExpira || !eventoActual) return;

    if(!carrito.length){

        DB.liberar(eventoActual.id);

        detenerReserva();

        return;
    }

    const minutos = (reservaExpira - Date.now()) / 60000;

    DB.reservar(eventoActual.id, carrito, minutos).catch(() => {});
}



/* ========================================
   CHECKOUT
======================================== */

async function abrirCheckout(){

    if(!carrito.length){

        toast("Selecciona al menos una ubicación", "fa-circle-info");

        return;
    }

    if(!currentUser){

        pendienteCheckout = true;

        $("authMsg").innerText = "Inicia sesión para continuar con tu compra.";

        abrirLogin();

        return;
    }

    // correo real: para comprar, la cuenta debe estar verificada
    if(!currentUser.verificado){

        pendienteCheckout = true;

        abrirVerificacion();

        return;
    }

    // se apartan las ubicaciones mientras paga
    try{

        reservaExpira = await DB.reservar(eventoActual.id, carrito, CONFIG.minutosReserva);

        iniciarContadorReserva();

    }catch(e){

        toast(esc(e.message), "fa-triangle-exclamation");

        return;
    }

    pasoActual = 1;

    metodoPago = "";

    $("aceptaTerminos").checked = false;

    $("metodoSeleccionado").innerText = "Ningún método seleccionado";

    renderMetodos();

    renderCheckout();

    abrirModal("checkoutModal");
}

// compatibilidad con la versión anterior
function abrirPago(){

    abrirCheckout();
}

function renderCheckout(){

    const ev = eventoActual;

    const lugar = lugarDe(ev);

    document.querySelectorAll(".step").forEach(s => {

        const n = Number(s.dataset.step);

        s.classList.toggle("active", n === pasoActual);

        s.classList.toggle("done", n < pasoActual);
    });

    [1, 2, 3].forEach(n => $("paso" + n).style.display = n === pasoActual ? "block" : "none");

    $("checkoutEvento").innerHTML = `
        <img src="${ev.imagen}" alt="">
        <div>
            <b>${ev.artista} · ${ev.titulo}</b>
            <span><i class="fa-regular fa-calendar"></i> ${ev.fecha} · ${ev.hora}</span>
            <span><i class="fa-solid fa-location-dot"></i> ${lugar.nombre}, ${lugar.ciudad}</span>
        </div>`;

    $("checkoutItems").innerHTML = carrito.map(i => `
        <div class="checkoutItem">
            <i class="zonaColor" style="background:${planoActual.zonas[i.zona].color}"></i>
            <div>
                <b>${i.etiqueta}</b>
                <small>${tipoItemTexto(i)}</small>
            </div>
            <span>${fmt(i.precio * i.cantidad)}</span>
            <button onclick="quitarDelCarrito('${i.key}')" title="Quitar"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join("");

    renderDesglose();

    $("btnAtras").style.visibility = pasoActual === 1 ? "hidden" : "visible";

    const c = calcularCostos(carrito);

    $("btnSiguiente").disabled = pagando;

    $("btnSiguiente").innerHTML =
        pagando ? '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...'
        : pasoActual === 1 ? 'Continuar <i class="fa-solid fa-arrow-right"></i>'
        : pasoActual === 2 ? 'Ir a pagar <i class="fa-solid fa-arrow-right"></i>'
        : `<i class="fa-solid fa-lock"></i> Pagar ${fmt(c.total)}`;
}

function renderDesglose(){

    const c = calcularCostos(carrito);

    $("breakdown").innerHTML = `
        <div class="bRow"><span>Valor boletas (${c.personas} ${c.personas === 1 ? "persona" : "personas"})</span><span>${fmt(c.subtotal)}</span></div>
        <div class="bRow"><span>Cargo por servicio (${CONFIG.feeServicio * 100}%)</span><span>${fmt(c.servicio)}</span></div>
        <div class="bRow"><span>IVA ${CONFIG.ivaServicio * 100}% sobre el servicio</span><span>${fmt(c.iva)}</span></div>
        <div class="bRow total"><span>Total a pagar</span><span>${fmt(c.total)}</span></div>`;
}

function pasoCheckout(dir){

    if(dir > 0){

        if(pasoActual === 2 && !validarFactura()) return;

        if(pasoActual === 3){

            confirmarCompra();

            return;
        }
    }

    pasoActual = clamp(pasoActual + dir, 1, 3);

    renderCheckout();
}



/* ========================================
   FACTURACIÓN ELECTRÓNICA
======================================== */

function toggleFactura(){

    $("feForm").classList.toggle("open", $("quiereFactura").checked);
}

function cambioTipoPersona(){

    const juridica = $("feTipoPersona").value === "Jurídica";

    $("feNombreLbl").innerText = juridica ? "Razón social" : "Nombre completo";

    if(juridica) $("feTipoDoc").value = "NIT";

    calcularDV();
}

function calcularDV(){

    const doc = $("feDocumento").value.replace(/\D/g, "");

    const esNit = $("feTipoDoc").value === "NIT";

    $("feDV").style.display = esNit ? "flex" : "none";

    $("feDV").innerText = esNit && doc ? "DV " + digitoVerificacion(doc) : "DV -";
}

function usarDatosCuenta(){

    if(!currentUser) return;

    $("feNombre").value = currentUser.name;

    $("feCorreo").value = currentUser.email;
}

function validarFactura(){

    if(!$("quiereFactura").checked) return true;

    const requeridos = ["feDocumento", "feNombre", "feCorreo", "feDireccion", "feCiudad"];

    let ok = true;

    requeridos.forEach(id => {

        const vacio = !$(id).value.trim();

        $(id).classList.toggle("invalid", vacio);

        if(vacio) ok = false;
    });

    const correoOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($("feCorreo").value.trim());

    if(!correoOk){

        $("feCorreo").classList.add("invalid");

        ok = false;
    }

    if(!ok) toast("Completa los datos de facturación", "fa-triangle-exclamation");

    return ok;
}

function datosFactura(){

    const esNit = $("feTipoDoc").value === "NIT";

    const doc = $("feDocumento").value.trim();

    return {
        tipoPersona: $("feTipoPersona").value,
        tipoDoc: $("feTipoDoc").value,
        documento: doc,
        dv: esNit ? digitoVerificacion(doc) : null,
        nombre: $("feNombre").value.trim(),
        correo: $("feCorreo").value.trim(),
        telefono: $("feTelefono").value.trim(),
        direccion: $("feDireccion").value.trim(),
        ciudad: $("feCiudad").value.trim(),
        responsabilidad: $("feResponsabilidad").value
    };
}



/* ========================================
   MÉTODOS DE PAGO
======================================== */

const METODOS = [
    ["Nequi", "img/nequi.png"],
    ["Daviplata", "img/daviplata.png"],
    ["PSE", "img/pse.png"],
    ["Visa", "img/visa.png"],
    ["Mastercard", "img/mastercard.png"]
];

function renderMetodos(){

    $("paymentMethods").innerHTML = METODOS.map(([nombre, img]) => `
        <div class="paymentMethod" onclick="seleccionarMetodo('${nombre}', this)">
            <img src="${img}" alt="${nombre}">
            <p>${nombre}</p>
        </div>`).join("");
}

function seleccionarMetodo(nombre, el){

    metodoPago = nombre;

    document.querySelectorAll(".paymentMethod").forEach(m => m.classList.remove("active"));

    if(el) el.classList.add("active");

    $("metodoSeleccionado").innerHTML = `Método seleccionado: <b>${nombre}</b>`;
}



/* ========================================
   CONFIRMAR COMPRA
======================================== */

async function confirmarCompra(){

    if(pagando) return;

    if(!metodoPago){

        toast("Selecciona un método de pago", "fa-credit-card");

        return;
    }

    if(!$("aceptaTerminos").checked){

        toast("Debes aceptar los términos y condiciones", "fa-triangle-exclamation");

        return;
    }

    pagando = true;

    renderCheckout();

    try{

        const compra = crearCompra(eventoActual, carrito, metodoPago, null);

        if($("quiereFactura").checked){

            const numero = `OTFE-${await DB.siguienteFactura()}`;

            compra.factura = await crearFactura(numero, datosFactura(), compra.total, compra.codigo);
        }

        if(!reservaExpira || reservaExpira < Date.now()){

            throw new Error("Tu reserva venció. Vuelve a intentarlo.");
        }

        const guardada = await DB.comprar(compra);

        detenerReserva();

        // boletas (y factura, si la pidió) a su correo
        DB.encolarCorreo(
            [currentUser.email, guardada.factura && guardada.factura.adquiriente.correo],
            correoCompra(guardada, CONFIG.sitioWeb || location.href.replace(/[^/]*$/, ""))
        ).catch(() => {});

        carrito = [];

        cerrarModal("checkoutModal");

        renderCartBar();

        mostrarTicket(guardada);

    }catch(e){

        toast(esc(e.message), "fa-triangle-exclamation");

    }finally{

        pagando = false;

        if($("checkoutModal").classList.contains("open")) renderCheckout();
    }
}



/* ========================================
   TICKET + QR DINÁMICO
======================================== */

function mostrarTicket(compra){

    compraEnPantalla = compra;

    const items = compra.items
        ? compra.items.map(i => `<li>${esc(i.etiqueta)}</li>`).join("")
        : (compra.entradas || []).map(e => `<li>${esc(e)}</li>`).join("");

    $("ticketTexto").innerHTML = `
        <h3>${esc(compra.evento || "Andrés Cepeda Tour 2025")}</h3>
        ${compra.fecha ? `<p><i class="fa-regular fa-calendar"></i> ${esc(compra.fecha)}</p>` : ""}
        ${compra.lugar ? `<p><i class="fa-solid fa-location-dot"></i> ${esc(compra.lugar)}</p>` : ""}
        <ul class="ticketItems">${items}</ul>
        <p class="ticketCode">${esc(compra.codigo)}</p>`;

    $("invoiceCard").innerHTML = renderFacturaResumen(compra);

    $("zonaQR").innerHTML = htmlZonaQR(compra);

    // título según el estado: compra recién hecha o boleta ya usada
    document.querySelector("#ticketModal .successHead h2").innerText =
        estadoIngreso(compra).completa ? "Boleta utilizada" : (compra.ingresos ? "Tu boleta" : "¡Tu experiencia está asegurada!");

    if(!estadoIngreso(compra).completa) iniciarTimerQR();

    abrirModal("ticketModal");

    // si la escanean en la entrada, se actualiza sola
    if(dejarDeEscucharTicket) dejarDeEscucharTicket();

    let ingresosAntes = compra.ingresos || 0;

    dejarDeEscucharTicket = DB.escucharCompra(compra.codigo, nueva => {

        if((nueva.ingresos || 0) === ingresosAntes) return;

        ingresosAntes = nueva.ingresos || 0;

        compraEnPantalla = nueva;

        const i = comprasUsuario.findIndex(x => x.codigo === nueva.codigo);

        if(i >= 0) comprasUsuario[i] = nueva;

        const est = estadoIngreso(nueva);

        if(est.completa){

            clearInterval(intervaloQR);

            $("zonaQR").innerHTML = htmlZonaQR(nueva, true);

        }else{

            $("zonaQR").querySelector(".estadoParcialWeb").outerHTML = htmlParcialWeb(est);

            toast(`Ingreso registrado: ${est.usados} de ${est.total}`, "fa-door-open");
        }
    });
}

let dejarDeEscucharTicket = null;

function htmlParcialWeb(est){

    return `<div class="estadoParcialWeb ${est.parcial ? "show" : ""}">${est.parcial ? `<i class="fa-solid fa-person-walking-arrow-right"></i> Ya ingresaron <b>${est.usados} de ${est.total}</b>. El QR sigue activo para los demás.` : ""}</div>`;
}

function htmlZonaQR(compra, recien){

    const est = estadoIngreso(compra);

    if(est.completa){

        const hora = compra.ultimoIngreso ? new Date(compra.ultimoIngreso).toLocaleString("es-CO", { weekday:"short", day:"numeric", month:"short", hour:"numeric", minute:"2-digit" }) : "";

        return `
            <div class="qrUsadoWeb ${recien ? "recien" : ""}">
                <i class="fa-solid fa-qrcode"></i>
                <span class="selloWeb">UTILIZADA</span>
            </div>
            <h3 class="usadaTitulo">${recien ? "¡Ingreso registrado! Disfruta el show 🎉" : "Ya ingresaste a este evento"}</h3>
            <p class="qrNote">${est.total === 1 ? "Esta boleta ya fue usada" : `Las ${est.total} entradas ya fueron usadas`}${hora ? " · " + esc(hora) : ""}</p>`;
    }

    const marca = currentUser ? esc(currentUser.name || currentUser.email) : "OnTicket";

    return `
        ${htmlParcialWeb(est)}
        <div class="qrProtegido" id="qrProtegido" oncontextmenu="return false" ondragstart="return false">
            <div id="qrcode"></div>
            <div class="marcaAgua">${Array.from({ length: 6 }, () => `<span>${marca} · ${esc(compra.codigo.slice(-8))}</span>`).join("")}</div>
            <div class="qrCubierta"><i class="fa-solid fa-eye-slash"></i> Vuelve a esta ventana para ver tu QR</div>
        </div>
        <div class="qrTimerContainer">
            <svg class="progressRing" width="120" height="120">
                <circle class="progressBg" cx="60" cy="60" r="52"></circle>
                <circle class="progressCircle" cx="60" cy="60" r="52"></circle>
            </svg>
            <div id="qrTimer">00:30</div>
        </div>
        <p class="qrNote"><i class="fa-solid fa-shield-halved"></i> QR dinámico: cambia cada 30 s y se oculta si sales de la ventana. Una captura no sirve para entrar.</p>`;
}

function renderFacturaResumen(compra){

    const servicio = compra.servicio ?? 0;

    const iva = compra.iva ?? 0;

    const subtotal = compra.subtotal ?? compra.total;

    const desglose = `
        <div class="breakdown">
            <div class="bRow"><span>Valor boletas</span><span>${fmt(subtotal)}</span></div>
            <div class="bRow"><span>Cargo por servicio</span><span>${fmt(servicio)}</span></div>
            <div class="bRow"><span>IVA sobre el servicio</span><span>${fmt(iva)}</span></div>
            <div class="bRow total"><span>Total pagado</span><span>${fmt(compra.total)}</span></div>
        </div>
        <p class="metodoTxt">Pagado con <b>${esc(compra.metodo)}</b></p>`;

    if(!compra.factura){

        return `
        <h3><i class="fa-solid fa-receipt"></i> Comprobante de compra</h3>
        <p class="modalSub">No solicitaste factura electrónica para esta compra.</p>
        ${desglose}`;
    }

    const f = compra.factura;

    const a = f.adquiriente;

    return `
        <h3><i class="fa-solid fa-file-invoice-dollar"></i> Factura electrónica</h3>
        <div class="feBadge"><i class="fa-solid fa-circle-check"></i> Enviada a ${esc(a.correo)}</div>
        <div class="feDatos">
            <div><small>Número</small><b>${esc(f.numero)}</b></div>
            <div><small>Adquiriente</small><b>${esc(a.nombre)}</b></div>
            <div><small>${esc(a.tipoDoc)}</small><b>${esc(a.documento)}${a.dv !== null ? "-" + a.dv : ""}</b></div>
            <div><small>Fecha</small><b>${new Date(f.fecha).toLocaleString("es-CO")}</b></div>
        </div>
        <small class="cufe"><b>CUFE:</b> ${esc(f.cufe)}</small>
        ${desglose}
        <button class="ghostBtn full" onclick="verFactura()">
            <i class="fa-solid fa-print"></i> Ver / descargar factura
        </button>`;
}

function verFactura(){

    const compra = compraEnPantalla;

    if(!compra || !compra.factura) return;

    const w = window.open("", "_blank");

    if(!w){

        toast("Permite las ventanas emergentes para ver la factura", "fa-triangle-exclamation");

        return;
    }

    w.document.write(htmlFactura(compra, location.href.replace(/[^/]*$/, "") + "img/logo.png"));

    w.document.close();
}

function actualizarQR(){

    const cont = $("qrcode");

    if(!cont) return;

    const qr = qrcode(0, "M");

    qr.addData(qrDinamico(compraEnPantalla.codigo));

    qr.make();

    cont.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

// el QR cambia cada 30 s, sincronizado con el reloj (igual que en la app)
function iniciarTimerQR(){

    clearInterval(intervaloQR);

    let ventana = ventanaQR();

    actualizarQR();

    actualizarTimer();

    intervaloQR = setInterval(() => {

        if(ventanaQR() !== ventana){

            ventana = ventanaQR();

            actualizarQR();
        }

        actualizarTimer();

    }, 1000);
}

function actualizarTimer(){

    const restante = segundosQR();

    if(!$("qrTimer")) return;

    $("qrTimer").innerText = `00:${String(restante).padStart(2, "0")}`;

    const circulo = document.querySelector(".progressCircle");

    if(circulo){

        circulo.style.strokeDashoffset = 326 * (1 - restante / QR_PERIODO);
    }
}

function cerrarTicket(){

    cerrarModal("ticketModal");

    clearInterval(intervaloQR);

    if(dejarDeEscucharTicket){

        dejarDeEscucharTicket();

        dejarDeEscucharTicket = null;
    }
}

/* ----- protección del QR en la web -----
   Los navegadores no permiten bloquear las capturas de pantalla (eso solo
   lo puede hacer la app nativa). Aquí se dificulta: el QR se oculta cuando
   la ventana pierde el foco o se pulsa "Imprimir pantalla", lleva marca de
   agua con el nombre del comprador y además cambia cada 30 segundos. */

function ocultarQR(ocultar){

    const z = $("qrProtegido");

    if(z) z.classList.toggle("oculto", ocultar);
}

window.addEventListener("blur", () => ocultarQR(true));

window.addEventListener("focus", () => ocultarQR(false));

document.addEventListener("visibilitychange", () => ocultarQR(document.visibilityState !== "visible"));

document.addEventListener("keydown", e => {

    if(e.key === "PrintScreen" || (e.metaKey && e.shiftKey) || (e.key === "s" && e.shiftKey && (e.metaKey || e.getModifierState("OS")))){

        ocultarQR(true);

        setTimeout(() => { if(document.hasFocus()) ocultarQR(false); }, 2500);
    }
});

document.addEventListener("keyup", e => {

    if(e.key === "PrintScreen"){

        ocultarQR(true);

        // si quedó algo en el portapapeles, se reemplaza
        if(navigator.clipboard) navigator.clipboard.writeText("Boleta protegida · OnTicket").catch(() => {});

        setTimeout(() => ocultarQR(false), 2500);
    }
});



/* ========================================
   MIS COMPRAS
======================================== */

async function abrirMisCompras(){

    if(!currentUser){

        $("authMsg").innerText = "Inicia sesión para ver tus boletas.";

        abrirLogin();

        return;
    }

    $("misCompras").innerHTML = `<div class="emptyState"><i class="fa-solid fa-spinner fa-spin"></i><p>Cargando tus boletas...</p></div>`;

    abrirModal("misComprasModal");

    try{

        comprasUsuario = await DB.misCompras();

    }catch(e){

        toast("No se pudieron cargar tus boletas", "fa-triangle-exclamation");
    }

    renderCompras();
}

function renderCompras(){

    const cont = $("misCompras");

    if(!comprasUsuario.length){

        cont.innerHTML = `
        <div class="emptyState">
            <i class="fa-solid fa-ticket"></i>
            <p>Aún no tienes boletas. ¡Tu próxima experiencia te espera!</p>
        </div>`;

        return;
    }

    cont.innerHTML = comprasUsuario.map((compra, index) => {

        const ev = getEvento(compra.eventoId);

        const ing = estadoIngreso(compra);

        return `
        <div class="compraGuardada ${ing.completa ? "usada" : ""}">

            ${ev ? `<img src="${ev.imagen}" alt="">` : `<div class="compraImg"><i class="fa-solid fa-ticket"></i></div>`}

            <div class="compraInfo">
                ${ing.completa ? `<span class="usadaTag"><i class="fa-solid fa-circle-check"></i> Ya ingresaste</span>` : ing.parcial ? `<span class="usadaTag parcial">${ing.usados} de ${ing.total} ingresaron</span>` : ""}
                <b>${esc(compra.evento || "Andrés Cepeda Tour 2025")}</b>
                <small>${esc(compra.fecha || "")}</small>
                <small>${(compra.items || compra.entradas || []).length} ítem(s) · ${esc(compra.metodo)}</small>
                <small class="mono">${esc(compra.codigo)}</small>
                ${compra.factura ? `<span class="feTag"><i class="fa-solid fa-file-invoice"></i> ${esc(compra.factura.numero)}</span>` : ""}
            </div>

            <div class="compraSide">
                <b>${fmt(compra.total)}</b>
                <div class="compraBtns">
                    <button class="verBtn" onclick="verCompra(${index})">VER QR</button>
                    <button class="eliminarBtn" onclick="eliminarCompra(${index})">ELIMINAR</button>
                </div>
            </div>

        </div>`;

    }).join("");
}

function verCompra(index){

    cerrarModal("misComprasModal");

    mostrarTicket(comprasUsuario[index]);
}

async function eliminarCompra(index){

    if(!confirm("¿Eliminar esta compra? Las ubicaciones quedarán libres de nuevo.")) return;

    try{

        await DB.eliminarCompra(comprasUsuario[index]);

        comprasUsuario.splice(index, 1);

        renderCompras();

    }catch(e){

        toast("No se pudo eliminar la compra", "fa-triangle-exclamation");
    }
}



/* ========================================
   ADMIN PANEL → admin.js
======================================== */



/* ========================================
   MODALES
======================================== */

function abrirModal(id){

    $(id).classList.add("open");

    document.body.classList.add("modalOpen");
}

function cerrarModal(id){

    $(id).classList.remove("open");

    if(!document.querySelector(".modal.open")){

        document.body.classList.remove("modalOpen");
    }
}

document.querySelectorAll(".modal").forEach(m => {

    m.addEventListener("click", e => {

        if(e.target === m){

            m.id === "ticketModal" ? cerrarTicket() : cerrarModal(m.id);
        }
    });
});

document.addEventListener("keydown", e => {

    if(e.key !== "Escape") return;

    const abiertos = document.querySelectorAll(".modal.open");

    const ultimo = abiertos[abiertos.length - 1];

    if(ultimo){

        ultimo.id === "ticketModal" ? cerrarTicket() : cerrarModal(ultimo.id);
    }
});

function abrirAyuda(){

    abrirModal("ayudaModal");
}

function cerrarAyuda(){

    cerrarModal("ayudaModal");
}

function cerrarPago(){

    cerrarModal("checkoutModal");
}



/* ========================================
   LOGIN / REGISTRO
======================================== */

function abrirLogin(){

    abrirModal("loginModal");
}

function cerrarLogin(){

    cerrarModal("loginModal");

    pendienteCheckout = false;

    $("authMsg").innerText = "Ingresa para comprar y ver tus boletas.";
}

function toggleAuthMode(){

    const title = $("authTitle");

    const registerName = $("registerName");

    const actionBtn = $("loginActionBtn");

    const switchBtn = document.querySelector(".switchAuthBtn");

    if(authMode === "login"){

        authMode = "register";

        title.innerText = "Crear Cuenta";

        registerName.style.display = "block";

        actionBtn.innerText = "CREAR CUENTA";

        actionBtn.onclick = registrarUsuario;

        switchBtn.innerText = "Ya tengo cuenta";

    }else{

        authMode = "login";

        title.innerText = "Iniciar Sesión";

        registerName.style.display = "none";

        actionBtn.innerText = "INICIAR SESIÓN";

        actionBtn.onclick = iniciarSesion;

        switchBtn.innerText = "Crear cuenta";
    }
}

function togglePassword(){

    const input = $("passwordInput");

    input.type = input.type === "password" ? "text" : "password";
}

async function registrarUsuario(){

    const name = $("registerName").value.trim();

    const email = $("emailInput").value.trim();

    const password = $("passwordInput").value;

    if(!name || !email || !password){

        toast("Completa todos los campos", "fa-triangle-exclamation");

        return;
    }

    try{

        const usuario = await DB.registrar(name, email, password);

        toast(`Cuenta creada. ¡Bienvenido, ${esc(usuario.name)}!`);

        despuesDeEntrar();

        if(!usuario.verificado) abrirVerificacion();

    }catch(e){

        toast(esc(e.message), "fa-triangle-exclamation");
    }
}

async function iniciarSesion(){

    const email = $("emailInput").value.trim();

    const password = $("passwordInput").value;

    try{

        const usuario = await DB.login(email, password, $("rememberUser").checked);

        toast(`¡Hola, ${esc(usuario.name)}!`, "fa-hand");

        despuesDeEntrar();

    }catch(e){

        toast(esc(e.message), "fa-circle-xmark");
    }
}

async function loginConGoogle(){

    try{

        const usuario = await DB.loginGoogle();

        toast(`¡Hola, ${esc(usuario.name)}!`, "fa-hand");

        despuesDeEntrar();

    }catch(e){

        toast(esc(e.message), "fa-circle-xmark");
    }
}

async function olvideClave(){

    const email = $("emailInput").value.trim();

    if(!email){

        toast("Escribe tu correo arriba y vuelve a tocar \"¿Olvidaste tu contraseña?\"", "fa-envelope");

        $("emailInput").focus();

        return;
    }

    try{

        await DB.recuperarClave(email);

        toast(`Te enviamos un correo a ${esc(email)} para crear una contraseña nueva`, "fa-envelope-circle-check");

    }catch(e){

        toast(esc(e.message), "fa-circle-xmark");
    }
}

function abrirVerificacion(){

    $("verificaCorreo").innerText = currentUser ? currentUser.email : "";

    abrirModal("verificaModal");
}

async function yaVerifique(){

    const u = await DB.refrescarUsuario();

    if(u && u.verificado){

        currentUser = u;

        recalcularEstado();

        actualizarUsuario();

        cerrarModal("verificaModal");

        toast("¡Correo verificado! Ya puedes comprar", "fa-circle-check");

        if(pendienteCheckout){

            pendienteCheckout = false;

            abrirCheckout();
        }

    }else{

        toast("Aún no aparece verificado. Abre el enlace del correo (revisa también Spam)", "fa-envelope");
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

function despuesDeEntrar(){

    $("passwordInput").value = "";

    currentUser = DB.usuario();

    actualizarUsuario();

    const continuar = pendienteCheckout;

    cerrarLogin();

    if(authMode === "register") toggleAuthMode();

    recalcularEstado();

    if(continuar){

        pendienteCheckout = true;

        abrirCheckout();
    }
}

async function cerrarSesion(){

    if(!confirm("¿Cerrar sesión?")) return;

    await DB.logout();

    currentUser = null;

    actualizarUsuario();

    if(adminPage.style.display === "block") volverHome();
}

function actualizarUsuario(){

    if(currentUser){

        btnLogin.innerHTML = `<i class="fa-solid fa-user"></i> <span class="userName">${esc(currentUser.name)}</span> <i class="fa-solid fa-right-from-bracket logoutIcon"></i>`;

        btnLogin.title = "Cerrar sesión";

        btnLogin.onclick = cerrarSesion;

        adminBtn.style.display = ["admin", "taquilla"].includes(currentUser.role) ? "flex" : "none";

        $("bannerVerificar").classList.toggle("show", !currentUser.verificado);

    }else{

        btnLogin.innerHTML = `<i class="fa-solid fa-user"></i> <span class="userName">Iniciar sesión</span>`;

        btnLogin.title = "";

        btnLogin.onclick = abrirLogin;

        adminBtn.style.display = "none";

        $("bannerVerificar").classList.remove("show");
    }
}



/* ========================================
   MODO OSCURO
======================================== */

function toggleTheme(){

    document.body.classList.toggle("dark");

    localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
}

if(localStorage.getItem("theme") === "dark"){

    document.body.classList.add("dark");
}



/* ========================================
   INICIAR
======================================== */

document.body.classList.add("landingMode");

DB.onUsuario(usuario => {

    currentUser = usuario;

    actualizarUsuario();

    recalcularEstado();
});

function renderInicio(){

    renderCarrusel();

    aplicarFiltros();
}

renderInicio();

// eventos creados por el administrador (Firebase); mientras tanto se usan los guardados
sincronizarEventos().then(cambio => {

    if(cambio){

        renderInicio();

        iniciarCarrusel();
    }
});

// instalable como app (PWA), útil en iPhone
if("serviceWorker" in navigator && location.protocol.startsWith("http")){

    navigator.serviceWorker.register("sw.js").catch(() => {});
}

// QR que apunta a la descarga del APK (en Vercel apunta al dominio de la web)
$("qrDescarga").src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(new URL("descargas/OnTicket.apk", location.href).href)}`;
