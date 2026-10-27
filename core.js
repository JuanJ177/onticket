/* ========================================
   LÓGICA COMPARTIDA (WEB + APP MÓVIL)
   Precios, cobros, estado de venta, dibujo de planos,
   facturación y QR dinámico.
   Requiere: data.js y planos.js
======================================== */



/* ========================================
   UTILIDADES
======================================== */

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



/* ========================================
   EVENTOS Y FECHAS
======================================== */

// Eventos de ejemplo (data.js) por si no hay eventos en la nube
const EVENTOS_EJEMPLO = EVENTOS.map(e => ({ ...e }));

function getEvento(id){

    return EVENTOS.find(e => e.id === id);
}

// Calcula la fecha real del evento. Si ya pasó y CONFIG.moverEventosPasados
// está activo, la corre al año siguiente (eventos de demostración).
function fechaReal(evento){

    if(!evento.fechaISO) return null;

    const f = new Date(evento.fechaISO);

    if(CONFIG.moverEventosPasados){

        const hoy = new Date();

        hoy.setHours(0, 0, 0, 0);

        while(f < hoy) f.setFullYear(f.getFullYear() + 1);
    }

    return f;
}

function capitalizar(t){

    return t.charAt(0).toUpperCase() + t.slice(1);
}

// Completa los textos de fecha y hora a partir de fechaISO
function normalizarEvento(evento){

    const f = fechaReal(evento);

    if(f){

        evento.fechaReal = f;

        evento.fecha = capitalizar(f.toLocaleDateString("es-CO", { weekday:"long", day:"numeric", month:"long", year:"numeric" }));

        evento.hora = f.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" });

        evento.dia = f.getDate();

        evento.mes = f.toLocaleDateString("es-CO", { month:"short" }).replace(".", "").toUpperCase();
    }

    return evento;
}

// Reemplaza la lista de eventos (por ejemplo, con los de Firebase) y los ordena por fecha
function usarEventos(lista){

    const nuevos = lista.map(e => normalizarEvento({ ...e }));

    nuevos.sort((a, b) => (a.fechaReal || 0) - (b.fechaReal || 0));

    EVENTOS.splice(0, EVENTOS.length, ...nuevos);
}

// Eventos que ve el público (los ocultos solo los ve el administrador)
function eventosPublicos(){

    return EVENTOS.filter(e => e.visible !== false);
}

function diasParaEvento(evento){

    if(!evento.fechaReal) return null;

    const hoy = new Date();

    hoy.setHours(0, 0, 0, 0);

    const dia = new Date(evento.fechaReal);

    dia.setHours(0, 0, 0, 0);

    return Math.round((dia - hoy) / 86400000);
}

function faltanTexto(evento){

    const d = diasParaEvento(evento);

    if(d === null) return "";

    if(d <= 0) return "¡Es hoy!";

    if(d === 1) return "¡Es mañana!";

    if(d < 60) return `Faltan ${d} días`;

    return `Faltan ${Math.round(d / 30)} meses`;
}

// Trae los eventos de la nube (los que crea el administrador).
// Guarda una copia en el dispositivo para abrir rápido y sin internet.
// Devuelve true si la lista cambió.
async function sincronizarEventos(){

    const antes = JSON.stringify(EVENTOS.map(e => e.id + e.fechaISO + (e.visible !== false)));

    let lista = null;

    try{

        lista = await DB.cargarEventos();

        try{

            if(lista) localStorage.setItem("eventosCache", JSON.stringify(lista));

            else localStorage.removeItem("eventosCache");

        }catch(e){}

    }catch(e){

        // sin conexión: se usa la última copia guardada
        try{ lista = JSON.parse(localStorage.getItem("eventosCache") || "null"); }catch(x){}
    }

    usarEventos(lista || EVENTOS_EJEMPLO);

    return JSON.stringify(EVENTOS.map(e => e.id + e.fechaISO + (e.visible !== false))) !== antes || !!lista;
}

// al abrir, se muestra la última copia guardada (si hay) mientras llega la nube
try{

    const cache = JSON.parse(localStorage.getItem("eventosCache") || "null");

    usarEventos(cache || EVENTOS);

}catch(e){

    usarEventos(EVENTOS);
}



/* ========================================
   LUGARES Y PRECIOS
======================================== */

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

        return (evento.preciosPuesto && evento.preciosPuesto[zonaId]) || zona.precioPuesto || precioZona(evento, zonaId) / 10;
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

