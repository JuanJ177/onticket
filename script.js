/* ========================================
   REFERENCIAS
======================================== */

const landing = document.getElementById("landing");

const homePage = document.getElementById("homePage");

const eventoPage = document.getElementById("eventoPage");

const adminPage = document.getElementById("adminPage");

const ayudaModal = document.getElementById("ayudaModal");

const pagoModal = document.getElementById("pagoModal");

const ticketModal = document.getElementById("ticketModal");

const loginModal = document.getElementById("loginModal");

const adminTableBody =
document.getElementById("adminTableBody");

const searchInput =
document.getElementById("searchInput");

const metodoSeleccionado =
document.getElementById("metodoSeleccionado");

const timerText =
document.getElementById("timerText");

const ticketTexto =
document.getElementById("ticketTexto");

const qrcode =
document.getElementById("qrcode");

const selectedContainer =
document.getElementById("selectedSeats");

const totalText =
document.getElementById("total");

const grid =
document.getElementById("grid");

const misCompras =
document.getElementById("misCompras");

const btnLogin =
document.getElementById("btnLogin");

const adminBtn =
document.getElementById("adminBtn");



/* ========================================
   VARIABLES
======================================== */

let total = 0;

let entradas = 0;

let metodoPago = "";

let selectedSeats = [];

let authMode = "login";

let currentUser = null;

let tiempoRestante = 60;

let intervaloQR;



/* ========================================
   CREAR ADMIN
======================================== */

function inicializarAdmin(){

    let users =
    JSON.parse(localStorage.getItem("users"))
    || [];


    let existeAdmin =
    users.find(u => u.role === "admin");


    if(!existeAdmin){

        users.push({

            name:"Administrador",

            email:"admin@onticket.com",

            password:"123456",

            role:"admin",

            compras:[]
        });


        localStorage.setItem(
            "users",
            JSON.stringify(users)
        );
    }
}


inicializarAdmin();



/* ========================================
   NAVEGACIÓN
======================================== */

function mostrarHome(){

    landing.style.display = "none";

    homePage.style.display = "block";

    eventoPage.style.display = "none";

    adminPage.style.display = "none";

    window.scrollTo(0,0);
}


function abrirEvento(){

    homePage.style.display = "none";

    eventoPage.style.display = "block";

    adminPage.style.display = "none";

    window.scrollTo(0,0);
}


function volverHome(){

    eventoPage.style.display = "none";

    adminPage.style.display = "none";

    homePage.style.display = "block";

    window.scrollTo(0,0);
}



/* ========================================
   LOGIN
======================================== */

function abrirLogin(){

    loginModal.style.display = "flex";
}


function cerrarLogin(){

    loginModal.style.display = "none";
}



/* ========================================
   TOGGLE LOGIN / REGISTER
======================================== */

function toggleAuthMode(){

    const title =
    document.getElementById("authTitle");

    const registerName =
    document.getElementById("registerName");

    const actionBtn =
    document.getElementById("loginActionBtn");

    const switchBtn =
    document.querySelector(".switchAuthBtn");


    if(authMode === "login"){

        authMode = "register";

        title.innerText = "Crear Cuenta";

        registerName.style.display = "block";

        actionBtn.innerText = "CREAR CUENTA";

        actionBtn.onclick = registrarUsuario;

        switchBtn.innerText =
        "Ya tengo cuenta";

    }else{

        authMode = "login";

        title.innerText = "Iniciar Sesión";

        registerName.style.display = "none";

        actionBtn.innerText =
        "INICIAR SESIÓN";

        actionBtn.onclick = iniciarSesion;

        switchBtn.innerText =
        "Crear cuenta";
    }
}



/* ========================================
   PASSWORD
======================================== */

function togglePassword(){

    const passwordInput =
    document.getElementById("passwordInput");


    if(passwordInput.type === "password"){

        passwordInput.type = "text";

    }else{

        passwordInput.type = "password";
    }
}



/* ========================================
   REGISTRO
======================================== */

function registrarUsuario(){

    let name =
    document.getElementById("registerName").value;

    let email =
    document.getElementById("emailInput").value;

    let password =
    document.getElementById("passwordInput").value;


    if(
        name === "" ||
        email === "" ||
        password === ""
    ){

        alert("Completa todos los campos");

        return;
    }


    let users =
    JSON.parse(localStorage.getItem("users"))
    || [];


    let existe =
    users.find(u => u.email === email);


    if(existe){

        alert("Ese correo ya existe");

        return;
    }


    users.push({

        name:name,

        email:email,

        password:password,

        role:"user",

        compras:[]
    });


    localStorage.setItem(
        "users",
        JSON.stringify(users)
    );


    alert("Cuenta creada correctamente");

    toggleAuthMode();
}



