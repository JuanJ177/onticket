/* ========================================
   CLOUD FUNCTIONS DE ONTICKET
   Todo lo que mueve dinero o da acceso al evento se hace aquí,
   en el servidor, y no en el navegador o el celular:

     iniciarPago       prepara la compra y el link de pago de Wompi
     wompiEventos      Wompi avisa el resultado del pago (firma verificada)
     verificarPago     confirma el pago al volver de Wompi
     comprar           venta directa sin pasarela (solo administrador)
     reservar/liberar  aparta las ubicaciones mientras se paga
     eliminarCompra    anula una compra y libera las ubicaciones
     validarBoleta     la taquilla revisa el QR (firma secreta + hora del servidor)
     registrarIngreso  la taquilla marca cuántas personas entraron
     enviarCorreo      envía el correo de boletas / factura (Gmail)
======================================== */

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
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

// Wompi en modo de pruebas (sandbox). La llave pública no es secreta;
// los secretos de integridad y de eventos están en Secret Manager.
const WOMPI_PUBLICA = "pub_test_dLghZ9ZwXMmu497xasxMvzoO5Mq04uzO";
const WOMPI_API = "https://sandbox.wompi.co/v1";
const WOMPI_INTEGRIDAD = defineSecret("WOMPI_INTEGRIDAD");
const WOMPI_EVENTOS = defineSecret("WOMPI_EVENTOS");

// minutos que quedan apartadas las sillas mientras se paga en Wompi
const MINUTOS_PAGO = 20;

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

    if(!["admin", "taquilla", "control"].includes(p.role)) throw falla("permission-denied", "Solo el personal de control de acceso puede validar boletas");

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

const sha256 = t => crypto.createHash("sha256").update(t).digest("hex");

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
   Con Wompi la compra va en dos partes:
     1. iniciarPago: con los precios del catálogo oficial deja la compra
        PENDIENTE (colección "pagos") y aparta las sillas mientras paga.
     2. Cuando Wompi confirma la transacción (aviso firmado o consulta al
        volver), se guarda la compra, se marcan las sillas y sale el correo.
======================================== */

// datos de facturación (si los pidió): se limpian y se recalcula el DV
function limpiarAdquiriente(adq){

    if(!adq) return null;

    const a = {
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

    a.dv = a.tipoDoc === "NIT" ? cat.digitoVerificacion(a.documento) : null;

    if(!a.documento || !a.nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.correo)){

        throw falla("invalid-argument", "Completa los datos de la factura");
    }

    return a;
}

// cuenta boletas individuales (sillas, puestos y general) y palcos completos
function conteoLimite(items){

    return items.reduce((s, i) => {

        if(i.tipo === "palco") s.palcos += i.cantidad || 1;

        else s.boletas += i.tipo === "general" ? i.cantidad : 1;

        return s;

    }, { boletas: 0, palcos: 0 });
}

// Hasta CONFIG.maxBoletasEvento boletas y CONFIG.maxPalcosEvento palcos por evento,
// sumando lo que ya compró. Soporte puede subirlo con un permiso en "limites".
async function revisarLimiteCompra(uid, evento, items){

    const permiso = await db.doc(`limites/${evento.id}__${uid}`).get();

    const p = permiso.exists ? permiso.data() : {};

    const lim = {
        boletas: p.boletas >= 0 ? p.boletas : cat.CONFIG.maxBoletasEvento,
        palcos: p.palcos >= 0 ? p.palcos : cat.CONFIG.maxPalcosEvento
    };

    const previas = (await db.collection("compras").where("uid", "==", uid).where("eventoId", "==", evento.id).get())
        .docs.flatMap(d => d.data().items || []);

    const antes = conteoLimite(previas);

    const total = conteoLimite([...previas, ...items]);

    const ya = n => n ? ` (ya tienes ${n})` : "";

    if(total.palcos > lim.palcos){

        throw falla("resource-exhausted", `Solo puedes comprar ${lim.palcos} ${lim.palcos === 1 ? "palco completo" : "palcos completos"} para este evento${ya(antes.palcos)}. Si deseas comprar más, contacta a soporte.`);
    }

    if(total.boletas > lim.boletas){

        throw falla("resource-exhausted", `Solo puedes comprar ${lim.boletas} boletas individuales para este evento${ya(antes.boletas)}. Si deseas comprar más, contacta a soporte.`);
    }
}