function urlWaze(lugar){

    return `https://waze.com/ul?q=${encodeURIComponent(lugar.mapa)}&navigate=yes`;
}



/* ========================================
   COBROS: boletas + servicio + IVA
======================================== */

function calcularCostos(items){

    const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);

    const servicio = Math.round(subtotal * CONFIG.feeServicio);

    const iva = Math.round(servicio * CONFIG.ivaServicio);

    const personas = items.reduce((s, i) => s + (i.tipo === "general" ? i.cantidad : (i.personas || 1) * i.cantidad), 0);

    return { subtotal, servicio, iva, total: subtotal + servicio + iva, personas };
}



/* ========================================
   ESTADO DE VENTA DE UN EVENTO
   ventas = { ids: [...vendidos], general: { zonaGeneralId: cantidad } }
   (viene de la base de datos: Firebase o localStorage)
======================================== */

function crearEstadoVenta(evento, ventas = {}, reservas = {}, uid = null){

    const plano = planoDe(evento);

    const guardados = new Set(ventas.ids || []);

    const general = ventas.general || {};

    // sillas apartadas por OTRAS personas que están pagando (reserva vigente)
    const ahora = Date.now();

    const holds = (reservas && reservas.holds) || {};

    const apartados = new Set();

    const generalApartado = {};

    Object.entries(holds).forEach(([clave, h]) => {

        if(!h || h.expira <= ahora || h.uid === uid) return;

        if(h.general){

            generalApartado[h.general] = (generalApartado[h.general] || 0) + (h.cantidad || 0);

        }else{

            apartados.add(clave);
        }
    });

    // Ocupación de demostración: cada localidad de cada evento tiene su propio
    // nivel de ventas (como en la vida real, unas zonas se venden más que otras).
    // Se simula con un azar estable; las compras reales se suman encima.
    const tasaZona = zonaId => 0.1 + 0.7 * azar(evento.id + "|zona|" + zonaId);

    const vendidoReal = (id, tasa) => azar(evento.id + "|" + id) < tasa || guardados.has(id);

    const vendido = (id, tasa) => vendidoReal(id, tasa) || apartados.has(id);

    const estado = {

        idGuardado: id => guardados.has(id),

        // apartada por otra persona que está pagando (se pinta distinto a "vendida")
        reservado: id => apartados.has(id) && !guardados.has(id),

        // vendida de verdad o de demostración (sin contar reservas)
        vendidoReal,

        asientoVendido: a => vendido(a.id, tasaZona(a.zona)),

        puestosPalco(p){

            const lista = [];

            for(let n = 1; n <= p.capacidad; n++){

                const id = `${p.id}-${n}`;

                lista.push({ id, n, vendido: vendido(id, tasaZona(p.zona)), reservado: estado.reservado(id) });
            }

            return lista;
        },

        palcoVendido(p){

            if(p.individual){

                return estado.puestosPalco(p).every(x => x.vendido);
            }

            return vendido(p.id, tasaZona(p.zona));
        },

        generalDisponible(g){

            const capacidad = g.capacidad || plano.zonas[g.zona].capacidad;

            const ocupados = Math.floor(capacidad * tasaZona(g.zona) * (0.75 + 0.25 * azar(evento.id + "|" + g.id))) + (general[g.id] || 0) + (generalApartado[g.id] || 0);

            return Math.max(0, capacidad - ocupados);
        },

        disponiblesZona(zonaId){

            let total = 0;

            plano.pisos.forEach(piso => {

                piso.asientos.filter(a => a.zona === zonaId).forEach(a => { if(!estado.asientoVendido(a)) total++; });

                piso.palcos.filter(p => p.zona === zonaId).forEach(p => {

                    if(p.individual){

                        total += estado.puestosPalco(p).filter(x => !x.vendido).length;

                    }else if(!estado.palcoVendido(p)){

                        total += p.capacidad;
                    }
                });

                piso.generales.filter(g => g.zona === zonaId).forEach(g => total += estado.generalDisponible(g));
            });

            return total;
        }
    };

    return estado;
}

function buscarElementoPlano(plano, kind, id){

    for(const piso of plano.pisos){

        const lista = kind === "seat" ? piso.asientos : kind === "palco" ? piso.palcos : piso.generales;

        const el = lista.find(x => x.id === id);

        if(el) return el;
    }

    return null;
}

