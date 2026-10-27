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
    maxGeneral: 10,

    // Minutos que quedan apartadas las sillas mientras se paga
    minutosReserva: 10,

    // Dirección pública de la web (para los enlaces e imágenes de los correos que envía la app)
    sitioWeb: "",

    // Eventos de demostración: si la fecha ya pasó, se corre al año siguiente
    // (así los eventos de ejemplo siguen vigentes sin tener que cambiarlos)
    moverEventosPasados: true
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
   EVENTOS DE EJEMPLO
   Se usan mientras no haya eventos creados desde el panel de
   administrador (que se guardan en Firebase).
   fechaISO = fecha y hora real del evento (año-mes-díaThora:min)
======================================== */

const EVENTOS = [

    {
        id: "cepeda",
        artista: "Andrés Cepeda",
        titulo: "Tour 2025",
        categoria: "Conciertos",
        lugar: "malocas",
        fechaISO: "2026-11-28T19:00",
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
        fechaISO: "2025-11-01T20:00",
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
        fechaISO: "2026-09-04T21:00",
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
        fechaISO: "2026-04-18T20:00",
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
        fechaISO: "2026-06-06T20:00",
        imagen: "img/luisalfonso.jpeg",
        descripcion: "Música popular y despecho en vivo. Brindemos la última copa juntos.",
        destacado: true
    }
];