// arma la compra con los precios oficiales (nunca los que manda el cliente)
async function prepararCompra(auth, datos){

    const { eventoId, items: pedidos, factura } = datos || {};

    const evento = await obtenerEvento(eventoId);

    // eventos de promotores: solo se venden cuando el administrador los aprueba
    if(evento.visible === false || (evento.estado && evento.estado !== "aprobado")){

        throw falla("failed-precondition", "Este evento no está a la venta");
    }

    const items = construir(evento, pedidos);

    const adquiriente = limpiarAdquiriente(factura);

    const usuario = await perfil(auth.uid);

    // límite por persona y evento (el administrador no tiene límite)
    if(usuario.role !== "admin") await revisarLimiteCompra(auth.uid, evento, items);

    const lugar = cat.lugarDe(evento);

    const f = cat.fechaReal(evento);

    const compra = {
        codigo: `ONTICKET-${crypto.randomInt(100000, 999999)}-${Math.floor(Date.now() / 60000)}`,
        eventoId: evento.id,
        evento: `${evento.artista} · ${evento.titulo}`,
        fecha: cat.textoFecha(evento),
        fechaEvento: f ? f.toISOString() : null,
        lugar: `${lugar.nombre}, ${lugar.ciudad}`,
        items: items.map(({ capacidad, ...i }) => i),
        entradas: items.map(i => i.etiqueta),
        ...cat.calcularCostos(items),
        metodo: "",
        fechaCompra: null,
        factura: null,
        ingresos: 0,
        uid: auth.uid,
        email: auth.token.email,
        usuario: usuario.name || auth.token.name || auth.token.email,
        // clave secreta de esta boleta: con ella el celular firma el QR dinámico
        claveQR: crypto.randomBytes(16).toString("hex")
    };

    return {
        evento, items, compra, adquiriente,
        pedidos: items.map(i => ({ tipo: i.tipo, key: i.key, cantidad: i.cantidad }))
    };
}

// Dentro de una transacción: revisa el cupo y guarda compra, sillas, factura y correo.
// (Firestore exige leer todo antes de escribir: aquí primero se lee y luego se escribe.)
async function registrarCompra(t, { items, compra, adquiriente }){

    const refV = db.doc(`ventas/${compra.eventoId}`);

    const refR = db.doc(`reservas/${compra.eventoId}`);

    const refContador = db.doc("contadores/facturas");

    const v = await t.get(refV);

    const r = await t.get(refR);

    const cont = adquiriente ? await t.get(refContador) : null;

    const ventas = v.exists ? v.data() : vacioVentas();

    const holds = r.exists ? (r.data().holds || {}) : {};

    revisarDisponibilidad(items, ventas, holds, compra.uid);

    compra.fechaCompra = new Date().toISOString();

    compra.factura = null;

    if(adquiriente){

        const valor = (cont.exists ? cont.data().valor : 1000) + 1;

        const numero = `OTFE-${valor}`;

        compra.factura = {
            numero,
            fecha: compra.fechaCompra,
            adquiriente,
            // CUFE: SHA-384 de los datos de la factura (como lo exige la DIAN)
            cufe: crypto.createHash("sha384").update(`${numero}|${compra.fechaCompra}|${compra.total}|${adquiriente.documento}|${compra.codigo}`).digest("hex")
        };

        t.set(refContador, { valor });
    }

    t.set(refV, aplicarVenta(ventas, items, 1));

    t.set(refR, { holds: holdsVigentes(holds, compra.uid) });

    t.set(db.doc(`compras/${compra.codigo}`), compra);

    t.set(db.collection("correos").doc(), {
        to: [...new Set([compra.email, adquiriente && adquiriente.correo].filter(Boolean))],
        message: correoCompra(compra),
        creado: FieldValue.serverTimestamp()
    });
}

// Venta directa sin pasarela: solo el administrador (por ejemplo, en taquilla).
// Así nadie puede saltarse el pago llamando la función desde el navegador.
exports.comprar = onCall(async request => {

    const auth = exigirUsuario(request);

    if((await perfil(auth.uid)).role !== "admin") throw falla("permission-denied", "Los pagos se hacen con Wompi");

    const metodo = request.data && request.data.metodo;

    if(!METODOS.includes(metodo)) throw falla("invalid-argument", "Método de pago no válido");

    const datos = await prepararCompra(auth, request.data);

    datos.compra.metodo = metodo;

    await db.runTransaction(t => registrarCompra(t, datos));

    return datos.compra;
});


/* ----- 1. iniciar el pago ----- */

// solo se vuelve a la web propia (o al PC del desarrollador en pruebas)
function retornoValido(url){

    try{

        const u = new URL(url);

        return u.protocol === "https:" || ["localhost", "127.0.0.1"].includes(u.hostname);

    }catch(e){

        return false;
    }
}