function pisoDeZona(plano, zonaId){

    return plano.pisos.findIndex(p =>
        p.asientos.some(a => a.zona === zonaId) ||
        p.palcos.some(a => a.zona === zonaId) ||
        p.generales.some(a => a.zona === zonaId));
}



/* ========================================
   DIBUJAR EL PLANO (SVG)
   filtro = { zonas:Set, precioMax, soloDisp, soloInd }
   Devuelve el contenido del <svg> (se dibuja igual en web y app)
======================================== */

function textoVertical(x, y, texto, cls){

    return `<text x="${x}" y="${y}" class="${cls}" transform="rotate(-90 ${x} ${y})" text-anchor="middle" dominant-baseline="middle">${texto}</text>`;
}

function planoSVG(evento, pisoIdx, estado, carrito, filtro){

    const plano = planoDe(evento);

    const piso = plano.pisos[pisoIdx];

    const zonas = plano.zonas;

    const { soloDisp, soloInd } = filtro;

    const zonaVisible = zonaId =>
        (filtro.zonas.size === 0 || filtro.zonas.has(zonaId)) &&
        precioPersona(evento, zonaId) <= filtro.precioMax;

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

        const disp = estado.generalDisponible(g);

        const enCarro = carrito.find(i => i.key === g.id);

        const clases = [
            "ga",
            zonaVisible(g.zona) && !soloInd ? "" : "dim",
            disp ? "" : "sold",
            enCarro ? "sel" : ""
        ].join(" ");

        const tip = `<b>${z.nombre}${g.texto.length === 1 ? " " + g.texto : ""}</b><br>${fmt(precioZona(evento, g.zona))} por persona<br>${disp} disponibles`;

        const grande = g.w > 120;

        html += `<g class="${clases}" data-kind="ga" data-id="${g.id}" data-tip="${esc(tip)}" style="--c:${z.color};--t:${z.texto}">
            <rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="12"/>
            <text x="${g.x + g.w / 2}" y="${g.y + g.h / 2 - (grande ? 8 : 0)}" class="gaText ${grande ? "" : "small"}" text-anchor="middle" dominant-baseline="middle">${g.texto}</text>
            ${grande ? `<text x="${g.x + g.w / 2}" y="${g.y + g.h / 2 + 16}" class="gaSub" text-anchor="middle">${enCarro ? enCarro.cantidad + " en tu compra" : fmt(precioZona(evento, g.zona)) + " · " + disp + " disp."}</text>` : ""}
        </g>`;
    });


    // ----- palcos -----
    piso.palcos.forEach(p => {

        const z = zonas[p.zona];

        const vendido = estado.palcoVendido(p);

        const puestos = p.individual ? estado.puestosPalco(p) : [];

        const libres = puestos.filter(x => !x.vendido).length;

        const enCarro = carrito.filter(i => i.palco === p.id).length;

        const visible = zonaVisible(p.zona) && (!soloInd || p.individual);

        const clases = [
            "palco",
            p.individual ? "ind" : "",
            visible ? "" : "dim",
            vendido ? "sold" : "",
            !p.individual && estado.reservado(p.id) ? "held" : "",
            vendido && soloDisp ? "oculto" : "",
            enCarro ? "sel" : ""
        ].join(" ");

        const tip = p.individual
            ? `<b>${z.nombre} · Palco ${p.num}</b><br><span class="tipInd">Palco individual · venta por puesto</span><br>${fmt(precioPersona(evento, p.zona))} por puesto · ${libres}/10 libres`
            : `<b>${z.nombre} · Palco ${p.num}</b><br>Palco completo · 10 personas<br>${fmt(precioZona(evento, p.zona))}${vendido ? " · Vendido" : ""}`;

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

        const vendido = estado.asientoVendido(a);

        const apartada = estado.reservado(a.id);

        const clases = [
            "seat",
            zonaVisible(a.zona) && !soloInd ? "" : "dim",
            vendido ? "sold" : "",
            apartada ? "held" : "",
            vendido && soloDisp ? "oculto" : "",
            enCarrito.has(a.id) ? "sel" : ""
        ].join(" ");

        const tip = `<b>${z.nombre}</b><br>Fila ${a.fila} · Silla ${a.num}<br>${apartada ? "Alguien la está comprando" : vendido ? "Vendido" : fmt(precioZona(evento, a.zona))}`;

        html += `<g class="${clases}" data-kind="seat" data-id="${a.id}" data-tip="${esc(tip)}" style="--c:${z.color};--t:${z.texto}">
            <circle cx="${a.x}" cy="${a.y}" r="10"/>
            <text x="${a.x}" y="${a.y + 0.5}" text-anchor="middle" dominant-baseline="middle">${a.num}</text>
        </g>`;
    });

    html += `</g>`;

    return html;
}