/* ========================================
   LOGIN
======================================== */

function iniciarSesion(){

    let email =
    document.getElementById("emailInput").value;

    let password =
    document.getElementById("passwordInput").value;

    let remember =
    document.getElementById("rememberUser").checked;


    let users =
    JSON.parse(localStorage.getItem("users"))
    || [];


    let usuario =
    users.find(
        u =>
        u.email === email &&
        u.password === password
    );


    if(!usuario){

        alert("Correo o contraseña incorrectos");

        return;
    }


    currentUser = usuario;


    if(remember){

        localStorage.setItem(
            "currentUser",
            JSON.stringify(usuario)
        );

    }else{

        sessionStorage.setItem(
            "currentUser",
            JSON.stringify(usuario)
        );
    }


    actualizarUsuario();

    renderCompras();

    cerrarLogin();
}



/* ========================================
   LOGOUT
======================================== */

function cerrarSesion(){

    localStorage.removeItem("currentUser");

    sessionStorage.removeItem("currentUser");

    currentUser = null;


    btnLogin.innerHTML = `

        <i class="fa-solid fa-user"></i>

        Iniciar sesión

    `;


    btnLogin.onclick = abrirLogin;

    adminBtn.style.display = "none";

    misCompras.innerHTML = "";
}



/* ========================================
   ACTUALIZAR USUARIO
======================================== */

function actualizarUsuario(){

    currentUser =
    JSON.parse(localStorage.getItem("currentUser"))
    ||
    JSON.parse(sessionStorage.getItem("currentUser"));


    if(currentUser){

        btnLogin.innerHTML = `

            <i class="fa-solid fa-user"></i>

            ${currentUser.name}

        `;


        btnLogin.onclick = cerrarSesion;


        if(currentUser.role === "admin"){

            adminBtn.style.display = "flex";
        }

    }else{

        btnLogin.innerHTML = `

            <i class="fa-solid fa-user"></i>

            Iniciar sesión

        `;


        btnLogin.onclick = abrirLogin;

        adminBtn.style.display = "none";
    }
}



/* ========================================
   ADMIN PANEL
======================================== */

function abrirAdminPanel(){

    homePage.style.display = "none";

    eventoPage.style.display = "none";

    adminPage.style.display = "block";

    renderAdminCompras();

    window.scrollTo(0,0);
}


function renderAdminCompras(){

    adminTableBody.innerHTML = "";


    let users =
    JSON.parse(localStorage.getItem("users"))
    || [];


    users.forEach(user => {

        user.compras.forEach(compra => {

            adminTableBody.innerHTML += `

            <tr class="adminRow">

                <td>${user.name}</td>

                <td>${user.email}</td>

                <td>$${compra.total.toLocaleString()}</td>

                <td>${compra.metodo}</td>

                <td>${compra.codigo}</td>

            </tr>

            `;
        });
    });
}


function buscarCompraAdmin(){

    let input =
    document.getElementById("searchCompra")
    .value
    .toLowerCase();

    let filas =
    document.querySelectorAll(".adminRow");


    filas.forEach(fila => {

        let texto =
        fila.innerText.toLowerCase();


        if(texto.includes(input)){

            fila.style.display = "";

        }else{

            fila.style.display = "none";
        }
    });
}



/* ========================================
   AYUDA
======================================== */

function abrirAyuda(){

    ayudaModal.style.display = "flex";
}


function cerrarAyuda(){

    ayudaModal.style.display = "none";
}



/* ========================================
   DARK MODE
======================================== */

function toggleTheme(){

    document.body.classList.toggle("dark");


    if(document.body.classList.contains("dark")){

        localStorage.setItem("theme","dark");

    }else{

        localStorage.setItem("theme","light");
    }
}


if(localStorage.getItem("theme") === "dark"){

    document.body.classList.add("dark");
}



/* ========================================
   BUSCADOR EVENTOS
======================================== */

function buscarEventos(){

    let input =
    searchInput.value.toLowerCase();

    let cards =
    document.querySelectorAll(".eventCard");


    cards.forEach(card => {

        let texto =
        card.innerText.toLowerCase();


        if(texto.includes(input)){

            card.style.display = "block";

        }else{

            card.style.display = "none";
        }
    });
}