exports.iniciarPago = onCall({ secrets: [WOMPI_INTEGRIDAD] }, async request => {

    const auth = exigirUsuario(request);

    const retorno = texto(request.data && request.data.retorno, 300);

    if(!retornoValido(retorno)) throw falla("invalid-argument", "Dirección de retorno inválida");

    const { evento, items, compra, adquiriente, pedidos } = await prepararCompra(auth, request.data);

    const referencia = compra.codigo;

    const monto = compra.total * 100;   // Wompi cobra en centavos

    const expira = Date.now() + MINUTOS_PAGO * 60000;

    await db.runTransaction(async t => {

        const refR = db.doc(`reservas/${evento.id}`);

        const v = await t.get(db.doc(`ventas/${evento.id}`));

        const r = await t.get(refR);

        const holds = r.exists ? (r.data().holds || {}) : {};

        revisarDisponibilidad(items, v.exists ? v.data() : vacioVentas(), holds, auth.uid);

        // mientras paga, sus sillas quedan apartadas un poco más
        const nuevos = holdsVigentes(holds, auth.uid);

        items.forEach(i => {

            if(i.tipo === "general") nuevos[`${i.key}#${auth.uid}`] = { uid: auth.uid, expira, general: i.key, cantidad: i.cantidad };

            else i.ids.forEach(id => nuevos[id] = { uid: auth.uid, expira });
        });

        t.set(refR, { holds: nuevos });

        t.set(db.doc(`pagos/${referencia}`), {
            estado: "PENDIENTE",
            uid: auth.uid,
            eventoId: evento.id,
            pedidos,
            compra,
            adquiriente,
            monto,
            creado: new Date().toISOString(),
            expira
        });
    });

    // firma de integridad: Wompi comprueba que el monto no fue cambiado en el camino
    const firma = sha256(`${referencia}${monto}COP${WOMPI_INTEGRIDAD.value().trim()}`);

    const url = new URL("https://checkout.wompi.co/p/");

    url.searchParams.set("public-key", WOMPI_PUBLICA);
    url.searchParams.set("currency", "COP");
    url.searchParams.set("amount-in-cents", String(monto));
    url.searchParams.set("reference", referencia);
    url.searchParams.set("signature:integrity", firma);
    url.searchParams.set("redirect-url", `${retorno}${retorno.includes("?") ? "&" : "?"}pago=${encodeURIComponent(referencia)}`);
    url.searchParams.set("customer-data:email", compra.email);
    url.searchParams.set("customer-data:full-name", compra.usuario);

    return { referencia, url: url.toString(), expira };
});


/* ----- 2. aplicar el resultado de Wompi ----- */

const NOMBRE_METODO = {
    CARD: "Tarjeta", NEQUI: "Nequi", PSE: "PSE", DAVIPLATA: "Daviplata",
    BANCOLOMBIA_TRANSFER: "Bancolombia", BANCOLOMBIA_QR: "QR Bancolombia"
};

// Se puede llamar varias veces con la misma transacción: solo la primera cambia algo.
async function aplicarTransaccion(tx){

    if(!tx || !tx.reference) return { estado: "DESCONOCIDO" };

    const ref = db.doc(`pagos/${tx.reference}`);

    const ahoraISO = new Date().toISOString();

    // el evento se lee antes (fuera de la transacción)
    const previo = await ref.get();

    if(!previo.exists) return { estado: "DESCONOCIDO" };

    const evento = await obtenerEvento(previo.data().eventoId);

    return db.runTransaction(async t => {

        const snap = await t.get(ref);

        const pago = snap.data();

        if(pago.estado !== "PENDIENTE") return { estado: pago.estado, codigo: pago.codigoCompra || null };

        if(tx.status === "PENDING") return { estado: "PENDIENTE" };

        if(tx.status !== "APPROVED"){

            // rechazado, anulado o con error: se liberan sus sillas
            const refR = db.doc(`reservas/${pago.eventoId}`);

            const r = await t.get(refR);

            if(r.exists) t.set(refR, { holds: holdsVigentes(r.data().holds, pago.uid) });

            t.update(ref, { estado: "RECHAZADO", estadoWompi: tx.status, transaccion: tx.id, actualizado: ahoraISO });

            return { estado: "RECHAZADO" };
        }

        if(Number(tx.amount_in_cents) !== pago.monto || tx.currency !== "COP"){

            t.update(ref, { estado: "REVISAR", motivo: "El monto pagado no coincide", transaccion: tx.id, actualizado: ahoraISO });

            return { estado: "REVISAR" };
        }

        const items = construir(evento, pago.pedidos);

        const compra = { ...pago.compra, metodo: `Wompi · ${NOMBRE_METODO[tx.payment_method_type] || tx.payment_method_type || "pago en línea"}`, transaccion: tx.id };

        try{

            await registrarCompra(t, { items, compra, adquiriente: pago.adquiriente });

        }catch(e){

            if(!(e instanceof HttpsError)) throw e;

            // pagó, pero mientras tanto alguien se quedó con la silla: hay que devolver el dinero
            t.update(ref, { estado: "SIN_CUPO", motivo: e.message, transaccion: tx.id, actualizado: ahoraISO });

            return { estado: "SIN_CUPO", motivo: e.message };
        }

        t.update(ref, { estado: "APROBADO", codigoCompra: compra.codigo, transaccion: tx.id, actualizado: ahoraISO });

        return { estado: "APROBADO", codigo: compra.codigo };
    });
}