/* ========================================
   ÍTEMS DEL CARRITO
   (misma estructura en web y app)
======================================== */

function itemAsiento(evento, a){

    const z = planoDe(evento).zonas[a.zona];

    return {
        key: a.id, tipo: "asiento", zona: a.zona,
        etiqueta: `${z.nombre} · Fila ${a.fila} · Silla ${a.num}`,
        corto: `${z.nombre} ${a.fila}${a.num}`,
        precio: precioZona(evento, a.zona),
        cantidad: 1, personas: 1, ids: [a.id], eventoId: evento.id
    };
}

function itemPuesto(evento, p, puesto){

    const z = planoDe(evento).zonas[p.zona];

    return {
        key: puesto.id, tipo: "puesto", palco: p.id, zona: p.zona,
        etiqueta: `${z.nombre} · Palco ${p.num} · Puesto ${puesto.n}`,
        corto: `P${p.num}-${puesto.n}`,
        precio: precioPersona(evento, p.zona),
        cantidad: 1, personas: 1, ids: [puesto.id], eventoId: evento.id
    };
}

function itemPalco(evento, p){

    const z = planoDe(evento).zonas[p.zona];

    return {
        key: p.id, tipo: "palco", palco: p.id, zona: p.zona,
        etiqueta: `${z.nombre} · Palco ${p.num} (10 personas)`,
        corto: `Palco ${p.num}`,
        precio: precioZona(evento, p.zona),
        cantidad: 1, personas: 10, ids: [p.id], eventoId: evento.id
    };
}

function itemGeneral(evento, g, cantidad){

    const z = planoDe(evento).zonas[g.zona];

    const sufijo = g.texto.length === 1 ? " " + g.texto : "";

    return {
        key: g.id, tipo: "general", zona: g.zona,
        etiqueta: `${z.nombre}${sufijo} · ${cantidad} persona${cantidad > 1 ? "s" : ""}`,
        corto: `${z.nombre}${sufijo} x${cantidad}`,
        precio: precioZona(evento, g.zona),
        cantidad, personas: cantidad, ids: [], eventoId: evento.id
    };
}

function tipoItemTexto(i){

    return i.tipo === "palco" ? "Palco completo"
        : i.tipo === "puesto" ? "Palco individual"
        : i.tipo === "general" ? `${fmt(i.precio)} c/u`
        : "Silla numerada";
}



/* ========================================
   COMPRA
======================================== */

function generarCodigoCompra(){

    const tiempo = Math.floor(Date.now() / (1000 * 60));

    const random = Math.floor(Math.random() * 999999);

    return `ONTICKET-${random}-${tiempo}`;
}

// compatibilidad con la versión anterior
function generarCodigoDinamico(){

    return generarCodigoCompra();
}

function crearCompra(evento, carrito, metodo, factura){

    const lugar = lugarDe(evento);

    return {
        codigo: generarCodigoCompra(),
        eventoId: evento.id,
        evento: `${evento.artista} · ${evento.titulo}`,
        fecha: `${evento.fecha} · ${evento.hora}`,
        fechaEvento: evento.fechaReal ? evento.fechaReal.toISOString() : null,
        ingresos: 0,
        lugar: `${lugar.nombre}, ${lugar.ciudad}`,
        items: carrito.map(i => ({ ...i })),
        entradas: carrito.map(i => i.etiqueta),
        ...calcularCostos(carrito),
        metodo,
        fechaCompra: new Date().toISOString(),
        factura: factura || null
    };
}



/* ========================================
   QR DINÁMICO
   El QR cambia cada 30 s: código + ventana de tiempo + firma.
   Así una captura de pantalla vieja no sirve en la entrada.
======================================== */

const QR_PERIODO = 30;

function ventanaQR(){

    return Math.floor(Date.now() / 1000 / QR_PERIODO);
}

function segundosQR(){

    return QR_PERIODO - Math.floor((Date.now() / 1000) % QR_PERIODO);
}

function firmaQR(codigo, v){

    return Math.floor(azar(`${codigo}|${v}|onticket`) * 0xffffff).toString(16).padStart(6, "0");
}

function qrDinamico(codigo){

    const v = ventanaQR();

    return `${codigo}.${v}.${firmaQR(codigo, v)}`;
}



