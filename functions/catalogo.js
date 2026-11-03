/* ========================================
   CATÁLOGO EN EL SERVIDOR
   Carga data.js y planos.js (los mismos de la web y la app)
   y ofrece las funciones de precios, fechas e ítems.
======================================== */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const codigo =
    fs.readFileSync(path.join(__dirname, "catalogo", "data.js"), "utf8") + "\n" +
    fs.readFileSync(path.join(__dirname, "catalogo", "planos.js"), "utf8") + "\n" +
    ";({ CONFIG, LUGARES, EVENTOS, PLANOS, TIPO_ZONA })";

const { CONFIG, LUGARES, EVENTOS, PLANOS, TIPO_ZONA } = vm.runInNewContext(codigo, {});

const ZONA_HORARIA = "America/Bogota";

function planoDe(evento){

    const lugar = LUGARES[evento.lugar];

    if(!lugar) throw new Error("El evento tiene un lugar desconocido");

    return PLANOS[lugar.plano];
}

function precioZona(evento, zonaId){

    return (evento.precios && evento.precios[zonaId]) || planoDe(evento).zonas[zonaId].precio;
}

function precioPuesto(evento, zonaId){

    const zona = planoDe(evento).zonas[zonaId];

    return (evento.preciosPuesto && evento.preciosPuesto[zonaId]) || zona.precioPuesto || precioZona(evento, zonaId) / 10;
}

// fecha real del evento en hora de Colombia (los de demostración pasan al año siguiente)
function fechaReal(evento){

    if(!evento.fechaISO) return null;

    const f = new Date(evento.fechaISO + "-05:00");

    if(CONFIG.moverEventosPasados){

        const hoy = new Date();

        hoy.setUTCHours(5, 0, 0, 0);

        while(f < hoy) f.setUTCFullYear(f.getUTCFullYear() + 1);
    }

    return f;
}

function textoFecha(evento){

    const f = fechaReal(evento);

    if(!f) return "";

    const dia = f.toLocaleDateString("es-CO", { weekday:"long", day:"numeric", month:"long", year:"numeric", timeZone: ZONA_HORARIA });

    const hora = f.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit", timeZone: ZONA_HORARIA });

    return `${dia.charAt(0).toUpperCase() + dia.slice(1)} · ${hora}`;
}

function buscar(plano, lista, id){

    for(const piso of plano.pisos){

        const el = piso[lista].find(x => x.id === id);

        if(el) return el;
    }

    return null;
}

/* Convierte lo que pide el cliente ({ tipo, key, cantidad }) en ítems oficiales,
   con el precio y la etiqueta calculados aquí (el cliente no decide el precio). */
function construirItems(evento, pedidos){

    if(!Array.isArray(pedidos) || !pedidos.length || pedidos.length > 40){

        throw new Error("La compra no tiene ubicaciones válidas");
    }

    const plano = planoDe(evento);

    const vistos = new Set();

    return pedidos.map(p => {

        const key = String(p && p.key || "");

        if(vistos.has(key)) throw new Error("Hay ubicaciones repetidas");

        vistos.add(key);

        if(p.tipo === "asiento"){

            const a = buscar(plano, "asientos", key);

            if(!a) throw new Error("Silla inexistente");

            const z = plano.zonas[a.zona];

            return { key, tipo:"asiento", zona:a.zona, etiqueta:`${z.nombre} · Fila ${a.fila} · Silla ${a.num}`, corto:`${z.nombre} ${a.fila}${a.num}`, precio:precioZona(evento, a.zona), cantidad:1, personas:1, ids:[key], eventoId:evento.id };
        }

        if(p.tipo === "palco"){

            const pa = buscar(plano, "palcos", key);

            if(!pa || pa.individual) throw new Error("Palco inexistente");

            const z = plano.zonas[pa.zona];

            return { key, tipo:"palco", palco:pa.id, zona:pa.zona, etiqueta:`${z.nombre} · Palco ${pa.num} (10 personas)`, corto:`Palco ${pa.num}`, precio:precioZona(evento, pa.zona), cantidad:1, personas:10, ids:[key], eventoId:evento.id };
        }

        if(p.tipo === "puesto"){

            const corte = key.lastIndexOf("-");

            const pa = buscar(plano, "palcos", key.slice(0, corte));

            const n = Number(key.slice(corte + 1));

            if(!pa || !pa.individual || !(n >= 1 && n <= pa.capacidad)) throw new Error("Puesto inexistente");

            const z = plano.zonas[pa.zona];

            return { key, tipo:"puesto", palco:pa.id, zona:pa.zona, etiqueta:`${z.nombre} · Palco ${pa.num} · Puesto ${n}`, corto:`P${pa.num}-${n}`, precio:precioPuesto(evento, pa.zona), cantidad:1, personas:1, ids:[key], eventoId:evento.id };
        }

        if(p.tipo === "general"){

            const g = buscar(plano, "generales", key);

            const cantidad = Math.floor(Number(p.cantidad));

            if(!g) throw new Error("Zona inexistente");

            if(!(cantidad >= 1 && cantidad <= CONFIG.maxGeneral)) throw new Error(`En general se compran de 1 a ${CONFIG.maxGeneral} boletas`);

            const z = plano.zonas[g.zona];

            const sufijo = g.texto.length === 1 ? " " + g.texto : "";

            return { key, tipo:"general", zona:g.zona, etiqueta:`${z.nombre}${sufijo} · ${cantidad} persona${cantidad > 1 ? "s" : ""}`, corto:`${z.nombre}${sufijo} x${cantidad}`, precio:precioZona(evento, g.zona), cantidad, personas:cantidad, ids:[], eventoId:evento.id, capacidad: g.capacidad || z.capacidad };
        }

        throw new Error("Tipo de ubicación desconocido");
    });
}

function calcularCostos(items){

    const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);

    const servicio = Math.round(subtotal * CONFIG.feeServicio);

    const iva = Math.round(servicio * CONFIG.ivaServicio);

    const personas = items.reduce((s, i) => s + (i.tipo === "general" ? i.cantidad : (i.personas || 1) * i.cantidad), 0);

    return { subtotal, servicio, iva, total: subtotal + servicio + iva, personas };
}

function digitoVerificacion(nit){

    const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

    const digitos = String(nit).replace(/\D/g, "").split("").reverse();

    const suma = digitos.reduce((s, d, i) => s + Number(d) * (pesos[i] || 0), 0);

    const r = suma % 11;

    return r > 1 ? 11 - r : r;
}

module.exports = {
    CONFIG, LUGARES, EVENTOS, PLANOS, TIPO_ZONA,
    planoDe, precioZona, precioPuesto, fechaReal, textoFecha,
    construirItems, calcularCostos, digitoVerificacion
};
