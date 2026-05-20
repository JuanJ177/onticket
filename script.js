/* ========================================
   REFERENCIAS
======================================== */

const landing = document.getElementById("landing");

const homePage = document.getElementById("homePage");

const eventoPage = document.getElementById("eventoPage");

const ayudaModal = document.getElementById("ayudaModal");

const pagoModal = document.getElementById("pagoModal");

const ticketModal = document.getElementById("ticketModal");

const loginModal = document.getElementById("loginModal");

const searchInput = document.getElementById("searchInput");

const metodoSeleccionado = document.getElementById("metodoSeleccionado");

const timerText = document.getElementById("timerText");

const ticketTexto = document.getElementById("ticketTexto");

const qrcode = document.getElementById("qrcode");

const selectedContainer = document.getElementById("selectedSeats");

const totalText = document.getElementById("total");

const grid = document.getElementById("grid");

const misCompras = document.getElementById("misCompras");

const btnLogin = document.getElementById("btnLogin");



/* ========================================
   NAVEGACIÓN
======================================== */

function mostrarHome(){

    landing.style.display = "none";

    homePage.style.display = "block";

    eventoPage.style.display = "none";

    window.scrollTo(0,0);
}


function abrirEvento(){

    homePage.style.display = "none";

    eventoPage.style.display = "block";

    window.scrollTo(0,0);
}