/* ========================================
   VALIDACIÓN DE ENTRADA (TAQUILLA)
======================================== */

// Lee el texto de un QR. Devuelve { codigo, valido, motivo }
//  - QR dinámico:  CODIGO.ventana.firma  (vence en ~1 minuto)
//  - Código escrito a mano: solo CODIGO (validación manual del personal)
function leerQR(texto){

    texto = String(texto || "").trim();

    const partes = texto.split(".");

    if(partes.length === 3){

        const [codigo, v, firma] = partes;

        const actual = ventanaQR();

        const ventana = Number(v);

        if(firmaQR(codigo, ventana) !== firma){

            return { codigo, valido:false, motivo:"El QR no es auténtico (firma inválida)" };
        }

        if(ventana < actual - 2 || ventana > actual + 1){

            return { codigo, valido:false, motivo:"QR vencido: parece una captura de pantalla. Pide abrir la boleta en la app." };
        }

        return { codigo, valido:true, dinamico:true };
    }

    if(/^ONTICKET-\d+-\d+$/i.test(texto)){

        return { codigo: texto.toUpperCase(), valido:true, dinamico:false };
    }

    return { codigo:null, valido:false, motivo:"Este QR no es una boleta de OnTicket" };
}

function personasCompra(compra){

    if(compra.personas) return compra.personas;

    return (compra.items || []).reduce((s, i) => s + (i.tipo === "general" ? i.cantidad : i.personas || 1), 0) || (compra.entradas || []).length || 1;
}

// Busca la compra del QR y dice si puede entrar
async function validarEntrada(texto){

    const qr = leerQR(texto);

    if(!qr.valido) return { ok:false, motivo: qr.motivo, codigo: qr.codigo };

    const compra = await DB.buscarCompra(qr.codigo);

    if(!compra) return { ok:false, motivo:"No existe una compra con este código", codigo: qr.codigo };

    const total = personasCompra(compra);

    const usados = compra.ingresos || 0;

    if(usados >= total){

        const hora = compra.ultimoIngreso ? " · último ingreso " + new Date(compra.ultimoIngreso).toLocaleTimeString("es-CO") : "";

        return { ok:false, compra, total, usados, codigo: qr.codigo, motivo:`Esta boleta ya ingresó completa (${usados} de ${total})${hora}` };
    }

    return { ok:true, compra, total, usados, restantes: total - usados, manual: !qr.dinamico, codigo: qr.codigo };
}



/* ========================================
   ESCÁNER DE QR CON LA CÁMARA (requiere jsQR)
   Devuelve una función para apagar la cámara.
======================================== */

async function iniciarEscaner(video, alLeer){

    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
    });

    video.srcObject = stream;

    video.setAttribute("playsinline", "");

    video.muted = true;

    await video.play();

    const canvas = document.createElement("canvas");

    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    let activo = true;

    let ultimo = "";

    let ultimoTiempo = 0;

    const leer = () => {

        if(!activo) return;

        if(video.readyState >= 2 && video.videoWidth){

            // se analiza una versión reducida (más rápido en celulares)
            const escala = Math.min(1, 640 / video.videoWidth);

            canvas.width = Math.round(video.videoWidth * escala);

            canvas.height = Math.round(video.videoHeight * escala);

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);

            const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });

            // evita procesar el mismo QR muchas veces seguidas
            if(qr && qr.data && (qr.data !== ultimo || Date.now() - ultimoTiempo > 4000)){

                ultimo = qr.data;

                ultimoTiempo = Date.now();

                alLeer(qr.data);
            }
        }

        requestAnimationFrame(leer);
    };

    requestAnimationFrame(leer);

    return () => {

        activo = false;

        stream.getTracks().forEach(t => t.stop());

        video.srcObject = null;
    };
}




/* ========================================
   FACTURACIÓN ELECTRÓNICA
======================================== */

