/* ========================================
   CLOUD FUNCTIONS DE ONTICKET
   Todo lo que mueve dinero o da acceso al evento se hace aquí,
   en el servidor, y no en el navegador o el celular:

     comprar           calcula precios, valida disponibilidad y guarda la compra
     reservar/liberar  aparta las ubicaciones mientras se paga
     eliminarCompra    anula una compra y libera las ubicaciones
     validarBoleta     la taquilla revisa el QR (firma secreta + hora del servidor)
     registrarIngreso  la taquilla marca cuántas personas entraron
     enviarCorreo      envía el correo de boletas / factura (Gmail)
======================================== */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const cat = require("./catalogo");

admin.initializeApp();

const db = admin.firestore();

// São Paulo (la más cercana a Colombia) y máximo 5 instancias: limita el gasto
setGlobalOptions({ region: "southamerica-east1", maxInstances: 5 });

// la contraseña de aplicación de Gmail se guarda cifrada en Secret Manager
const GMAIL_CLAVE = defineSecret("GMAIL_CLAVE");

const GMAIL_USUARIO = "onticket.co@gmail.com";

const METODOS = ["Nequi", "Daviplata", "PSE", "Visa", "Mastercard"];

const QR_PERIODO = 30;



/* ========================================
   AYUDANTES
======================================== */

function falla(codigo, mensaje){

    return new HttpsError(codigo, mensaje);
}

// el usuario debe haber iniciado sesión (y, para comprar, con correo verificado)
function exigirUsuario(request, conCorreoVerificado = true){

    if(!request.auth) throw falla("unauthenticated", "Debes iniciar sesión");

    if(conCorreoVerificado && !request.auth.token.email_verified){

        throw falla("failed-precondition", "Verifica tu correo para poder comprar");
    }

    return request.auth;
}

async function perfil(uid){

    const snap = await db.doc(`usuarios/${uid}`).get();

    return snap.exists ? snap.data() : {};
}

async function exigirStaff(request){

    const auth = exigirUsuario(request, false);

    const p = await perfil(auth.uid);

    if(!["admin", "taquilla"].includes(p.role)) throw falla("permission-denied", "Solo el personal de taquilla puede validar boletas");

    return { auth, perfil: p };
}

// evento oficial: el de la nube, o el de ejemplo si aún no hay eventos en la nube
async function obtenerEvento(id){

    if(typeof id !== "string" || !id || id.length > 80) throw falla("invalid-argument", "Evento inválido");

    const snap = await db.doc(`eventos/${id}`).get();

    if(snap.exists) return { ...snap.data(), id };

    const alguno = await db.collection("eventos").limit(1).get();

    const ejemplo = alguno.empty && cat.EVENTOS.find(e => e.id === id);

    if(!ejemplo) throw falla("not-found", "El evento no existe");

    return { ...ejemplo };
}

function construir(evento, pedidos){

    try{

        return cat.construirItems(evento, pedidos);

    }catch(e){

        throw falla("invalid-argument", e.message);
    }
}

function vacioVentas(){

    return { ids: [], general: {} };
}

function holdsVigentes(holds, uidQuitar){

    const ahora = Date.now();

    const limpio = {};

    Object.entries(holds || {}).forEach(([k, h]) => {

        if(h && h.expira > ahora && h.uid !== uidQuitar) limpio[k] = h;
    });

    return limpio;
}

// revisa que nada esté vendido ni apartado por otra persona y que haya cupo en general
function revisarDisponibilidad(items, ventas, holds, uid){

    const vendidos = new Set(ventas.ids || []);

    const ahora = Date.now();

    for(const i of items){

        if(i.ids.some(id => vendidos.has(id))){

            throw falla("already-exists", `Alguien acaba de comprar ${i.etiqueta}. Elige otra ubicación.`);
        }

        if(i.ids.some(id => holds[id] && holds[id].uid !== uid && holds[id].expira > ahora)){

            throw falla("aborted", `${i.etiqueta} la está comprando otra persona. Elige otra ubicación.`);
        }

        if(i.tipo === "general"){

            const apartadosOtros = Object.values(holds)
                .filter(h => h.general === i.key && h.uid !== uid && h.expira > ahora)
                .reduce((s, h) => s + (h.cantidad || 0), 0);

            const libres = i.capacidad - ((ventas.general || {})[i.key] || 0) - apartadosOtros;

            if(i.cantidad > libres) throw falla("resource-exhausted", `Solo quedan ${Math.max(0, libres)} boletas en esa zona`);
        }
    }
}

function aplicarVenta(ventas, items, signo){

    const ids = new Set(ventas.ids || []);

    const general = { ...(ventas.general || {}) };

    items.forEach(i => {

        (i.ids || []).forEach(id => signo > 0 ? ids.add(id) : ids.delete(id));

        if(i.tipo === "general"){

            general[i.key] = Math.max(0, (general[i.key] || 0) + signo * i.cantidad);
        }
    });

    return { ids: [...ids], general };
}