// Aviso de Wompi (URL de eventos). Solo se acepta si la firma es auténtica.
exports.wompiEventos = onRequest({ secrets: [WOMPI_EVENTOS] }, async (req, res) => {

    if(req.method !== "POST"){

        res.status(405).send("");

        return;
    }

    const ev = req.body || {};

    const firma = ev.signature || {};

    const valor = ruta => ruta.split(".").reduce((o, k) => (o == null ? undefined : o[k]), ev.data);

    const calculada = sha256((firma.properties || []).map(valor).join("") + ev.timestamp + WOMPI_EVENTOS.value().trim());

    if(!firma.checksum || calculada !== String(firma.checksum).toLowerCase()){

        res.status(401).send("firma inválida");

        return;
    }

    if(ev.event === "transaction.updated" && ev.data && ev.data.transaction){

        await aplicarTransaccion(ev.data.transaction);
    }

    res.status(200).send("ok");
});

// Al volver de Wompi: se consulta la transacción directamente a Wompi
// (no se le cree al navegador) por si el aviso aún no ha llegado.
exports.verificarPago = onCall(async request => {

    const id = texto(request.data && request.data.id, 80);

    if(!/^[\w-]+$/.test(id)) throw falla("invalid-argument", "Transacción inválida");

    const r = await fetch(`${WOMPI_API}/transactions/${encodeURIComponent(id)}`);

    if(!r.ok) throw falla("not-found", "Wompi no encontró la transacción");

    return aplicarTransaccion((await r.json()).data);
});



/* ========================================
   PROMOTOR: VENTAS DE SUS EVENTOS
   Solo ve sus propios eventos y nunca los datos personales de
   los compradores (nombre, correo, factura ni clave del QR).
======================================== */

exports.ventasPromotor = onCall(async request => {

    const auth = exigirUsuario(request, false);

    const rol = (await perfil(auth.uid)).role;

    if(rol !== "promotor" && rol !== "admin") throw falla("permission-denied", "Solo para promotores");

    const snap = await db.collection("eventos").where("promotorUid", "==", auth.uid).get();

    const eventos = snap.docs.map(d => ({ ...d.data(), id: d.id }));

    const compras = [];

    // Firestore permite buscar hasta 30 eventos a la vez
    for(let i = 0; i < eventos.length; i += 30){

        const ids = eventos.slice(i, i + 30).map(e => e.id);

        const r = await db.collection("compras").where("eventoId", "in", ids).get();

        r.docs.forEach(d => compras.push(d.data()));
    }

    return {
        eventos: eventos.map(e => {

            const suyas = compras.filter(c => c.eventoId === e.id);

            const zonas = {};

            suyas.forEach(c => (c.items || []).forEach(i => {

                const z = zonas[i.zona] = zonas[i.zona] || { personas: 0, boleteria: 0 };

                z.personas += i.tipo === "general" ? i.cantidad : (i.personas || 1);

                z.boleteria += i.precio * i.cantidad;
            }));

            return {
                id: e.id,
                artista: e.artista,
                titulo: e.titulo,
                estado: e.estado || "aprobado",
                compras: suyas.length,
                personas: suyas.reduce((s, c) => s + personasCompra(c), 0),
                ingresaron: suyas.reduce((s, c) => s + (c.ingresos || 0), 0),
                boleteria: suyas.reduce((s, c) => s + (c.subtotal || 0), 0),
                zonas
            };
        }),
        compras: compras
            .sort((a, b) => String(b.fechaCompra).localeCompare(String(a.fechaCompra)))
            .slice(0, 300)
            .map(c => ({
                codigo: c.codigo,
                eventoId: c.eventoId,
                evento: c.evento,
                fechaCompra: c.fechaCompra,
                ubicaciones: (c.items || []).map(i => i.etiqueta),
                personas: personasCompra(c),
                boleteria: c.subtotal || 0,
                ingresos: c.ingresos || 0
            }))
    };
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
