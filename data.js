/* ========================================
   CONFIGURACIÓN DE COBROS
   Todos los valores quedan visibles para el comprador.
======================================== */

const CONFIG = {

    // Cargo por servicio (fee) de OnTicket sobre el valor de las boletas
    feeServicio: 0.05,

    // IVA que se cobra sobre el cargo por servicio
    // (la boletería de espectáculos públicos está excluida de IVA, el servicio no)
    ivaServicio: 0.19,

    // Máximo de boletas por compra en zonas de general
    maxGeneral: 10
};



/* ========================================
   LUGARES (con datos para el mapa)
======================================== */

const LUGARES = {

    malocas: {
        nombre: "Coliseo Las Malocas",
        direccion: "Parque Las Malocas, Km 3 vía Puerto López",
        ciudad: "Villavicencio",
        departamento: "Meta",
        mapa: "Coliseo Las Malocas, Villavicencio, Meta",
        plano: "malocas"
    },

    capachos: {
        nombre: "Los Capachos",
        direccion: "Villavicencio, Meta",
        ciudad: "Villavicencio",
        departamento: "Meta",
        mapa: "Los Capachos, Villavicencio, Meta",
        plano: "capachos"
    },

    santiagoLondono: {
        nombre: "Teatro Santiago Londoño",
        direccion: "Centro de Pereira",
        ciudad: "Pereira",
        departamento: "Risaralda",
        mapa: "Teatro Santiago Londoño, Pereira, Risaralda",
        plano: "teatro"
    },

    sikuani: {
        nombre: "Coliseo Parque Sikuani",
        direccion: "Parque Sikuani",
        ciudad: "Villavicencio",
        departamento: "Meta",
        mapa: "Coliseo Parque Sikuani, Villavicencio, Meta",
        plano: "malocas"   // coliseo con la misma distribución tipo Malocas
    }
};



/* ========================================
   EVENTOS
======================================== */

const EVENTOS = [

    {
        id: "cepeda",
        artista: "Andrés Cepeda",
        titulo: "Tour 2025",
        categoria: "Conciertos",
        lugar: "malocas",
        fecha: "Sábado 28 de noviembre",
        hora: "7:00 PM",
        imagen: "img/cepeda.jpeg",
        video: "video/cepeda.mp4",
        descripcion: "Una noche de baladas, romance y los grandes éxitos de Cepeda en vivo. Vive la experiencia completa desde la mejor ubicación.",
        destacado: true
    },

    {
        id: "marcoantonio",
        artista: "Marco Antonio Solís",
        titulo: "Más Cerca de Ti · World Tour",
        categoria: "Conciertos",
        lugar: "malocas",
        fecha: "Sábado 1 de noviembre",
        hora: "8:00 PM",
        imagen: "img/marcoantonio.jpg",
        descripcion: "El Buki llega a Villavicencio con su gira mundial. Un concierto para cantar de principio a fin.",
        destacado: true
    },

    {
        id: "rikarena",
        artista: "Rikarena",
        titulo: "Un Merengazo de 30 años",
        categoria: "Conciertos",
        lugar: "capachos",
        fecha: "Viernes 4 de septiembre",
        hora: "9:00 PM",
        imagen: "img/rikarena.jpg",
        descripcion: "30 años de merengue en una sola noche. Palcos para compartir con tu parche o puestos individuales para vivirlo a tu manera.",
        destacado: true
    },

    {
        id: "jediondo",
        artista: "Don Jediondo",
        titulo: "30 años Bien Jediondos · con Boyacoman",
        categoria: "Humor",
        lugar: "santiagoLondono",
        fecha: "Sábado 18 de abril",
        hora: "8:00 PM",
        imagen: "img/donjediondo.jpeg",
        descripcion: "Don Jediondo celebra 30 años de humor junto a Boyacoman. Apertura de puertas 7:00 PM.",
        destacado: false
    },

    {
        id: "luisalfonso",
        artista: "Luis Alfonso",
        titulo: "La Última Copa · con Alci Acosta y Camilo Méndez",
        categoria: "Conciertos",
        lugar: "sikuani",
        fecha: "Sábado 6 de junio",
        hora: "8:00 PM",
        imagen: "img/luisalfonso.jpeg",
        descripcion: "Música popular y despecho en vivo. Brindemos la última copa juntos.",
        destacado: true
    }
];