/* ========================================
   MAPA GENERAL
======================================== */

for(let fila = 1; fila <= 18; fila++){

    let filaDiv =
    document.createElement("div");

    filaDiv.className = "fila";


    for(let asiento = 1; asiento <= 28; asiento++){

        if(asiento === 15){

            let espacio =
            document.createElement("div");

            espacio.style.width = "35px";

            filaDiv.appendChild(espacio);
        }


        let seat =
        document.createElement("div");

        seat.className = "seat";


        if(Math.random() < 0.10){

            seat.classList.add("ocupado");
        }


        seat.onclick = () => {

            if(seat.classList.contains("ocupado")){

                return;
            }


            let id =
            `Fila ${fila} - Asiento ${asiento}`;


            if(seat.classList.contains("selected")){

                seat.classList.remove("selected");

                selectedSeats =
                selectedSeats.filter(
                    s => s !== id
                );

                total -= 90000;

                entradas--;

            }else{

                seat.classList.add("selected");

                selectedSeats.push(id);

                total += 90000;

                entradas++;
            }


            renderCompra();
        }

        filaDiv.appendChild(seat);
    }

    grid.appendChild(filaDiv);
}



/* ========================================
   PALCOS
======================================== */

let vipSeats =
document.querySelectorAll(".vipSeat");


vipSeats.forEach(seat => {

    seat.onclick = () => {

        let nombre = seat.innerText;

        let precio = 3000000;


        if(seat.classList.contains("diamond")){

            precio = 4500000;
        }


        if(seat.classList.contains("selected")){

            seat.classList.remove("selected");

            selectedSeats =
            selectedSeats.filter(
                s => s !== nombre
            );

            total -= precio;

            entradas--;

        }else{

            seat.classList.add("selected");

            selectedSeats.push(nombre);

            total += precio;

            entradas++;
        }


        renderCompra();
    }
});



/* ========================================
   RENDER COMPRA
======================================== */

function renderCompra(){

    selectedContainer.innerHTML = "";


    selectedSeats.forEach(seat => {

        selectedContainer.innerHTML += `

        <div class="seatItem">

            ${seat}

        </div>

        `;
    });


    totalText.innerText =
    "$" + total.toLocaleString();
}



/* ========================================
   MODAL PAGO
======================================== */

function abrirPago(){

    if(!currentUser){

        alert("Debes iniciar sesión");

        return;
    }


    if(selectedSeats.length <= 0){

        alert("Selecciona entradas");

        return;
    }


    pagoModal.style.display = "flex";
}


function cerrarPago(){

    pagoModal.style.display = "none";
}



/* ========================================
   MÉTODO DE PAGO
======================================== */

function seleccionarMetodo(nombre){

    metodoPago = nombre;


    document.querySelectorAll(".paymentMethod")
    .forEach(m => {

        m.classList.remove("active");
    });


    event.currentTarget.classList.add("active");


    metodoSeleccionado.innerHTML = `

        Método seleccionado:
        <b>${nombre}</b>

    `;
}



/* ========================================
   QR DINÁMICO
======================================== */

function generarCodigoDinamico(){

    let tiempo =
    Math.floor(Date.now() / (1000 * 60));

    let random =
    Math.floor(Math.random() * 999999);

    return `ONTICKET-${currentUser.name}-${random}-${tiempo}`;
}



/* ========================================
   TIMER QR
======================================== */

function iniciarTimerQR(){

    clearInterval(intervaloQR);

    tiempoRestante = 60;

    actualizarTimer();


    intervaloQR = setInterval(()=>{

        tiempoRestante--;

        actualizarTimer();


        if(tiempoRestante <= 0){

            clearInterval(intervaloQR);

            let nuevoCodigo =
            generarCodigoDinamico();

            actualizarQR(nuevoCodigo);

            iniciarTimerQR();
        }

    },1000);
}



/* ========================================
   ACTUALIZAR TIMER
======================================== */

function actualizarTimer(){

    let minutos =
    Math.floor(tiempoRestante / 60);

    let segundos =
    tiempoRestante % 60;


    timerText.innerText =
    `${String(minutos).padStart(2,"0")}:${String(segundos).padStart(2,"0")}`;
}



/* ========================================
   ACTUALIZAR QR
======================================== */