// Dígito de verificación del NIT (algoritmo DIAN)
function digitoVerificacion(nit){

    const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

    const digitos = String(nit).replace(/\D/g, "").split("").reverse();

    const suma = digitos.reduce((s, d, i) => s + Number(d) * (pesos[i] || 0), 0);

    const r = suma % 11;

    return r > 1 ? 11 - r : r;
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

async function crearFactura(numero, adquiriente, total, codigo){

    const fecha = new Date().toISOString();

    return {
        numero,
        fecha,
        adquiriente,
        cufe: await generarCUFE(`${numero}|${fecha}|${total}|${adquiriente.documento}|${codigo}`)
    };
}

// HTML imprimible de la factura (se abre en una ventana nueva)
function htmlFactura(compra, logoUrl){

    const f = compra.factura;

    const a = f.adquiriente;

    const filas = (compra.items || []).map(i => `
        <tr><td>${esc(i.etiqueta)}</td><td>${i.tipo === "general" ? i.cantidad : 1}</td><td>${fmt(i.precio)}</td><td>${fmt(i.precio * i.cantidad)}</td></tr>`).join("");

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(f.numero)}</title>
    <style>
        body{font-family:Arial,sans-serif;color:#222;max-width:800px;margin:30px auto;padding:0 20px}
        header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #ff6600;padding-bottom:14px;gap:10px}
        header img{height:50px}
        h1{font-size:18px;margin:0}
        .aviso{background:#fff4e5;border:1px solid #ffb74d;padding:8px 12px;border-radius:6px;font-size:12px;margin:16px 0}
        .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;font-size:13px;margin:16px 0}
        .grid div{background:#f6f6f6;padding:10px;border-radius:6px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#ff6600;color:#fff;text-align:left;padding:8px}
        td{border-bottom:1px solid #eee;padding:8px}
        .tot{margin-left:auto;max-width:320px;margin-top:14px;font-size:14px}
        .tot div{display:flex;justify-content:space-between;padding:4px 0}
        .tot .final{font-weight:bold;font-size:17px;border-top:2px solid #222;margin-top:6px;padding-top:8px}
        .cufe{word-break:break-all;font-size:11px;color:#555;margin-top:20px}
        button{margin-top:20px;padding:10px 20px;background:#ff6600;color:#fff;border:0;border-radius:6px;cursor:pointer}
        @media print{button{display:none}}
    </style></head><body>
    <header>
        <img src="${logoUrl}" alt="OnTicket">
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
    </body></html>`;
}



/* ========================================
   CORREO DE CONFIRMACIÓN (boletas + factura)
   Se guarda en la colección "correos" de Firebase y la extensión
   "Trigger Email" lo envía (requiere plan Blaze).
======================================== */

function correoCompra(compra, sitio){

    const filas = (compra.items || []).map(i => `<tr><td style="padding:6px 0">${esc(i.etiqueta)}</td><td align="right">${fmt(i.precio * i.cantidad)}</td></tr>`).join("");

    const f = compra.factura;

    return {
        subject: `${f ? "Factura " + f.numero + " · " : ""}Tus boletas para ${compra.evento}`,
        html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222">
            <div style="background:#0e0e12;padding:20px;border-radius:12px 12px 0 0;text-align:center">
                <img src="${sitio}img/logo.png" alt="OnTicket" style="height:40px">
            </div>
            <div style="border:1px solid #eee;border-top:0;padding:24px;border-radius:0 0 12px 12px">
                <h2 style="margin:0 0 4px">¡Tu experiencia está asegurada! 🎉</h2>
                <p style="color:#666;margin:0 0 16px">${esc(compra.evento)}<br>${esc(compra.fecha)}<br>${esc(compra.lugar)}</p>
                <table width="100%" style="font-size:14px;border-collapse:collapse">${filas}
                    <tr><td style="padding:6px 0;color:#666">Cargo por servicio</td><td align="right">${fmt(compra.servicio)}</td></tr>
                    <tr><td style="padding:6px 0;color:#666">IVA sobre el servicio</td><td align="right">${fmt(compra.iva)}</td></tr>
                    <tr><td style="padding:10px 0;font-weight:bold;border-top:2px solid #222">Total</td><td align="right" style="font-weight:bold;border-top:2px solid #222">${fmt(compra.total)}</td></tr>
                </table>
                <p style="background:#fff4e9;padding:12px;border-radius:8px;font-size:14px">
                    Código de compra: <b>${esc(compra.codigo)}</b><br>
                    Para entrar, abre tu boleta en la app o en la web (Mis boletas): el QR cambia cada 30 segundos.
                </p>
                ${f ? `<p style="font-size:13px;color:#666">Factura electrónica <b>${esc(f.numero)}</b> a nombre de ${esc(f.adquiriente.nombre)}<br>CUFE: <span style="word-break:break-all">${esc(f.cufe)}</span></p>` : ""}
                <p style="font-size:12px;color:#999">OnTicket · Vive la mejor experiencia</p>
            </div>
        </div>`
    };
}