function volverHome(){

    eventoPage.style.display = "none";

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



/* MOSTRAR / OCULTAR PASSWORD */

function togglePassword(){

    const passwordInput = document.getElementById("passwordInput");


    if(passwordInput.type === "password"){

        passwordInput.type = "text";

    }else{

        passwordInput.type = "password";
    }
}



/* INICIAR SESIÓN */

function iniciarSesion(){

    let email = document.getElementById("emailInput").value;

    let password = document.getElementById("passwordInput").value;

    let remember = document.getElementById("rememberUser").checked;


    if(email === "" || password === ""){

        alert("Completa todos los campos");

        return;
    }


    let usuario = {

        email: email
    };


    if(remember){

        localStorage.setItem(
            "usuario",
            JSON.stringify(usuario)
        );

    }else{

        sessionStorage.setItem(
            "usuario",
            JSON.stringify(usuario)
        );
    }


    actualizarUsuario();

    loginModal.style.display = "none";
}



/* CERRAR SESIÓN */

function cerrarSesion(){

    localStorage.removeItem("usuario");

    sessionStorage.removeItem("usuario");


    btnLogin.innerHTML = `

        <i class="fa-solid fa-user"></i>

        Iniciar sesión

    `;


    btnLogin.onclick = abrirLogin;
}



/* ACTUALIZAR USUARIO */

function actualizarUsuario(){

    let usuario =
        JSON.parse(localStorage.getItem("usuario")) ||
        JSON.parse(sessionStorage.getItem("usuario"));


    if(usuario){

        btnLogin.innerHTML = `

            <i class="fa-solid fa-user"></i>

            ${usuario.email}

        `;

        btnLogin.onclick = cerrarSesion;

    }else{

        btnLogin.innerHTML = `

            <i class="fa-solid fa-user"></i>

            Iniciar sesión

        `;

        btnLogin.onclick = abrirLogin;
    }
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



/* CARGAR TEMA */

if(localStorage.getItem("theme") === "dark"){

    document.body.classList.add("dark");
}



/* ========================================
   BUSCADOR
======================================== */

function buscarEventos(){

    let input = searchInput.value.toLowerCase();

    let cards = document.querySelectorAll(".eventCard");


    cards.forEach(card => {

        let texto = card.innerText.toLowerCase();


        if(texto.includes(input)){

            card.style.display = "block";

        }else{

            card.style.display = "none";
        }
    });
}



/* ========================================
   VARIABLES
======================================== */

let total = 0;

let entradas = 0;

let metodoPago = "";

let selectedSeats = [];



/* ========================================
   MAPA GENERAL
======================================== */

for(let fila = 1; fila <= 18; fila++){

    let filaDiv = document.createElement("div");

    filaDiv.className = "fila";


    for(let asiento = 1; asiento <= 28; asiento++){


        if(asiento === 15){

            let espacio = document.createElement("div");

            espacio.style.width = "35px";

            filaDiv.appendChild(espacio);
        }


        let seat = document.createElement("div");

        seat.className = "seat";


        if(Math.random() < 0.10){

            seat.classList.add("ocupado");
        }


        seat.onclick = () => {


            if(seat.classList.contains("ocupado")) return;


            let id = `Fila ${fila} - Asiento ${asiento}`;


            if(seat.classList.contains("selected")){

                seat.classList.remove("selected");


                selectedSeats =
                selectedSeats.filter(s => s !== id);


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

let vipSeats = document.querySelectorAll(".vipSeat");


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
            selectedSeats.filter(s => s !== nombre);


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
    Math.floor(Date.now() / (1000 * 60 * 30));

    return "ONTICKET-" + tiempo;
}



/* ========================================
   TIMER QR
======================================== */

let tiempoRestante = 1800;

let intervaloQR;


function iniciarTimerQR(){

    clearInterval(intervaloQR);

    tiempoRestante = 1800;

    actualizarTimer();


    intervaloQR = setInterval(()=>{

        tiempoRestante--;

        actualizarTimer();


        if(tiempoRestante <= 0){

            clearInterval(intervaloQR);

            let nuevoCodigo =
            generarCodigoDinamico();

            verQR(nuevoCodigo);

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


    timerText.innerText = `

${String(minutos).padStart(2,"0")}:
${String(segundos).padStart(2,"0")}

    `;
}



/* ========================================
   CONFIRMAR COMPRA
======================================== */

function confirmarCompra(){


    if(metodoPago === ""){

        alert("Selecciona un método de pago");

        return;
    }


    pagoModal.style.display = "none";

    ticketModal.style.display = "flex";


    let codigo = generarCodigoDinamico();


    let compra = {

        codigo: codigo,

        entradas: [...selectedSeats],

        total: total,

        metodo: metodoPago
    };


    let compras =
    JSON.parse(localStorage.getItem("compras"))
    || [];


    compras.push(compra);


    localStorage.setItem(
        "compras",
        JSON.stringify(compras)
    );


    renderCompras();


    ticketTexto.innerHTML = `

    <p><b>Evento:</b> Andrés Cepeda Tour 2025</p>

    <br>

    <p><b>Entradas:</b> ${entradas}</p>

    <br>

    <p><b>Localidades:</b></p>

    <p>${selectedSeats.join("<br>")}</p>

    <br>

    <p><b>Total:</b> $${total.toLocaleString()}</p>

    <br>

    <p><b>Método:</b> ${metodoPago}</p>

    <br>

    <p><b>Código:</b> ${codigo}</p>

    `;


    qrcode.innerHTML = "";


    new QRCode(document.getElementById("qrcode"), {

        text: codigo,

        width:150,

        height:150
    });


    iniciarTimerQR();
}



/* ========================================
   VER QR
======================================== */

function verQR(codigo){

    ticketModal.style.display = "flex";

    qrcode.innerHTML = "";


    new QRCode(document.getElementById("qrcode"), {

        text: codigo,

        width:150,

        height:150
    });
}



/* ========================================
   CERRAR TICKET
======================================== */

function cerrarTicket(){

    ticketModal.style.display = "none";
}



/* ========================================
   DESCARGAR QR
======================================== */

function descargarQR(){

    let canvas = qrcode.querySelector("canvas");

    let link = document.createElement("a");

    link.download = "ticket.png";

    link.href = canvas.toDataURL();

    link.click();
}



/* ========================================
   MIS COMPRAS
======================================== */

function renderCompras(){

    misCompras.innerHTML = "";


    let compras =
    JSON.parse(localStorage.getItem("compras"))
    || [];


    compras.forEach((compra,index)=>{

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

    let compras =
    JSON.parse(localStorage.getItem("compras"));

    let compra = compras[index];


    ticketModal.style.display = "flex";


    ticketTexto.innerHTML = `

    <p><b>Código:</b> ${compra.codigo}</p>

    <br>

    <p><b>Método:</b> ${compra.metodo}</p>

    <br>

    <p><b>Total:</b> $${compra.total.toLocaleString()}</p>

    <br>

    <p><b>Localidades:</b></p>

    <p>${compra.entradas.join("<br>")}</p>

    `;


    qrcode.innerHTML = "";


    new QRCode(document.getElementById("qrcode"), {

        text: compra.codigo,

        width:150,

        height:150
    });
}



/* ========================================
   ELIMINAR COMPRA
======================================== */

function eliminarCompra(index){

    let compras =
    JSON.parse(localStorage.getItem("compras"));

    compras.splice(index,1);


    localStorage.setItem(
        "compras",
        JSON.stringify(compras)
    );


    renderCompras();
}



/* ========================================
   INICIAR APP
======================================== */

actualizarUsuario();

renderCompras();