function actualizarQR(codigo){

    qrcode.innerHTML = "";


    setTimeout(()=>{

        new QRCode(qrcode,{

            text: codigo,

            width:180,

            height:180,

            colorDark:"#000000",

            colorLight:"#ffffff",

            correctLevel: QRCode.CorrectLevel.H

        });

    },100);
}



/* ========================================
   CONFIRMAR COMPRA
======================================== */

function confirmarCompra(){

    if(metodoPago === ""){

        alert("Selecciona un método");

        return;
    }


    pagoModal.style.display = "none";

    ticketModal.style.display = "flex";


    let codigo =
    generarCodigoDinamico();


    let compra = {

        codigo:codigo,

        entradas:[...selectedSeats],

        total:total,

        metodo:metodoPago
    };


    let users =
    JSON.parse(localStorage.getItem("users"))
    || [];


    users = users.map(user => {

        if(user.email === currentUser.email){

            user.compras.push(compra);

            currentUser = user;
        }

        return user;
    });


    localStorage.setItem(
        "users",
        JSON.stringify(users)
    );


    localStorage.setItem(
        "currentUser",
        JSON.stringify(currentUser)
    );


    renderCompras();


    ticketTexto.innerHTML = `

    <p>

        <b>Evento:</b>
        Andrés Cepeda Tour 2025

    </p>

    <br>

    <p>

        <b>Entradas:</b>
        ${entradas}

    </p>

    <br>

    <p>

        <b>Localidades:</b>

    </p>

    <p>

        ${selectedSeats.join("<br>")}

    </p>

    <br>

    <p>

        <b>Total:</b>
        $${total.toLocaleString()}

    </p>

    <br>

    <p>

        <b>Método:</b>
        ${metodoPago}

    </p>

    <br>

    <p>

        <b>Código:</b>
        ${codigo}

    </p>

    `;


    actualizarQR(codigo);

    iniciarTimerQR();
}



/* ========================================
   CERRAR TICKET
======================================== */

function cerrarTicket(){

    ticketModal.style.display = "none";

    clearInterval(intervaloQR);
}



/* ========================================
   DESCARGAR QR
======================================== */

function descargarQR(){

    let canvas =
    qrcode.querySelector("canvas");


    if(!canvas){

        alert("QR aún cargando");

        return;
    }


    let link =
    document.createElement("a");

    link.download = "ticket.png";

    link.href = canvas.toDataURL();

    link.click();
}



/* ========================================
   MIS COMPRAS
======================================== */

function renderCompras(){

    misCompras.innerHTML = "";


    if(!currentUser){

        return;
    }


    currentUser.compras.forEach((compra,index)=>{

        misCompras.innerHTML += `

        <div class="compraGuardada">

            <p>

                <b>${compra.codigo}</b>

            </p>

            <br>

            <p>

                $${compra.total.toLocaleString()}

            </p>

            <br>

            <p>

                ${compra.metodo}

            </p>

            <br>

            <div class="compraBtns">

                <button
                    class="verBtn"
                    onclick="verCompra(${index})"
                >

                    VER QR

                </button>

                <button
                    class="eliminarBtn"
                    onclick="eliminarCompra(${index})"
                >

                    ELIMINAR

                </button>

            </div>

        </div>

        `;
    });
}



/* ========================================
   VER COMPRA
======================================== */

function verCompra(index){

    let compra =
    currentUser.compras[index];


    ticketModal.style.display = "flex";


    ticketTexto.innerHTML = `

    <p>

        <b>Código:</b>
        ${compra.codigo}

    </p>

    <br>

    <p>

        <b>Método:</b>
        ${compra.metodo}

    </p>

    <br>

    <p>

        <b>Total:</b>
        $${compra.total.toLocaleString()}

    </p>

    `;


    actualizarQR(compra.codigo);

    iniciarTimerQR();
}



/* ========================================
   ELIMINAR COMPRA
======================================== */

function eliminarCompra(index){

    let users =
    JSON.parse(localStorage.getItem("users"))
    || [];


    users = users.map(user => {

        if(user.email === currentUser.email){

            user.compras.splice(index,1);

            currentUser = user;
        }

        return user;
    });


    localStorage.setItem(
        "users",
        JSON.stringify(users)
    );


    localStorage.setItem(
        "currentUser",
        JSON.stringify(currentUser)
    );


    renderCompras();
}



/* ========================================
   INICIAR
======================================== */

actualizarUsuario();

renderCompras();
