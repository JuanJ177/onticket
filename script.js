/* ========================================
   UTILIDADES
======================================== */

const $ = id => document.getElementById(id);

function fmt(valor){

    return "$" + Math.round(valor).toLocaleString("es-CO");
}

// Evita inyectar HTML con datos escritos por el usuario
function esc(texto){

    return String(texto ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Número pseudoaleatorio estable (para simular sillas ya vendidas)
function azar(texto){

    let h = 2166136261;

    for(let i = 0; i < texto.length; i++){

        h ^= texto.charCodeAt(i);

        h = Math.imul(h, 16777619);
    }

    return ((h >>> 0) % 10000) / 10000;
}

function clamp(v, min, max){

    return Math.max(min, Math.min(max, v));
}

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

let eventoActual = null;
let planoActual = null;
let pisoActual = 0;
let zonasActivas = new Set();
let precioMaximo = Infinity;
let zoom = { s:1, x:0, y:0 };

let carrito = [];
let pasoActual = 1;
let metodoPago = "";

let ciudadActiva = "Todas";
let categoriaActiva = "Todas";

let slideActual = 0;
let intervaloSlides;

let tiempoRestante = 30;
let intervaloQR;
let compraEnPantalla = null;



/* ========================================
   USUARIOS (localStorage)
======================================== */

function getUsers(){

    return JSON.parse(localStorage.getItem("users")) || [];
}

function saveUsers(users){

    localStorage.setItem("users", JSON.stringify(users));
}

function guardarSesion(usuario){

    if(localStorage.getItem("currentUser")){

        localStorage.setItem("currentUser", JSON.stringify(usuario));

    }else{

        sessionStorage.setItem("currentUser", JSON.stringify(usuario));
    }
}

function actualizarComprasUsuario(cambio){

    let users = getUsers();

    users = users.map(user => {

        if(user.email === currentUser.email){

            user.compras = user.compras || [];

            cambio(user);

            currentUser = user;
        }

        return user;
    });

    saveUsers(users);

    guardarSesion(currentUser);
}



/* ========================================
   ADMIN POR DEFECTO
======================================== */

function inicializarAdmin(){

    let users = getUsers();

    if(!users.find(u => u.role === "admin")){

        users.push({
            name: "Administrador",
            email: "admin@onticket.com",
            password: "123456",
            role: "admin",
            compras: []
        });

        saveUsers(users);
    }
}

inicializarAdmin();



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
   HELPERS DE EVENTOS
======================================== */

function getEvento(id){

    return EVENTOS.find(e => e.id === id);
}

function lugarDe(evento){

    return LUGARES[evento.lugar];
}

function planoDe(evento){

    return PLANOS[lugarDe(evento).plano];
}

function precioZona(evento, zonaId){

    const zona = planoDe(evento).zonas[zonaId];

    return (evento.precios && evento.precios[zonaId]) || zona.precio;
}

// precio por persona (para comparar asientos, palcos y general)
function precioPersona(evento, zonaId){

    const zona = planoDe(evento).zonas[zonaId];

    if(zona.tipo === "palco"){

        return zona.precioPuesto || precioZona(evento, zonaId) / 10;
    }

    return precioZona(evento, zonaId);
}

function precioDesde(evento){

    return Math.min(...Object.keys(planoDe(evento).zonas).map(z => precioPersona(evento, z)));
}

function urlMapaEmbed(lugar){

    return `https://maps.google.com/maps?q=${encodeURIComponent(lugar.mapa)}&z=15&output=embed`;
}

function urlComoLlegar(lugar){

    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lugar.mapa)}`;
}



/* ========================================
   BANNER INTERACTIVO (CARRUSEL)
======================================== */

function renderCarrusel(){

    const destacados = EVENTOS.filter(e => e.destacado);

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

    const ciudades = ["Todas", ...new Set(EVENTOS.map(e => lugarDe(e).ciudad))];

    $("cityChips").innerHTML = ciudades.map(c => {

        const n = c === "Todas" ? EVENTOS.length : EVENTOS.filter(e => lugarDe(e).ciudad === c).length;

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

    const lista = EVENTOS.filter(ev => {

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

                <span class="eventCat">${ev.categoria}</span>

                <span class="eventCity"><i class="fa-solid fa-location-dot"></i> ${lugar.ciudad}</span>

            </div>

            <div class="eventCardInfo">

                <span class="eventDate">${ev.fecha} · ${ev.hora}</span>

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

    pisoActual = 0;

    zonasActivas = new Set();

    zoom = { s:1, x:0, y:0 };

    renderEventoHero();

    renderSidebar();

    prepararFiltrosPlano();

    renderPlano();

    mostrarPagina(eventoPage);
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
}

function renderSidebar(){

    const ev = eventoActual;

    const lugar = lugarDe(ev);

    // ----- localidades -----
    $("zonasLista").innerHTML = Object.entries(planoActual.zonas).map(([id, z]) => {

        const disp = disponiblesZona(id);

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

            <a class="ghostBtn" href="https://waze.com/ul?q=${encodeURIComponent(lugar.mapa)}&navigate=yes" target="_blank" rel="noopener">
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



/* ========================================
   ESTADO DE VENTA (vendidos)
======================================== */

let cacheVendidos = {};

function getVentas(eventoId){

    const v = JSON.parse(localStorage.getItem("ventas_" + eventoId)) || {};

    return { ids: v.ids || [], general: v.general || {} };
}

function saveVentas(eventoId, ventas){

    localStorage.setItem("ventas_" + eventoId, JSON.stringify(ventas));

    delete cacheVendidos[eventoId];
}

// ids vendidos por compras reales (se guarda en memoria para no leer localStorage en cada silla)
function vendidosGuardados(eventoId){

    if(!cacheVendidos[eventoId]){

        cacheVendidos[eventoId] = new Set(getVentas(eventoId).ids);
    }

    return cacheVendidos[eventoId];
}

function idVendido(id, tasa){

    return azar(eventoActual.id + "|" + id) < tasa || vendidosGuardados(eventoActual.id).has(id);
}

function asientoVendido(a){

    return idVendido(a.id, 0.2);
}

function puestosPalco(p){

    const lista = [];

    for(let n = 1; n <= p.capacidad; n++){

        const id = `${p.id}-${n}`;

        lista.push({ id, n, vendido: idVendido(id, 0.35) });
    }

    return lista;
}

function palcoVendido(p){

    if(p.individual){

        return puestosPalco(p).every(x => x.vendido);
    }

    return idVendido(p.id, 0.3);
}

function generalDisponible(g){

    const zona = planoActual.zonas[g.zona];

    const capacidad = g.capacidad || zona.capacidad;

    const vendidos = Math.floor(capacidad * 0.55 * azar(eventoActual.id + "|" + g.id)) + (getVentas(eventoActual.id).general[g.id] || 0);

    return Math.max(0, capacidad - vendidos);
}

function disponiblesZona(zonaId){

    let total = 0;

    planoActual.pisos.forEach(piso => {

        piso.asientos.filter(a => a.zona === zonaId).forEach(a => { if(!asientoVendido(a)) total++; });

        piso.palcos.filter(p => p.zona === zonaId).forEach(p => {

            if(p.individual){

                total += puestosPalco(p).filter(x => !x.vendido).length;

            }else if(!palcoVendido(p)){

                total += p.capacidad;
            }
        });

        piso.generales.filter(g => g.zona === zonaId).forEach(g => total += generalDisponible(g));
    });

    return total;
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

    const i = planoActual.pisos.findIndex(p =>
        p.asientos.some(a => a.zona === id) ||
        p.palcos.some(a => a.zona === id) ||
        p.generales.some(a => a.zona === id));

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

function zonaVisible(zonaId){

    const pasaZona = zonasActivas.size === 0 || zonasActivas.has(zonaId);

    return pasaZona && precioPersona(eventoActual, zonaId) <= precioMaximo;
}



/* ========================================
   DIBUJAR EL PLANO (SVG)
======================================== */

function textoVertical(x, y, texto, cls){

    return `<text x="${x}" y="${y}" class="${cls}" transform="rotate(-90 ${x} ${y})" text-anchor="middle" dominant-baseline="middle">${texto}</text>`;
}

function renderPlano(){

    if(!planoActual) return;

    const piso = planoActual.pisos[pisoActual];

    const zonas = planoActual.zonas;

    const soloDisp = $("soloDisponibles").checked;

    const soloInd = $("soloIndividuales").checked;

    svg.setAttribute("viewBox", `0 0 ${piso.w} ${piso.h}`);

    let html = `<rect class="planoFondo" x="0" y="0" width="${piso.w}" height="${piso.h}" rx="18"/>`;

    html += `<g id="planoG">`;


    // ----- formas -----
    piso.formas.forEach(f => {

        if(f.t === "rect"){

            const color = f.zona ? `style="--c:${zonas[f.zona].color}"` : "";

            html += `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="${f.rx || 0}" class="forma ${f.cls}" ${color}/>`;

            if(f.texto){

                const cx = f.x + f.w / 2, cy = f.y + f.h / 2;

                const cls = `formaText ${f.cls}Text ${f.small ? "small" : ""}`;

                html += f.vertical
                    ? textoVertical(cx, cy, f.texto, cls)
                    : `<text x="${cx}" y="${cy}" class="${cls}" text-anchor="middle" dominant-baseline="middle">${f.texto}</text>`;
            }

        }else if(f.t === "text"){

            html += `<text x="${f.x}" y="${f.y}" class="${f.cls}" text-anchor="middle">${f.texto}</text>`;

        }else if(f.t === "pill"){

            const z = zonas[f.zona];

            const dim = zonaVisible(f.zona) ? "" : "dim";

            html += `<g class="pill ${dim}" data-kind="zona" data-zona="${f.zona}" style="--t:${z.texto}">
                <rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="12" fill="${z.color}"/>
                ${textoVertical(f.x + f.w / 2, f.y + f.h / 2, f.texto, "pillText")}
            </g>`;

        }else if(f.t === "band"){

            const z = zonas[f.zona];

            const dim = zonaVisible(f.zona) ? "" : "dim";

            html += `<g class="band ${dim}" style="--c:${z.color};--t:${z.texto}">
                <rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="12"/>
                <rect x="${f.x}" y="${f.y}" width="22" height="${f.h}" rx="10" class="bandStrip"/>
                ${textoVertical(f.x + 11, f.y + f.h / 2, f.texto.replace("PALCOS ", ""), "bandText")}
            </g>`;
        }
    });


    // ----- zonas generales -----
    piso.generales.forEach(g => {

        const z = zonas[g.zona];

        const disp = generalDisponible(g);

        const enCarro = carrito.find(i => i.key === g.id);

        const clases = [
            "ga",
            zonaVisible(g.zona) && !soloInd ? "" : "dim",
            disp ? "" : "sold",
            enCarro ? "sel" : ""
        ].join(" ");

        const tip = `<b>${z.nombre}${g.texto.length === 1 ? " " + g.texto : ""}</b><br>${fmt(precioZona(eventoActual, g.zona))} por persona<br>${disp} disponibles`;

        const grande = g.w > 120;

        html += `<g class="${clases}" data-kind="ga" data-id="${g.id}" data-tip="${esc(tip)}" style="--c:${z.color};--t:${z.texto}">
            <rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="12"/>
            <text x="${g.x + g.w / 2}" y="${g.y + g.h / 2 - (grande ? 8 : 0)}" class="gaText ${grande ? "" : "small"}" text-anchor="middle" dominant-baseline="middle">${g.texto}</text>
            ${grande ? `<text x="${g.x + g.w / 2}" y="${g.y + g.h / 2 + 16}" class="gaSub" text-anchor="middle">${enCarro ? enCarro.cantidad + " en tu compra" : fmt(precioZona(eventoActual, g.zona)) + " · " + disp + " disp."}</text>` : ""}
        </g>`;
    });


    // ----- palcos -----
    piso.palcos.forEach(p => {

        const z = zonas[p.zona];

        const vendido = palcoVendido(p);

        const puestos = p.individual ? puestosPalco(p) : [];

        const libres = puestos.filter(x => !x.vendido).length;

        const enCarro = carrito.filter(i => i.palco === p.id).length;

        const visible = zonaVisible(p.zona) && (!soloInd || p.individual);

        const clases = [
            "palco",
            p.individual ? "ind" : "",
            visible ? "" : "dim",
            vendido ? "sold" : "",
            vendido && soloDisp ? "oculto" : "",
            enCarro ? "sel" : ""
        ].join(" ");

        const tip = p.individual
            ? `<b>${z.nombre} · Palco ${p.num}</b><br><span class="tipInd">Palco individual · venta por puesto</span><br>${fmt(precioPersona(eventoActual, p.zona))} por puesto · ${libres}/10 libres`
            : `<b>${z.nombre} · Palco ${p.num}</b><br>Palco completo · 10 personas<br>${fmt(precioZona(eventoActual, p.zona))}${vendido ? " · Vendido" : ""}`;

        const chico = p.w < 40;

        html += `<g class="${clases}" data-kind="palco" data-id="${p.id}" data-tip="${esc(tip)}" style="--c:${z.color};--t:${z.texto}">
            <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${chico ? 4 : 7}"/>
            <text x="${p.x + p.w / 2}" y="${p.y + p.h / 2 - (chico ? 0 : 5)}" class="palcoNum ${chico ? "small" : ""}" text-anchor="middle" dominant-baseline="middle">${p.num}</text>
            ${chico ? "" : `<text x="${p.x + p.w / 2}" y="${p.y + p.h / 2 + 9}" class="palcoSub" text-anchor="middle" dominant-baseline="middle">${p.individual ? (enCarro ? enCarro + " tuyos" : libres + "/10") : (enCarro ? "tuyo" : "x10")}</text>`}
        </g>`;
    });


    // ----- asientos -----
    const enCarrito = new Set(carrito.map(i => i.key));

    piso.asientos.forEach(a => {

        const z = zonas[a.zona];

        const vendido = asientoVendido(a);

        const clases = [
            "seat",
            zonaVisible(a.zona) && !soloInd ? "" : "dim",
            vendido ? "sold" : "",
            vendido && soloDisp ? "oculto" : "",
            enCarrito.has(a.id) ? "sel" : ""
        ].join(" ");

        const tip = `<b>${z.nombre}</b><br>Fila ${a.fila} · Silla ${a.num}<br>${vendido ? "Vendido" : fmt(precioZona(eventoActual, a.zona))}`;

        html += `<g class="${clases}" data-kind="seat" data-id="${a.id}" data-tip="${esc(tip)}" style="--c:${z.color};--t:${z.texto}">
            <circle cx="${a.x}" cy="${a.y}" r="10"/>
            <text x="${a.x}" y="${a.y + 0.5}" text-anchor="middle" dominant-baseline="middle">${a.num}</text>
        </g>`;
    });

    html += `</g>`;

    svg.innerHTML = html;

    aplicarZoom();
}



/* ========================================
   INTERACCIÓN CON EL PLANO
======================================== */

function buscarElemento(kind, id){

    for(const piso of planoActual.pisos){

        const lista = kind === "seat" ? piso.asientos : kind === "palco" ? piso.palcos : piso.generales;

        const el = lista.find(x => x.id === id);

        if(el) return el;
    }

    return null;
}

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

    const el = buscarElemento(kind, g.dataset.id);

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

    if(asientoVendido(a)){

        toast("Esta silla ya fue vendida", "fa-circle-xmark");

        return;
    }

    const z = planoActual.zonas[a.zona];

    if(carrito.find(i => i.key === a.id)){

        quitarDelCarrito(a.id);

        return;
    }

    agregarAlCarrito({
        key: a.id,
        tipo: "asiento",
        zona: a.zona,
        etiqueta: `${z.nombre} · Fila ${a.fila} · Silla ${a.num}`,
        corto: `${z.nombre} ${a.fila}${a.num}`,
        precio: precioZona(eventoActual, a.zona),
        cantidad: 1,
        personas: 1,
        ids: [a.id]
    });
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

    const vendido = palcoVendido(p);

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

        const puestos = puestosPalco(p);

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
                    onclick="togglePuesto('${x.id}', ${x.n})">${x.n}</button>`;

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

function togglePuesto(id, n){

    const p = palcoAbierto;

    const z = planoActual.zonas[p.zona];

    if(carrito.find(i => i.key === id)){

        quitarDelCarrito(id);

    }else{

        agregarAlCarrito({
            key: id,
            tipo: "puesto",
            palco: p.id,
            zona: p.zona,
            etiqueta: `${z.nombre} · Palco ${p.num} · Puesto ${n}`,
            corto: `P${p.num}-${n}`,
            precio: precioPersona(eventoActual, p.zona),
            cantidad: 1,
            personas: 1,
            ids: [id]
        });
    }

    renderPalcoModal();
}

function agregarPalcoCompleto(){

    const p = palcoAbierto;

    const z = planoActual.zonas[p.zona];

    agregarAlCarrito({
        key: p.id,
        tipo: "palco",
        palco: p.id,
        zona: p.zona,
        etiqueta: `${z.nombre} · Palco ${p.num} (10 personas)`,
        corto: `Palco ${p.num}`,
        precio: precioZona(eventoActual, p.zona),
        cantidad: 1,
        personas: 10,
        ids: [p.id]
    });

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

    const disp = generalDisponible(g);

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

    cantidadGeneral = clamp(cantidadGeneral + d, 1, Math.min(CONFIG.maxGeneral, generalDisponible(generalAbierta)));

    renderGeneralModal();
}

function agregarGeneral(){

    const g = generalAbierta;

    const z = planoActual.zonas[g.zona];

    carrito = carrito.filter(i => i.key !== g.id);

    agregarAlCarrito({
        key: g.id,
        tipo: "general",
        zona: g.zona,
        etiqueta: `${z.nombre}${g.texto.length === 1 ? " " + g.texto : ""} · ${cantidadGeneral} persona${cantidadGeneral > 1 ? "s" : ""}`,
        corto: `${z.nombre} x${cantidadGeneral}`,
        precio: precioZona(eventoActual, g.zona),
        cantidad: cantidadGeneral,
        personas: cantidadGeneral,
        ids: []
    });

    cerrarModal("generalModal");
}



/* ========================================
   CARRITO
======================================== */

function agregarAlCarrito(item){

    item.eventoId = eventoActual.id;

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

function calcularCostos(items){

    const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);

    const servicio = Math.round(subtotal * CONFIG.feeServicio);

    const iva = Math.round(servicio * CONFIG.ivaServicio);

    const personas = items.reduce((s, i) => s + (i.personas || 1) * (i.tipo === "general" ? 1 : i.cantidad), 0);

    return { subtotal, servicio, iva, total: subtotal + servicio + iva, personas };
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
   CHECKOUT
======================================== */

function abrirCheckout(){

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

    $("checkoutItems").innerHTML = carrito.map(i => {

        const z = planoActual.zonas[i.zona];

        return `
        <div class="checkoutItem">
            <i class="zonaColor" style="background:${z.color}"></i>
            <div>
                <b>${i.etiqueta}</b>
                <small>${i.tipo === "palco" ? "Palco completo" : i.tipo === "puesto" ? "Palco individual" : i.tipo === "general" ? fmt(i.precio) + " c/u" : "Silla numerada"}</small>
            </div>
            <span>${fmt(i.precio * i.cantidad)}</span>
            <button onclick="quitarDelCarrito('${i.key}')" title="Quitar"><i class="fa-solid fa-xmark"></i></button>
        </div>`;

    }).join("");

    renderDesglose();

    $("btnAtras").style.visibility = pasoActual === 1 ? "hidden" : "visible";

    const c = calcularCostos(carrito);

    $("btnSiguiente").innerHTML =
        pasoActual === 1 ? 'Continuar <i class="fa-solid fa-arrow-right"></i>'
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

// Dígito de verificación del NIT (algoritmo DIAN)
function digitoVerificacion(nit){

    const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

    const digitos = nit.replace(/\D/g, "").split("").reverse();

    const suma = digitos.reduce((s, d, i) => s + Number(d) * (pesos[i] || 0), 0);

    const r = suma % 11;

    return r > 1 ? 11 - r : r;
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

// CUFE simulado: hash SHA-384 de los datos de la factura (como lo exige la DIAN)
async function generarCUFE(texto){

    if(window.crypto && crypto.subtle){

        const buffer = await crypto.subtle.digest("SHA-384", new TextEncoder().encode(texto));

        return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
    }

    let hex = "";

    for(let i = 0; hex.length < 96; i++){

        hex += Math.floor(azar(texto + i) * 0xffffffff).toString(16).padStart(8, "0");
    }

    return hex.slice(0, 96);
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

function generarCodigoDinamico(){

    const tiempo = Math.floor(Date.now() / (1000 * 60));

    const random = Math.floor(Math.random() * 999999);

    return `ONTICKET-${random}-${tiempo}`;
}

async function confirmarCompra(){

    if(!metodoPago){

        toast("Selecciona un método de pago", "fa-credit-card");

        return;
    }

    if(!$("aceptaTerminos").checked){

        toast("Debes aceptar los términos y condiciones", "fa-triangle-exclamation");

        return;
    }

    const ev = eventoActual;

    const lugar = lugarDe(ev);

    const costos = calcularCostos(carrito);

    const codigo = generarCodigoDinamico();

    const fechaCompra = new Date().toISOString();

    let factura = null;

    if($("quiereFactura").checked){

        const consecutivo = Number(localStorage.getItem("consecutivoFE") || 1000) + 1;

        localStorage.setItem("consecutivoFE", consecutivo);

        const numero = `OTFE-${consecutivo}`;

        const adquiriente = datosFactura();

        factura = {
            numero,
            fecha: fechaCompra,
            adquiriente,
            cufe: await generarCUFE(`${numero}|${fechaCompra}|${costos.total}|${adquiriente.documento}|${codigo}`)
        };
    }

    const compra = {
        codigo,
        eventoId: ev.id,
        evento: `${ev.artista} · ${ev.titulo}`,
        fecha: `${ev.fecha} · ${ev.hora}`,
        lugar: `${lugar.nombre}, ${lugar.ciudad}`,
        items: carrito.map(i => ({ ...i })),
        entradas: carrito.map(i => i.etiqueta),
        ...costos,
        metodo: metodoPago,
        fechaCompra,
        factura
    };

    // guardar en el usuario
    actualizarComprasUsuario(user => user.compras.push(compra));

    // marcar como vendido
    const ventas = getVentas(ev.id);

    carrito.forEach(i => {

        ventas.ids.push(...i.ids);

        if(i.tipo === "general"){

            ventas.general[i.key] = (ventas.general[i.key] || 0) + i.cantidad;
        }
    });

    saveVentas(ev.id, ventas);

    carrito = [];

    cerrarModal("checkoutModal");

    renderPlano();

    renderSidebar();

    renderCartBar();

    mostrarTicket(compra);
}



/* ========================================
   TICKET + QR
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

    actualizarQR(compra.codigo);

    iniciarTimerQR();

    abrirModal("ticketModal");
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

    const f = compra.factura;

    const a = f.adquiriente;

    const filas = (compra.items || []).map(i => `
        <tr><td>${esc(i.etiqueta)}</td><td>${i.tipo === "general" ? i.cantidad : 1}</td><td>${fmt(i.precio)}</td><td>${fmt(i.precio * i.cantidad)}</td></tr>`).join("");

    const w = window.open("", "_blank");

    if(!w){

        toast("Permite las ventanas emergentes para ver la factura", "fa-triangle-exclamation");

        return;
    }

    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${esc(f.numero)}</title>
    <style>
        body{font-family:Arial,sans-serif;color:#222;max-width:800px;margin:30px auto;padding:0 20px}
        header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #ff6600;padding-bottom:14px}
        header img{height:50px}
        h1{font-size:18px;margin:0}
        .aviso{background:#fff4e5;border:1px solid #ffb74d;padding:8px 12px;border-radius:6px;font-size:12px;margin:16px 0}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;margin:16px 0}
        .grid div{background:#f6f6f6;padding:10px;border-radius:6px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#ff6600;color:#fff;text-align:left;padding:8px}
        td{border-bottom:1px solid #eee;padding:8px}
        .tot{margin-left:auto;width:320px;margin-top:14px;font-size:14px}
        .tot div{display:flex;justify-content:space-between;padding:4px 0}
        .tot .final{font-weight:bold;font-size:17px;border-top:2px solid #222;margin-top:6px;padding-top:8px}
        .cufe{word-break:break-all;font-size:11px;color:#555;margin-top:20px}
        button{margin-top:20px;padding:10px 20px;background:#ff6600;color:#fff;border:0;border-radius:6px;cursor:pointer}
        @media print{button{display:none}}
    </style></head><body>
    <header>
        <img src="${location.href.replace(/[^/]*$/, "")}img/logo.png" alt="OnTicket">
        <div style="text-align:right"><h1>Factura electrónica de venta</h1><b>${esc(f.numero)}</b><br><small>${new Date(f.fecha).toLocaleString("es-CO")}</small></div>
    </header>
    <div class="aviso">Representación gráfica de una factura electrónica <b>simulada</b> (proyecto académico). No tiene validez fiscal.</div>
    <div class="grid">
        <div><b>Emisor</b><br>OnTicket S.A.S.<br>Venta de boletería y servicios de entretenimiento</div>
        <div><b>Adquiriente</b><br>${esc(a.nombre)}<br>${esc(a.tipoDoc)} ${esc(a.documento)}${a.dv !== null ? "-" + a.dv : ""}<br>${esc(a.direccion)}, ${esc(a.ciudad)}<br>${esc(a.correo)} ${a.telefono ? "· " + esc(a.telefono) : ""}<br>Persona ${esc(a.tipoPersona)} · ${esc(a.responsabilidad)}</div>
        <div><b>Evento</b><br>${esc(compra.evento)}<br>${esc(compra.fecha)}<br>${esc(compra.lugar)}</div>
        <div><b>Pago</b><br>${esc(compra.metodo)}<br>Código de compra: ${esc(compra.codigo)}</div>
    </div>
    <table><thead><tr><th>Descripción</th><th>Cant.</th><th>Valor unitario</th><th>Total</th></tr></thead><tbody>
        ${filas}
        <tr><td>Cargo por servicio (${CONFIG.feeServicio * 100}%)</td><td>1</td><td>${fmt(compra.servicio)}</td><td>${fmt(compra.servicio)}</td></tr>
    </tbody></table>
    <div class="tot">
        <div><span>Boletería (excluida de IVA)</span><span>${fmt(compra.subtotal)}</span></div>
        <div><span>Cargo por servicio</span><span>${fmt(compra.servicio)}</span></div>
        <div><span>IVA ${CONFIG.ivaServicio * 100}% (sobre servicio)</span><span>${fmt(compra.iva)}</span></div>
        <div class="final"><span>TOTAL</span><span>${fmt(compra.total)}</span></div>
    </div>
    <p class="cufe"><b>CUFE:</b> ${esc(f.cufe)}</p>
    <button onclick="window.print()">Imprimir / Guardar PDF</button>
    </body></html>`);

    w.document.close();
}

function actualizarQR(codigo){

    const qrcode = $("qrcode");

    qrcode.innerHTML = "";

    const img = new Image();

    img.id = "qrImage";

    img.alt = "Código QR";

    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(codigo)}`;

    qrcode.appendChild(img);
}

function iniciarTimerQR(){

    clearInterval(intervaloQR);

    tiempoRestante = 30;

    actualizarTimer();

    intervaloQR = setInterval(() => {

        tiempoRestante--;

        actualizarTimer();

        if(tiempoRestante <= 0){

            clearInterval(intervaloQR);

            actualizarQR(generarCodigoDinamico());

            iniciarTimerQR();
        }

    }, 1000);
}

function actualizarTimer(){

    const timer = $("qrTimer");

    if(!timer) return;

    const minutos = Math.floor(tiempoRestante / 60);

    const segundos = tiempoRestante % 60;

    timer.innerText = `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;

    const circulo = document.querySelector(".progressCircle");

    if(circulo){

        circulo.style.strokeDashoffset = 326 * (1 - tiempoRestante / 30);
    }
}

function cerrarTicket(){

    cerrarModal("ticketModal");

    clearInterval(intervaloQR);
}

function descargarQR(){

    const qrImage = $("qrImage");

    if(!qrImage){

        toast("QR no encontrado", "fa-circle-xmark");

        return;
    }

    const link = document.createElement("a");

    link.href = qrImage.src;

    link.download = "ticketQR.png";

    link.target = "_blank";

    link.click();
}



/* ========================================
   MIS COMPRAS
======================================== */

function abrirMisCompras(){

    if(!currentUser){

        $("authMsg").innerText = "Inicia sesión para ver tus boletas.";

        abrirLogin();

        return;
    }

    renderCompras();

    abrirModal("misComprasModal");
}

function renderCompras(){

    const cont = $("misCompras");

    if(!currentUser || !(currentUser.compras || []).length){

        cont.innerHTML = `
        <div class="emptyState">
            <i class="fa-solid fa-ticket"></i>
            <p>Aún no tienes boletas. ¡Tu próxima experiencia te espera!</p>
        </div>`;

        return;
    }

    cont.innerHTML = currentUser.compras.map((compra, index) => {

        const ev = getEvento(compra.eventoId);

        return `
        <div class="compraGuardada">

            ${ev ? `<img src="${ev.imagen}" alt="">` : `<div class="compraImg"><i class="fa-solid fa-ticket"></i></div>`}

            <div class="compraInfo">
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

    mostrarTicket(currentUser.compras[index]);
}

function eliminarCompra(index){

    if(!confirm("¿Eliminar esta compra? Las ubicaciones quedarán libres de nuevo.")) return;

    const compra = currentUser.compras[index];

    // liberar ubicaciones
    if(compra.eventoId && compra.items){

        const ventas = getVentas(compra.eventoId);

        compra.items.forEach(i => {

            ventas.ids = ventas.ids.filter(id => !i.ids.includes(id));

            if(i.tipo === "general"){

                ventas.general[i.key] = Math.max(0, (ventas.general[i.key] || 0) - i.cantidad);
            }
        });

        saveVentas(compra.eventoId, ventas);
    }

    actualizarComprasUsuario(user => user.compras.splice(index, 1));

    renderCompras();

    if(eventoActual && eventoPage.style.display === "block"){

        renderPlano();

        renderSidebar();
    }
}



/* ========================================
   ADMIN PANEL
======================================== */

function abrirAdminPanel(){

    mostrarPagina(adminPage);

    renderAdminCompras();
}

function renderAdminCompras(){

    let filas = "";

    let totalVentas = 0, totalServicio = 0, compras = 0, facturas = 0;

    getUsers().forEach(user => {

        (user.compras || []).forEach(compra => {

            compras++;

            totalVentas += compra.total;

            totalServicio += (compra.servicio || 0) + (compra.iva || 0);

            if(compra.factura) facturas++;

            filas += `
            <tr class="adminRow">
                <td>${esc(user.name)}<br><small>${esc(user.email)}</small></td>
                <td>${esc(compra.evento || "Andrés Cepeda Tour 2025")}</td>
                <td>${fmt(compra.subtotal ?? compra.total)}</td>
                <td>${fmt((compra.servicio || 0) + (compra.iva || 0))}</td>
                <td><b>${fmt(compra.total)}</b></td>
                <td>${esc(compra.metodo)}</td>
                <td>${compra.factura ? esc(compra.factura.numero) : "—"}</td>
                <td class="mono">${esc(compra.codigo)}</td>
            </tr>`;
        });
    });

    $("adminTableBody").innerHTML = filas || `<tr><td colspan="8">Aún no hay compras.</td></tr>`;

    $("adminStats").innerHTML = `
        <div><small>Ventas totales</small><b>${fmt(totalVentas)}</b></div>
        <div><small>Compras</small><b>${compras}</b></div>
        <div><small>Servicio + IVA</small><b>${fmt(totalServicio)}</b></div>
        <div><small>Facturas electrónicas</small><b>${facturas}</b></div>`;
}

function buscarCompraAdmin(){

    const input = $("searchCompra").value.toLowerCase();

    document.querySelectorAll(".adminRow").forEach(fila => {

        fila.style.display = fila.innerText.toLowerCase().includes(input) ? "" : "none";
    });
}



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

function registrarUsuario(){

    const name = $("registerName").value.trim();

    const email = $("emailInput").value.trim();

    const password = $("passwordInput").value;

    if(!name || !email || !password){

        toast("Completa todos los campos", "fa-triangle-exclamation");

        return;
    }

    const users = getUsers();

    if(users.find(u => u.email === email)){

        toast("Ese correo ya existe", "fa-triangle-exclamation");

        return;
    }

    users.push({ name, email, password, role:"user", compras:[] });

    saveUsers(users);

    toast("Cuenta creada correctamente. Ahora inicia sesión.");

    toggleAuthMode();
}

function iniciarSesion(){

    const email = $("emailInput").value.trim();

    const password = $("passwordInput").value;

    const remember = $("rememberUser").checked;

    const usuario = getUsers().find(u => u.email === email && u.password === password);

    if(!usuario){

        toast("Correo o contraseña incorrectos", "fa-circle-xmark");

        return;
    }

    currentUser = usuario;

    if(remember){

        localStorage.setItem("currentUser", JSON.stringify(usuario));

    }else{

        sessionStorage.setItem("currentUser", JSON.stringify(usuario));
    }

    $("passwordInput").value = "";

    actualizarUsuario();

    const continuar = pendienteCheckout;

    cerrarLogin();

    toast(`¡Hola, ${esc(usuario.name)}!`, "fa-hand");

    if(continuar) abrirCheckout();
}

function cerrarSesion(){

    if(!confirm("¿Cerrar sesión?")) return;

    localStorage.removeItem("currentUser");

    sessionStorage.removeItem("currentUser");

    currentUser = null;

    actualizarUsuario();

    if(adminPage.style.display === "block") volverHome();
}

function actualizarUsuario(){

    currentUser =
        JSON.parse(localStorage.getItem("currentUser")) ||
        JSON.parse(sessionStorage.getItem("currentUser"));

    if(currentUser){

        btnLogin.innerHTML = `<i class="fa-solid fa-user"></i> <span class="userName">${esc(currentUser.name)}</span> <i class="fa-solid fa-right-from-bracket logoutIcon"></i>`;

        btnLogin.title = "Cerrar sesión";

        btnLogin.onclick = cerrarSesion;

        adminBtn.style.display = currentUser.role === "admin" ? "flex" : "none";

    }else{

        btnLogin.innerHTML = `<i class="fa-solid fa-user"></i> <span class="userName">Iniciar sesión</span>`;

        btnLogin.title = "";

        btnLogin.onclick = abrirLogin;

        adminBtn.style.display = "none";
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

actualizarUsuario();

renderCarrusel();

aplicarFiltros();