const texto = (v, max = 120) => String(v ?? "").trim().slice(0, max);

const fmt = v => "$" + Math.round(v).toLocaleString("es-CO");

const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

// firma del QR dinámico: HMAC con la clave secreta de cada compra
function firmaQR(claveQR, codigo, ventana){

    return crypto.createHmac("sha256", Buffer.from(claveQR, "hex")).update(`${codigo}|${ventana}`).digest("hex").slice(0, 10);
}

// firma de las compras antiguas (antes de las Cloud Functions)
function firmaAntigua(codigo, v){

    let h = 2166136261;

    const t = `${codigo}|${v}|onticket`;

    for(let i = 0; i < t.length; i++){

        h ^= t.charCodeAt(i);

        h = Math.imul(h, 16777619);
    }

    return Math.floor((((h >>> 0) % 10000) / 10000) * 0xffffff).toString(16).padStart(6, "0");
}

function personasCompra(c){

    if(c.personas) return c.personas;

    return (c.items || []).reduce((s, i) => s + (i.tipo === "general" ? i.cantidad : i.personas || 1), 0) || (c.entradas || []).length || 1;
}

// lo que la taquilla puede ver de una compra (sin la clave del QR)
function resumenCompra(c){

    return {
        codigo: c.codigo, evento: c.evento, fecha: c.fecha, lugar: c.lugar,
        usuario: c.usuario, email: c.email, items: c.items || [],
        personas: personasCompra(c), ingresos: c.ingresos || 0, ultimoIngreso: c.ultimoIngreso || null
    };
}



/* ========================================
   RESERVAR / LIBERAR (sillas apartadas mientras se paga)
======================================== */

exports.reservar = onCall(async request => {

    const auth = exigirUsuario(request);

    const { eventoId, items: pedidos } = request.data || {};

    const minutos = Math.min(Math.max(Number(request.data && request.data.minutos) || cat.CONFIG.minutosReserva, 0.1), cat.CONFIG.minutosReserva);

    const evento = await obtenerEvento(eventoId);

    const items = construir(evento, pedidos);

    const expira = Date.now() + minutos * 60000;

    await db.runTransaction(async t => {

        const v = await t.get(db.doc(`ventas/${evento.id}`));

        const r = await t.get(db.doc(`reservas/${evento.id}`));

        const ventas = v.exists ? v.data() : vacioVentas();

        const holds = r.exists ? (r.data().holds || {}) : {};

        revisarDisponibilidad(items, ventas, holds, auth.uid);

        const nuevos = holdsVigentes(holds, auth.uid);

        items.forEach(i => {

            if(i.tipo === "general") nuevos[`${i.key}#${auth.uid}`] = { uid: auth.uid, expira, general: i.key, cantidad: i.cantidad };

            else i.ids.forEach(id => nuevos[id] = { uid: auth.uid, expira });
        });

        t.set(db.doc(`reservas/${evento.id}`), { holds: nuevos });
    });

    return { expira };
});

exports.liberar = onCall(async request => {

    const auth = exigirUsuario(request, false);

    const eventoId = texto(request.data && request.data.eventoId, 80);

    if(!eventoId) return { ok: true };

    const ref = db.doc(`reservas/${eventoId}`);

    await db.runTransaction(async t => {

        const r = await t.get(ref);

        if(r.exists) t.set(ref, { holds: holdsVigentes(r.data().holds, auth.uid) });
    });

    return { ok: true };
});



/* ========================================
   COMPRAR
======================================== */

