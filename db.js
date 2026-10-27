/* ========================================
   CAPA DE DATOS (WEB + APP MÓVIL)

   - Si firebase-config.js tiene credenciales, usa Firebase:
       Authentication (correo/contraseña y Google) + Firestore
       → la web y la app comparten cuentas, eventos, compras y
         sillas vendidas en tiempo real.
   - Si no (o con ?modo=local en la URL), usa localStorage.

   Colecciones de Firestore:
     usuarios/{uid}        { name, email, role: user | taquilla | admin }
     eventos/{id}          { artista, titulo, fechaISO, lugar, precios, ... }
     compras/{codigo}      { uid, ...compra, ingresos, ultimoIngreso }
     ventas/{eventoId}     { ids:[...], general:{ zonaId: cantidad } }
     reservas/{eventoId}   { holds:{ id: { uid, expira, general?, cantidad? } } }
     contadores/facturas   { valor }
     correos/{id}          { to, message:{ subject, html } }  (extensión Trigger Email)
======================================== */

const DB = (() => {

    const forzarLocal = /[?&]modo=local\b/.test(location.search);

    const usarFirebase =
        !forzarLocal &&
        typeof firebase !== "undefined" &&
        typeof FIREBASE_CONFIG !== "undefined" &&
        FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey;

    // Firestore no acepta "undefined": se limpia el objeto antes de guardarlo
    const limpiar = obj => JSON.parse(JSON.stringify(obj));

    const ordenar = lista => lista.sort((a, b) => (b.fechaCompra || "").localeCompare(a.fechaCompra || ""));

    const vacioVentas = () => ({ ids: [], general: {} });


    /* ----- reglas de negocio comunes a los dos modos ----- */

    function conflicto(ventas, compra){

        const vendidos = new Set(ventas.ids || []);

        const ocupado = compra.items.find(i => i.ids.some(id => vendidos.has(id)));

        if(ocupado){

            throw new Error(`Alguien acaba de comprar ${ocupado.etiqueta}. Elige otra ubicación.`);
        }
    }

    function aplicarVenta(ventas, compra, signo){

        const ids = new Set(ventas.ids || []);

        const general = { ...(ventas.general || {}) };

        compra.items.forEach(i => {

            i.ids.forEach(id => signo > 0 ? ids.add(id) : ids.delete(id));

            if(i.tipo === "general"){

                general[i.key] = Math.max(0, (general[i.key] || 0) + signo * i.cantidad);
            }
        });

        return { ids: [...ids], general };
    }

    // quita reservas vencidas y (opcional) las de un usuario
    function limpiarHolds(holds, uidQuitar){

        const ahora = Date.now();

        const limpio = {};

        Object.entries(holds || {}).forEach(([k, h]) => {

            if(h && h.expira > ahora && h.uid !== uidQuitar) limpio[k] = h;
        });

        return limpio;
    }

    function holdAjeno(holds, items, uid){

        const ahora = Date.now();

        return items.find(i => i.ids.some(id => holds[id] && holds[id].uid !== uid && holds[id].expira > ahora));
    }

    function agregarHolds(holds, items, uid, expira){

        items.forEach(i => {

            if(i.tipo === "general"){

                holds[`${i.key}#${uid}`] = { uid, expira, general: i.key, cantidad: i.cantidad };

            }else{

                i.ids.forEach(id => holds[id] = { uid, expira });
            }
        });

        return holds;
    }

    function registrarIngresoEn(compra, n, por){

        const total = personasCompra(compra);

        const usados = compra.ingresos || 0;

        if(usados + n > total) throw new Error(`Solo quedan ${total - usados} ingresos para esta boleta`);

        return { ingresos: usados + n, ultimoIngreso: new Date().toISOString(), ultimoIngresoPor: por || "" };
    }



    /* ========================================
       MODO FIREBASE
    ======================================== */

    function crearFirebase(){

        firebase.initializeApp(FIREBASE_CONFIG);

        const auth = firebase.auth();

        const fs = firebase.firestore();

        auth.languageCode = "es";

        let usuario = null;

        const errores = {
            "auth/email-already-in-use": "Ese correo ya tiene una cuenta",
            "auth/invalid-email": "El correo no es válido",
            "auth/weak-password": "La contraseña debe tener al menos 6 caracteres",
            "auth/invalid-credential": "Correo o contraseña incorrectos",
            "auth/wrong-password": "Correo o contraseña incorrectos",
            "auth/user-not-found": "No hay una cuenta con ese correo",
            "auth/missing-email": "Escribe tu correo",
            "auth/too-many-requests": "Demasiados intentos. Espera un momento",
            "auth/network-request-failed": "Sin conexión a internet",
            "auth/popup-closed-by-user": "Cerraste la ventana de Google",
            "auth/popup-blocked": "El navegador bloqueó la ventana de Google",
            "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados)",
            "auth/operation-not-allowed": "Este método de inicio de sesión no está habilitado en Firebase",
            "permission-denied": "No tienes permiso para esta acción"
        };

        const traducir = e => new Error(errores[e.code] || e.message);

        async function perfil(u){

            const ref = fs.doc(`usuarios/${u.uid}`);

            let datos = {};

            try{

                const snap = await ref.get();

                if(snap.exists){

                    datos = snap.data();

                }else{

                    // primera vez (por ejemplo con Google): se crea el perfil
                    datos = { name: u.displayName || u.email.split("@")[0], email: u.email, role: "user" };

                    await ref.set({ ...datos, creado: firebase.firestore.FieldValue.serverTimestamp() });
                }

            }catch(e){}

            return {
                uid: u.uid,
                email: u.email,
                name: datos.name || u.displayName || u.email.split("@")[0],
                role: datos.role || "user",
                verificado: u.emailVerified
            };
        }

        const urlRetorno = () => location.protocol.startsWith("http") && !location.hostname.match(/^localhost$|^127\./) ? location.origin + location.pathname : undefined;

        return {

            modo: "firebase",

            usuario: () => usuario,

            onUsuario(cb){

                return auth.onAuthStateChanged(async u => {

                    usuario = u ? await perfil(u) : null;

                    cb(usuario);
                });
            },

            async registrar(name, email, password){

                try{

                    const cred = await auth.createUserWithEmailAndPassword(email, password);

                    await cred.user.updateProfile({ displayName: name });

                    await fs.doc(`usuarios/${cred.user.uid}`).set({
                        name, email, role: "user",
                        creado: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    // correo real: se envía un enlace para verificarlo
                    const url = urlRetorno();

                    await cred.user.sendEmailVerification(url ? { url } : undefined);

                    usuario = { uid: cred.user.uid, email, name, role: "user", verificado: false };

                    return usuario;

                }catch(e){

                    throw traducir(e);
                }
            },

            async login(email, password, recordar = true){

                try{

                    await auth.setPersistence(recordar
                        ? firebase.auth.Auth.Persistence.LOCAL
                        : firebase.auth.Auth.Persistence.SESSION);

                    const cred = await auth.signInWithEmailAndPassword(email, password);

                    usuario = await perfil(cred.user);

                    return usuario;

                }catch(e){

                    throw traducir(e);
                }
            },

            // Solo en navegador (en la app nativa Google bloquea la ventana emergente)
            async loginGoogle(){

                try{

                    const proveedor = new firebase.auth.GoogleAuthProvider();

                    proveedor.setCustomParameters({ prompt: "select_account" });

                    const cred = await auth.signInWithPopup(proveedor);

                    usuario = await perfil(cred.user);

                    return usuario;

                }catch(e){

                    throw traducir(e);
                }
            },

            async recuperarClave(email){

                try{

                    const url = urlRetorno();

                    await auth.sendPasswordResetEmail(email, url ? { url } : undefined);

                }catch(e){

                    throw traducir(e);
                }
            },

            async reenviarVerificacion(){

                try{

                    const url = urlRetorno();

                    await auth.currentUser.sendEmailVerification(url ? { url } : undefined);

                }catch(e){

                    throw traducir(e);
                }
            },

            // vuelve a consultar si el correo ya fue verificado
            async refrescarUsuario(){

                if(!auth.currentUser) return null;

                await auth.currentUser.reload();

                await auth.currentUser.getIdToken(true);

                usuario = await perfil(auth.currentUser);

                return usuario;
            },

            async logout(){

                await auth.signOut();
            },


            /* ----- eventos ----- */

            async cargarEventos(){

                const snap = await fs.collection("eventos").get();

                return snap.empty ? null : snap.docs.map(d => ({ ...d.data(), id: d.id }));
            },

            async guardarEvento(evento){

                await fs.doc(`eventos/${evento.id}`).set(limpiar(evento));
            },

            async eliminarEvento(id){

                await fs.doc(`eventos/${id}`).delete();
            },

            async publicarEventos(lista){

                const lote = fs.batch();

                lista.forEach(e => lote.set(fs.doc(`eventos/${e.id}`), limpiar(e)));

                await lote.commit();
            },


            /* ----- sillas vendidas y reservas (tiempo real) ----- */

            escucharVentas(eventoId, cb){

                return fs.doc(`ventas/${eventoId}`).onSnapshot(
                    snap => cb(snap.exists ? snap.data() : vacioVentas()),
                    () => cb(vacioVentas())
                );
            },

            escucharReservas(eventoId, cb){

                return fs.doc(`reservas/${eventoId}`).onSnapshot(
                    snap => cb(snap.exists ? snap.data() : { holds: {} }),
                    () => cb({ holds: {} })
                );
            },

            // Aparta las ubicaciones del carrito por unos minutos mientras se paga
            async reservar(eventoId, items, minutos){

                if(!usuario) throw new Error("Debes iniciar sesión");

                const uid = usuario.uid;

                const expira = Date.now() + minutos * 60000;

                const refV = fs.doc(`ventas/${eventoId}`);

                const refR = fs.doc(`reservas/${eventoId}`);

                await fs.runTransaction(async t => {

                    const v = await t.get(refV);

                    const r = await t.get(refR);

                    conflicto(v.exists ? v.data() : vacioVentas(), { items });

                    const holds = r.exists ? (r.data().holds || {}) : {};

                    const ajeno = holdAjeno(holds, items, uid);

                    if(ajeno) throw new Error(`${ajeno.etiqueta} la está comprando otra persona. Elige otra ubicación.`);

                    t.set(refR, { holds: agregarHolds(limpiarHolds(holds, uid), items, uid, expira) });
                });

                return expira;
            },

            async liberar(eventoId){

                if(!usuario) return;

                const refR = fs.doc(`reservas/${eventoId}`);

                await fs.runTransaction(async t => {

                    const r = await t.get(refR);

                    if(r.exists) t.set(refR, { holds: limpiarHolds(r.data().holds, usuario.uid) });

                }).catch(() => {});
            },


            /* ----- compras ----- */

            async siguienteFactura(){

                const ref = fs.doc("contadores/facturas");

                return fs.runTransaction(async t => {

                    const snap = await t.get(ref);

                    const valor = (snap.exists ? snap.data().valor : 1000) + 1;

                    t.set(ref, { valor });

                    return valor;
                });
            },

            // Guarda la compra y marca las ubicaciones como vendidas en UNA transacción
            // (si dos personas compran la misma silla al tiempo, solo una lo logra)
            async comprar(compra){

                if(!usuario) throw new Error("Debes iniciar sesión");

                const uid = usuario.uid;

                const datos = limpiar({ ...compra, uid, email: usuario.email, usuario: usuario.name });

                const refV = fs.doc(`ventas/${compra.eventoId}`);

                const refR = fs.doc(`reservas/${compra.eventoId}`);

                try{

                    await fs.runTransaction(async t => {

                        const v = await t.get(refV);

                        const r = await t.get(refR);

                        const ventas = v.exists ? v.data() : vacioVentas();

                        const holds = r.exists ? (r.data().holds || {}) : {};

                        conflicto(ventas, compra);

                        const ajeno = holdAjeno(holds, compra.items, uid);

                        if(ajeno) throw new Error(`${ajeno.etiqueta} la está comprando otra persona.`);

                        t.set(refV, aplicarVenta(ventas, compra, 1));

                        t.set(refR, { holds: limpiarHolds(holds, uid) });

                        t.set(fs.doc(`compras/${compra.codigo}`), datos);
                    });

                }catch(e){

                    throw e.code ? traducir(e) : e;
                }

                return datos;
            },

            async misCompras(){

                if(!usuario) return [];

                const snap = await fs.collection("compras").where("uid", "==", usuario.uid).get();

                return ordenar(snap.docs.map(d => d.data()));
            },

            async eliminarCompra(compra){

                const refV = fs.doc(`ventas/${compra.eventoId}`);

                await fs.runTransaction(async t => {

                    const snap = await t.get(refV);

                    if(snap.exists && compra.items){

                        t.set(refV, aplicarVenta(snap.data(), compra, -1));
                    }

                    t.delete(fs.doc(`compras/${compra.codigo}`));
                });
            },

            async todasLasCompras(){

                const snap = await fs.collection("compras").get();

                return ordenar(snap.docs.map(d => d.data()));
            },


            /* ----- taquilla ----- */

            async buscarCompra(codigo){

                try{

                    const snap = await fs.doc(`compras/${codigo}`).get();

                    return snap.exists ? snap.data() : null;

                }catch(e){

                    throw traducir(e);
                }
            },

            async registrarIngreso(codigo, n){

                const ref = fs.doc(`compras/${codigo}`);

                try{

                    return await fs.runTransaction(async t => {

                        const snap = await t.get(ref);

                        if(!snap.exists) throw new Error("La compra no existe");

                        const cambio = registrarIngresoEn(snap.data(), n, usuario && usuario.email);

                        t.update(ref, cambio);

                        return { ...snap.data(), ...cambio };
                    });

                }catch(e){

                    throw e.code ? traducir(e) : e;
                }
            },


            /* ----- correos (los envía la extensión Trigger Email) ----- */

            async encolarCorreo(para, mensaje){

                const destinos = [...new Set(para.filter(Boolean))];

                if(!destinos.length) return;

                await fs.collection("correos").add({
                    to: destinos,
                    message: mensaje,
                    creado: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        };
    }



    /* ========================================
       MODO LOCAL (localStorage)
    ======================================== */

    function crearLocal(){

        const leer = (k, def) => {

            try{ return JSON.parse(localStorage.getItem(k)) ?? def; }

            catch(e){ return def; }
        };

        const escribir = (k, v) => localStorage.setItem(k, JSON.stringify(v));

        const publico = u => ({ uid: u.email, email: u.email, name: u.name, role: u.role || "user", verificado: true });

        let usuario = null;

        const oyentes = [];

        const oyentesDoc = {};

        // administrador por defecto + migrar compras de la versión anterior
        (function iniciar(){

            const users = leer("users", []);

            if(!users.find(u => u.role === "admin")){

                users.push({ name:"Administrador", email:"admin@onticket.com", password:"123456", role:"admin", compras:[] });
            }

            const compras = leer("compras", []);

            users.forEach(u => {

                (u.compras || []).forEach(c => compras.push({ ...c, uid: u.email, email: u.email, usuario: u.name }));

                u.compras = [];
            });

            escribir("users", users);

            escribir("compras", compras);

            const sesion = leer("currentUser", null) || JSON.parse(sessionStorage.getItem("currentUser") || "null");

            usuario = sesion ? publico(sesion) : null;
        })();

        const avisar = () => oyentes.forEach(cb => cb(usuario));

        const getVentas = id => ({ ...vacioVentas(), ...leer("ventas_" + id, {}) });

        const getReservas = id => ({ holds: {}, ...leer("reservas_" + id, {}) });

        function guardarDoc(clave, valor){

            escribir(clave, valor);

            (oyentesDoc[clave] || []).forEach(cb => cb(valor));
        }

        function escuchar(clave, cb, valor){

            (oyentesDoc[clave] = oyentesDoc[clave] || []).push(cb);

            cb(valor);

            return () => oyentesDoc[clave].splice(oyentesDoc[clave].indexOf(cb), 1);
        }

        // otra pestaña compró o reservó algo → actualizar
        window.addEventListener("storage", e => {

            if(e.key && oyentesDoc[e.key]){

                oyentesDoc[e.key].forEach(cb => cb(leer(e.key, {})));
            }
        });

        return {

            modo: "local",

            usuario: () => usuario,

            onUsuario(cb){

                oyentes.push(cb);

                cb(usuario);

                return () => oyentes.splice(oyentes.indexOf(cb), 1);
            },

            async registrar(name, email, password){

                if(!name || !email || !password) throw new Error("Completa todos los campos");

                if(password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");

                const users = leer("users", []);

                if(users.find(u => u.email === email)) throw new Error("Ese correo ya tiene una cuenta");

                users.push({ name, email, password, role:"user", compras:[] });

                escribir("users", users);

                return this.login(email, password, true);
            },

            async login(email, password, recordar = true){

                const u = leer("users", []).find(x => x.email === email && x.password === password);

                if(!u) throw new Error("Correo o contraseña incorrectos");

                usuario = publico(u);

                localStorage.removeItem("currentUser");

                sessionStorage.removeItem("currentUser");

                (recordar ? localStorage : sessionStorage).setItem("currentUser", JSON.stringify(usuario));

                avisar();

                return usuario;
            },

            async loginGoogle(){

                throw new Error("El inicio con Google requiere Firebase");
            },

            async recuperarClave(){

                throw new Error("La recuperación por correo requiere Firebase");
            },

            async reenviarVerificacion(){},

            async refrescarUsuario(){

                return usuario;
            },

            async logout(){

                localStorage.removeItem("currentUser");

                sessionStorage.removeItem("currentUser");

                usuario = null;

                avisar();
            },


            /* ----- eventos ----- */

            async cargarEventos(){

                return leer("eventosLocal", null);
            },

            async guardarEvento(evento){

                const lista = (leer("eventosLocal", null) || EVENTOS_EJEMPLO).filter(e => e.id !== evento.id);

                lista.push(limpiar(evento));

                escribir("eventosLocal", lista);
            },

            async eliminarEvento(id){

                escribir("eventosLocal", (leer("eventosLocal", null) || EVENTOS_EJEMPLO).filter(e => e.id !== id));
            },

            async publicarEventos(lista){

                escribir("eventosLocal", limpiar(lista));
            },


            /* ----- sillas vendidas y reservas ----- */

            escucharVentas(eventoId, cb){

                return escuchar("ventas_" + eventoId, v => cb({ ...vacioVentas(), ...v }), getVentas(eventoId));
            },

            escucharReservas(eventoId, cb){

                return escuchar("reservas_" + eventoId, r => cb({ holds: {}, ...r }), getReservas(eventoId));
            },

            async reservar(eventoId, items, minutos){

                if(!usuario) throw new Error("Debes iniciar sesión");

                const expira = Date.now() + minutos * 60000;

                conflicto(getVentas(eventoId), { items });

                const holds = getReservas(eventoId).holds;

                const ajeno = holdAjeno(holds, items, usuario.uid);

                if(ajeno) throw new Error(`${ajeno.etiqueta} la está comprando otra persona. Elige otra ubicación.`);

                guardarDoc("reservas_" + eventoId, { holds: agregarHolds(limpiarHolds(holds, usuario.uid), items, usuario.uid, expira) });

                return expira;
            },

            async liberar(eventoId){

                if(!usuario) return;

                guardarDoc("reservas_" + eventoId, { holds: limpiarHolds(getReservas(eventoId).holds, usuario.uid) });
            },


            /* ----- compras ----- */

            async siguienteFactura(){

                const valor = Number(localStorage.getItem("consecutivoFE") || 1000) + 1;

                localStorage.setItem("consecutivoFE", valor);

                return valor;
            },

            async comprar(compra){

                if(!usuario) throw new Error("Debes iniciar sesión");

                const ventas = getVentas(compra.eventoId);

                const holds = getReservas(compra.eventoId).holds;

                conflicto(ventas, compra);

                const ajeno = holdAjeno(holds, compra.items, usuario.uid);

                if(ajeno) throw new Error(`${ajeno.etiqueta} la está comprando otra persona.`);

                const datos = limpiar({ ...compra, uid: usuario.uid, email: usuario.email, usuario: usuario.name });

                escribir("compras", [...leer("compras", []), datos]);

                guardarDoc("ventas_" + compra.eventoId, aplicarVenta(ventas, compra, 1));

                guardarDoc("reservas_" + compra.eventoId, { holds: limpiarHolds(holds, usuario.uid) });

                return datos;
            },

            async misCompras(){

                if(!usuario) return [];

                return ordenar(leer("compras", []).filter(c => c.uid === usuario.uid));
            },

            async eliminarCompra(compra){

                escribir("compras", leer("compras", []).filter(c => c.codigo !== compra.codigo));

                if(compra.eventoId && compra.items){

                    guardarDoc("ventas_" + compra.eventoId, aplicarVenta(getVentas(compra.eventoId), compra, -1));
                }
            },

            async todasLasCompras(){

                return ordenar(leer("compras", []));
            },


            /* ----- taquilla ----- */

            async buscarCompra(codigo){

                return leer("compras", []).find(c => c.codigo === codigo) || null;
            },

            async registrarIngreso(codigo, n){

                const compras = leer("compras", []);

                const c = compras.find(x => x.codigo === codigo);

                if(!c) throw new Error("La compra no existe");

                Object.assign(c, registrarIngresoEn(c, n, usuario && usuario.email));

                escribir("compras", compras);

                return c;
            },

            async encolarCorreo(){}
        };
    }


    return usarFirebase ? crearFirebase() : crearLocal();

})();
