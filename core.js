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
   EVENTOS, LUGARES Y PRECIOS
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

function crearEstadoVenta(evento, ventas = {}){

    const plano = planoDe(evento);

    const guardados = new Set(ventas.ids || []);

    const general = ventas.general || {};

    // las sillas "vendidas" de ejemplo se simulan con un azar estable
    const vendido = (id, tasa) => azar(evento.id + "|" + id) < tasa || guardados.has(id);

    const estado = {

        idGuardado: id => guardados.has(id),

        asientoVendido: a => vendido(a.id, 0.2),

        puestosPalco(p){

            const lista = [];

            for(let n = 1; n <= p.capacidad; n++){

                const id = `${p.id}-${n}`;

                lista.push({ id, n, vendido: vendido(id, 0.35) });
            }

            return lista;
        },

        palcoVendido(p){

            if(p.individual){

                return estado.puestosPalco(p).every(x => x.vendido);
            }

            return vendido(p.id, 0.3);
        },

        generalDisponible(g){

            const capacidad = g.capacidad || plano.zonas[g.zona].capacidad;

            const ocupados = Math.floor(capacidad * 0.55 * azar(evento.id + "|" + g.id)) + (general[g.id] || 0);

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

        const clases = [
            "seat",
            zonaVisible(a.zona) && !soloInd ? "" : "dim",
            vendido ? "sold" : "",
            vendido && soloDisp ? "oculto" : "",
            enCarrito.has(a.id) ? "sel" : ""
        ].join(" ");

        const tip = `<b>${z.nombre}</b><br>Fila ${a.fila} · Silla ${a.num}<br>${vendido ? "Vendido" : fmt(precioZona(evento, a.zona))}`;

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

function qrDinamico(codigo){

    const v = ventanaQR();

    const firma = Math.floor(azar(`${codigo}|${v}|onticket`) * 0xffffff).toString(16).padStart(6, "0");

    return `${codigo}.${v}.${firma}`;
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