exports.comprar = onCall(async request => {

    const auth = exigirUsuario(request);

    const { eventoId, items: pedidos, metodo, factura: adq } = request.data || {};

    if(!METODOS.includes(metodo)) throw falla("invalid-argument", "Método de pago no válido");

    const evento = await obtenerEvento(eventoId);

    if(evento.visible === false) throw falla("failed-precondition", "Este evento no está a la venta");

    const items = construir(evento, pedidos);

    const costos = cat.calcularCostos(items);

    const lugar = cat.LUGARES[evento.lugar];

    const usuario = await perfil(auth.uid);

    // datos de facturación (si los pidió): se limpian y se recalcula el DV
    let adquiriente = null;

    if(adq){

        adquiriente = {
            tipoPersona: adq.tipoPersona === "Jurídica" ? "Jurídica" : "Natural",
            tipoDoc: ["CC", "CE", "NIT", "PP"].includes(adq.tipoDoc) ? adq.tipoDoc : "CC",
            documento: texto(adq.documento, 20),
            nombre: texto(adq.nombre),
            correo: texto(adq.correo),
            telefono: texto(adq.telefono, 30),
            direccion: texto(adq.direccion),
            ciudad: texto(adq.ciudad, 60),
            responsabilidad: texto(adq.responsabilidad, 20) || "R-99-PN"
        };

        adquiriente.dv = adquiriente.tipoDoc === "NIT" ? cat.digitoVerificacion(adquiriente.documento) : null;

        if(!adquiriente.documento || !adquiriente.nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adquiriente.correo)){

            throw falla("invalid-argument", "Completa los datos de la factura");
        }
    }

    const codigo = `ONTICKET-${crypto.randomInt(100000, 999999)}-${Math.floor(Date.now() / 60000)}`;

    const fechaCompra = new Date().toISOString();

    const f = cat.fechaReal(evento);

    const compra = {
        codigo,
        eventoId: evento.id,
        evento: `${evento.artista} · ${evento.titulo}`,
        fecha: cat.textoFecha(evento),
        fechaEvento: f ? f.toISOString() : null,
        lugar: `${lugar.nombre}, ${lugar.ciudad}`,
        items: items.map(({ capacidad, ...i }) => i),
        entradas: items.map(i => i.etiqueta),
        ...costos,
        metodo,
        fechaCompra,
        factura: null,
        ingresos: 0,
        uid: auth.uid,
        email: auth.token.email,
        usuario: usuario.name || auth.token.name || auth.token.email,
        // clave secreta de esta boleta: con ella el celular firma el QR dinámico
        claveQR: crypto.randomBytes(16).toString("hex")
    };

    const refCompra = db.doc(`compras/${codigo}`);

    const refCorreo = db.collection("correos").doc();

    await db.runTransaction(async t => {

        const refV = db.doc(`ventas/${evento.id}`);

        const refR = db.doc(`reservas/${evento.id}`);

        const refContador = db.doc("contadores/facturas");

        const v = await t.get(refV);

        const r = await t.get(refR);

        const cont = adquiriente ? await t.get(refContador) : null;

        const ventas = v.exists ? v.data() : vacioVentas();

        const holds = r.exists ? (r.data().holds || {}) : {};

        revisarDisponibilidad(items, ventas, holds, auth.uid);

        if(adquiriente){

            const valor = (cont.exists ? cont.data().valor : 1000) + 1;

            const numero = `OTFE-${valor}`;

            compra.factura = {
                numero,
                fecha: fechaCompra,
                adquiriente,
                // CUFE: SHA-384 de los datos de la factura (como lo exige la DIAN)
                cufe: crypto.createHash("sha384").update(`${numero}|${fechaCompra}|${compra.total}|${adquiriente.documento}|${codigo}`).digest("hex")
            };

            t.set(refContador, { valor });
        }

        t.set(refV, aplicarVenta(ventas, items, 1));

        t.set(refR, { holds: holdsVigentes(holds, auth.uid) });

        t.set(refCompra, compra);

        t.set(refCorreo, {
            to: [...new Set([compra.email, adquiriente && adquiriente.correo].filter(Boolean))],
            message: correoCompra(compra),
            creado: FieldValue.serverTimestamp()
        });
    });

    return compra;
});



/* ========================================
   ANULAR UNA COMPRA (dueño, si nadie ha entrado; o admin)
======================================== */

exports.eliminarCompra = onCall(async request => {

    const auth = exigirUsuario(request, false);

    const codigo = texto(request.data && request.data.codigo, 60);

    const ref = db.doc(`compras/${codigo}`);

    const esAdmin = (await perfil(auth.uid)).role === "admin";

    await db.runTransaction(async t => {

        const snap = await t.get(ref);

        if(!snap.exists) throw falla("not-found", "La compra no existe");

        const c = snap.data();

        if(c.uid !== auth.uid && !esAdmin) throw falla("permission-denied", "No puedes anular esta compra");

        if((c.ingresos || 0) > 0 && !esAdmin) throw falla("failed-precondition", "No se puede anular una boleta que ya se usó");

        const refV = db.doc(`ventas/${c.eventoId}`);

        const v = await t.get(refV);

        if(v.exists && c.items) t.set(refV, aplicarVenta(v.data(), c.items, -1));

        t.delete(ref);
    });

    return { ok: true };
});



/* ========================================
   TAQUILLA: VALIDAR EL QR
   La firma se revisa aquí con la clave secreta de la compra
   y con la hora del servidor (nadie la puede falsificar).
======================================== */

