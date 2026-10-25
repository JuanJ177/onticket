/* ========================================
   CAPA DE DATOS (WEB + APP MÓVIL)

   - Si firebase-config.js tiene tus credenciales, usa Firebase:
       Authentication (correo y contraseña) + Firestore
       → la web y la app comparten cuentas, compras y sillas vendidas
         en tiempo real.
   - Si no, usa localStorage (modo local, como la versión anterior).

   Colecciones de Firestore:
     usuarios/{uid}        { name, email, role }
     compras/{codigo}      { uid, ...compra }
     ventas/{eventoId}     { ids:[...], general:{ zonaId: cantidad } }
     contadores/facturas   { valor }
======================================== */

const DB = (() => {

    const usarFirebase =
        typeof firebase !== "undefined" &&
        typeof FIREBASE_CONFIG !== "undefined" &&
        FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey;

    // Firestore no acepta "undefined": se limpia el objeto antes de guardarlo
    const limpiar = obj => JSON.parse(JSON.stringify(obj));

    const ordenar = lista => lista.sort((a, b) => (b.fechaCompra || "").localeCompare(a.fechaCompra || ""));

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



    /* ========================================
       MODO FIREBASE
    ======================================== */

    function crearFirebase(){

        firebase.initializeApp(FIREBASE_CONFIG);

        const auth = firebase.auth();

        const fs = firebase.firestore();

        let usuario = null;

        const errores = {
            "auth/email-already-in-use": "Ese correo ya tiene una cuenta",
            "auth/invalid-email": "El correo no es válido",
            "auth/weak-password": "La contraseña debe tener al menos 6 caracteres",
            "auth/invalid-credential": "Correo o contraseña incorrectos",
            "auth/wrong-password": "Correo o contraseña incorrectos",
            "auth/user-not-found": "Correo o contraseña incorrectos",
            "auth/too-many-requests": "Demasiados intentos. Espera un momento",
            "auth/network-request-failed": "Sin conexión a internet"
        };

        const traducir = e => new Error(errores[e.code] || e.message);

        async function perfil(u){

            const snap = await fs.doc(`usuarios/${u.uid}`).get();

            const datos = snap.exists ? snap.data() : {};

            return {
                uid: u.uid,
                email: u.email,
                name: datos.name || u.displayName || u.email.split("@")[0],
                role: datos.role || "user"
            };
        }

        return {

            modo: "firebase",

            usuario: () => usuario,

            onUsuario(cb){

                return auth.onAuthStateChanged(async u => {

                    try{

                        usuario = u ? await perfil(u) : null;

                    }catch(e){

                        usuario = u ? { uid:u.uid, email:u.email, name:u.email, role:"user" } : null;
                    }

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

                    usuario = { uid: cred.user.uid, email, name, role: "user" };

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

            async logout(){

                await auth.signOut();
            },

            escucharVentas(eventoId, cb){

                return fs.doc(`ventas/${eventoId}`).onSnapshot(
                    snap => cb(snap.exists ? snap.data() : { ids: [], general: {} }),
                    () => cb({ ids: [], general: {} })
                );
            },

            async siguienteFactura(){

                const ref = fs.doc("contadores/facturas");

                return fs.runTransaction(async t => {

                    const snap = await t.get(ref);

                    const valor = (snap.exists ? snap.data().valor : 1000) + 1;

                    t.set(ref, { valor });

                    return valor;
                });
            },

            // guarda la compra y marca las sillas como vendidas en una sola transacción
            // (si dos personas compran la misma silla al tiempo, solo una lo logra)
            async comprar(compra){

                if(!usuario) throw new Error("Debes iniciar sesión");

                const datos = limpiar({ ...compra, uid: usuario.uid, email: usuario.email, usuario: usuario.name });

                const refVentas = fs.doc(`ventas/${compra.eventoId}`);

                await fs.runTransaction(async t => {

                    const snap = await t.get(refVentas);

                    const ventas = snap.exists ? snap.data() : { ids: [], general: {} };

                    conflicto(ventas, compra);

                    t.set(refVentas, aplicarVenta(ventas, compra, 1));

                    t.set(fs.doc(`compras/${compra.codigo}`), datos);
                });

                return datos;
            },

            async misCompras(){

                if(!usuario) return [];

                const snap = await fs.collection("compras").where("uid", "==", usuario.uid).get();

                return ordenar(snap.docs.map(d => d.data()));
            },

            async eliminarCompra(compra){

                const refVentas = fs.doc(`ventas/${compra.eventoId}`);

                await fs.runTransaction(async t => {

                    const snap = await t.get(refVentas);

                    if(snap.exists && compra.items){

                        t.set(refVentas, aplicarVenta(snap.data(), compra, -1));
                    }

                    t.delete(fs.doc(`compras/${compra.codigo}`));
                });
            },

            async todasLasCompras(){

                const snap = await fs.collection("compras").get();

                return ordenar(snap.docs.map(d => d.data()));
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

        const publico = u => ({ uid: u.email, email: u.email, name: u.name, role: u.role || "user" });

        let usuario = null;

        const oyentes = [];

        const oyentesVentas = {};

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

        function avisar(){

            oyentes.forEach(cb => cb(usuario));
        }

        function getVentas(eventoId){

            const v = leer("ventas_" + eventoId, {});

            return { ids: v.ids || [], general: v.general || {} };
        }

        function setVentas(eventoId, ventas){

            escribir("ventas_" + eventoId, ventas);

            (oyentesVentas[eventoId] || []).forEach(cb => cb(ventas));
        }

        // otra pestaña compró algo → actualizar
        window.addEventListener("storage", e => {

            if(e.key && e.key.startsWith("ventas_")){

                const id = e.key.slice(7);

                (oyentesVentas[id] || []).forEach(cb => cb(getVentas(id)));
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

            async logout(){

                localStorage.removeItem("currentUser");

                sessionStorage.removeItem("currentUser");

                usuario = null;

                avisar();
            },

            escucharVentas(eventoId, cb){

                (oyentesVentas[eventoId] = oyentesVentas[eventoId] || []).push(cb);

                cb(getVentas(eventoId));

                return () => {

                    const lista = oyentesVentas[eventoId];

                    lista.splice(lista.indexOf(cb), 1);
                };
            },

            async siguienteFactura(){

                const valor = Number(localStorage.getItem("consecutivoFE") || 1000) + 1;

                localStorage.setItem("consecutivoFE", valor);

                return valor;
            },

            async comprar(compra){

                if(!usuario) throw new Error("Debes iniciar sesión");

                const ventas = getVentas(compra.eventoId);

                conflicto(ventas, compra);

                const datos = limpiar({ ...compra, uid: usuario.uid, email: usuario.email, usuario: usuario.name });

                const compras = leer("compras", []);

                compras.push(datos);

                escribir("compras", compras);

                setVentas(compra.eventoId, aplicarVenta(ventas, compra, 1));

                return datos;
            },

            async misCompras(){

                if(!usuario) return [];

                return ordenar(leer("compras", []).filter(c => c.uid === usuario.uid));
            },

            async eliminarCompra(compra){

                escribir("compras", leer("compras", []).filter(c => c.codigo !== compra.codigo));

                if(compra.eventoId && compra.items){

                    setVentas(compra.eventoId, aplicarVenta(getVentas(compra.eventoId), compra, -1));
                }
            },

            async todasLasCompras(){

                return ordenar(leer("compras", []));
            }
        };
    }


    return usarFirebase ? crearFirebase() : crearLocal();

})();