exports.validarBoleta = onCall(async request => {

    await exigirStaff(request);

    const leido = texto(request.data && request.data.texto, 200);

    const partes = leido.split(".");

    let codigo = null, dinamico = false;

    if(partes.length === 3){

        codigo = partes[0];

        dinamico = true;

    }else if(/^ONTICKET-\d+-\d+$/i.test(leido)){

        codigo = leido.toUpperCase();

    }else{

        return { ok: false, motivo: "Este QR no es una boleta de OnTicket" };
    }

    const snap = await db.doc(`compras/${codigo}`).get();

    if(!snap.exists) return { ok: false, codigo, motivo: "No existe una compra con este código" };

    const c = snap.data();

    if(dinamico){

        const ventana = Number(partes[1]);

        const firma = partes[2];

        const correcta = c.claveQR ? firmaQR(c.claveQR, codigo, ventana) : firmaAntigua(codigo, ventana);

        if(!crypto.timingSafeEqual(Buffer.from(firma.padEnd(10)), Buffer.from(correcta.padEnd(10)))){

            return { ok: false, codigo, motivo: "El QR no es auténtico (firma inválida)" };
        }

        const actual = Math.floor(Date.now() / 1000 / QR_PERIODO);

        if(ventana < actual - 3 || ventana > actual + 3){

            return { ok: false, codigo, motivo: "QR vencido: parece una captura de pantalla. Pide abrir la boleta en la app." };
        }
    }

    const total = personasCompra(c);

    const usados = c.ingresos || 0;

    if(usados >= total){

        const hora = c.ultimoIngreso ? " · último ingreso " + new Date(c.ultimoIngreso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota" }) : "";

        return { ok: false, codigo, compra: resumenCompra(c), total, usados, motivo: `Esta boleta ya ingresó completa (${usados} de ${total})${hora}` };
    }

    return { ok: true, codigo, compra: resumenCompra(c), total, usados, restantes: total - usados, manual: !dinamico };
});



/* ========================================
   TAQUILLA: REGISTRAR INGRESO
======================================== */

exports.registrarIngreso = onCall(async request => {

    const { auth } = await exigirStaff(request);

    const codigo = texto(request.data && request.data.codigo, 60);

    const n = Math.floor(Number(request.data && request.data.n));

    if(!(n >= 1 && n <= 100)) throw falla("invalid-argument", "Cantidad inválida");

    const ref = db.doc(`compras/${codigo}`);

    return db.runTransaction(async t => {

        const snap = await t.get(ref);

        if(!snap.exists) throw falla("not-found", "La compra no existe");

        const c = snap.data();

        const total = personasCompra(c);

        const usados = c.ingresos || 0;

        if(usados + n > total) throw falla("failed-precondition", `Solo quedan ${total - usados} ingresos para esta boleta`);

        const cambio = { ingresos: usados + n, ultimoIngreso: new Date().toISOString(), ultimoIngresoPor: auth.token.email || "" };

        t.update(ref, cambio);

        return resumenCompra({ ...c, ...cambio });
    });
});



/* ========================================
   CORREOS (boletas + factura) con Gmail
======================================== */

function correoCompra(compra){

    const sitio = cat.CONFIG.sitioWeb || "";

    const filas = compra.items.map(i => `<tr><td style="padding:6px 0">${esc(i.etiqueta)}</td><td align="right">${fmt(i.precio * i.cantidad)}</td></tr>`).join("");

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
                ${f ? `<p style="font-size:13px;color:#666">Factura electrónica <b>${esc(f.numero)}</b> a nombre de ${esc(f.adquiriente.nombre)}<br>CUFE: <span style="word-break:break-all">${esc(f.cufe)}</span><br><i>Factura simulada (proyecto académico), sin validez fiscal.</i></p>` : ""}
                <p style="font-size:12px;color:#999">OnTicket · Vive la mejor experiencia${sitio ? ` · <a href="${sitio}">${esc(sitio.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : ""}</p>
            </div>
        </div>`
    };
}

exports.enviarCorreo = onDocumentCreated({ document: "correos/{id}", secrets: [GMAIL_CLAVE] }, async event => {

    const snap = event.data;

    if(!snap) return;

    const correo = snap.data();

    // solo se procesa una vez (si ya tiene resultado, no se reenvía)
    if(correo.delivery) return;

    try{

        const transporte = nodemailer.createTransport({
            service: "gmail",
            auth: { user: GMAIL_USUARIO, pass: GMAIL_CLAVE.value().replace(/\s/g, "") }
        });

        const info = await transporte.sendMail({
            from: `OnTicket <${GMAIL_USUARIO}>`,
            replyTo: GMAIL_USUARIO,
            to: correo.to,
            subject: correo.message.subject,
            html: correo.message.html
        });

        await snap.ref.update({ delivery: { estado: "ENVIADO", fecha: new Date().toISOString(), id: info.messageId || "" } });

    }catch(e){

        await snap.ref.update({ delivery: { estado: "ERROR", fecha: new Date().toISOString(), error: String(e.message).slice(0, 300) } });
    }
});
