// Configuración de Supabase
const SUPABASE_URL = "https://ctlaralhkyzrtxnyvljw.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_pb36ddQJ_qh8NGwaqvuKVw_Hkeo25JN"; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let mapa;
let marcadorTemporal = null;
let coordsSeleccionadas = null;
let esAdmin = false;
let capaAlertas;
const TAMANO_BLOQUE_IMPORTACION = 100;

// Inicialización de Mapa (Centrado por defecto)
window.onload = function () {
    // Inicializar mapa centrado en coordenadas generales (ej: Managua/León o tu ciudad)
    mapa = L.map('mapa').setView([12.435, -86.878], 13);
    capaAlertas = L.layerGroup().addTo(mapa);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(mapa);

    // Evento al hacer clic en el mapa
    mapa.on('click', seleccionarCoordenada);

    // Cargar alertas existentes
    cargarAlertas();
    comprobarSesion();
};

// Cargar y Renderizar Alertas desde Supabase
async function cargarAlertas() {
    const { data: alertas, error } = await supabaseClient
        .from('alertas')
        .select('*');

    if (error) {
        console.error("Error al cargar alertas:", error);
        return;
    }

    capaAlertas.clearLayers();

    // Actualizar Contadores del Dashboard
    let alto = 0, medio = 0, bajo = 0;

    alertas.forEach(alerta => {
        if (alerta.nivel_riesgo === 'Alto') alto++;
        if (alerta.nivel_riesgo === 'Medio') medio++;
        if (alerta.nivel_riesgo === 'Bajo') bajo++;

        // Asignar color al marcador
        let colorHex = '#22c55e'; // Verde
        if (alerta.nivel_riesgo === 'Medio') colorHex = '#eab308'; // Amarillo
        if (alerta.nivel_riesgo === 'Alto') colorHex = '#ef4444'; // Rojo

        // Crear círculo en el mapa para simular radar/alerta visual de Waze
        const marcador = L.circleMarker([alerta.latitud, alerta.longitud], {
            color: colorHex,
            fillColor: colorHex,
            fillOpacity: 0.7,
            radius: 12
        }).addTo(capaAlertas);

        let contenidoPopup = `
            <b>Tipo:</b> ${alerta.tipo}<br>
            <b>Riesgo:</b> ${alerta.nivel_riesgo}<br>
            <b>Detalle:</b> ${alerta.descripcion || 'Sin detalle'}<br>
            <small>${new Date(alerta.fecha_creacion).toLocaleString()}</small>
        `;

        if (esAdmin) {
            contenidoPopup += `<br><button onclick="eliminarAlerta(${alerta.id})" style="color:red; margin-top:5px;">Eliminar</button>`;
        }

        marcador.bindPopup(contenidoPopup);
    });

    document.getElementById('cant-alto').innerText = alto;
    document.getElementById('cant-medio').innerText = medio;
    document.getElementById('cant-bajo').innerText = bajo;
}

// Selección de punto en el mapa
function seleccionarCoordenada(e) {
    coordsSeleccionadas = e.latlng;
    document.getElementById('coordenadas-lbl').innerText = `${coordsSeleccionadas.lat.toFixed(4)}, ${coordsSeleccionadas.lng.toFixed(4)}`;

    if (marcadorTemporal) {
        mapa.removeLayer(marcadorTemporal);
    }

    marcadorTemporal = L.marker([coordsSeleccionadas.lat, coordsSeleccionadas.lng]).addTo(mapa);
    document.getElementById('form-alerta').style.display = 'flex';
}

// Guardar Alerta en la Base de Datos
async function guardarAlerta(e) {
    e.preventDefault();

    if (!coordsSeleccionadas) {
        alert("Por favor selecciona una ubicación en el mapa primero.");
        return;
    }

    const tipo = document.getElementById('tipo-riesgo').value;
    const nivel_riesgo = document.getElementById('nivel-riesgo').value;
    const descripcion = document.getElementById('descripcion-riesgo').value;

    const { error } = await supabaseClient.from('alertas').insert([
        {
            tipo: tipo,
            nivel_riesgo: nivel_riesgo,
            descripcion: descripcion,
            latitud: coordsSeleccionadas.lat,
            longitud: coordsSeleccionadas.lng
        }
    ]);

    if (error) {
        alert("Error al guardar la alerta: " + error.message);
    } else {
        alert("¡Alerta creada con éxito!");
        cancelarAlerta();
        location.reload(); // Recargar para mostrar los datos actualizados
    }
}

function cancelarAlerta() {
    document.getElementById('form-alerta').style.display = 'none';
    if (marcadorTemporal) mapa.removeLayer(marcadorTemporal);
    coordsSeleccionadas = null;
}

// Autenticación de Administrador
function mostrarModalLogin() { document.getElementById('modal-login').style.display = 'flex'; }
function cerrarModalLogin() { document.getElementById('modal-login').style.display = 'none'; }

async function iniciarSesionAdmin(e) {
    e.preventDefault();
    const email = document.getElementById('email-admin').value;
    const password = document.getElementById('pass-admin').value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        alert("Error de credenciales: " + error.message);
    } else {
        cerrarModalLogin();
        comprobarSesion();
    }
}

async function comprobarSesion() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        esAdmin = true;
        document.getElementById('btn-login-modal').style.display = 'none';
        document.getElementById('btn-subir-datos').style.display = 'inline-block';
        document.getElementById('btn-logout').style.display = 'inline-block';
    }
}

function abrirSelectorExcel() {
    if (!esAdmin) {
        alert('Debes iniciar sesión como administrador.');
        return;
    }
    document.getElementById('input-excel').click();
}

async function procesarExcel(evento) {
    const archivo = evento.target.files[0];
    const estado = document.getElementById('estado-carga');
    evento.target.value = '';
    if (!archivo || !esAdmin) return;

    estado.textContent = 'Leyendo archivo...';
    try {
        const datos = await archivo.arrayBuffer();
        const libro = XLSX.read(datos, { type: 'array', cellDates: true });
        const nombreHoja = libro.SheetNames[0];
        const filas = XLSX.utils.sheet_to_json(libro.Sheets[nombreHoja], { defval: null });
        const alertas = filas.map(convertirFilaAAlerta).filter(Boolean);

        if (!alertas.length) {
            throw new Error('No se encontraron filas con coordenadas válidas. Usa latitud/longitud o COORDENADAS_X/COORDENADAS_Y.');
        }

        for (let inicio = 0; inicio < alertas.length; inicio += TAMANO_BLOQUE_IMPORTACION) {
            const bloque = alertas.slice(inicio, inicio + TAMANO_BLOQUE_IMPORTACION);
            const { error } = await supabaseClient.from('alertas').insert(bloque);
            if (error) throw error;
            estado.textContent = `Cargando datos: ${Math.min(inicio + bloque.length, alertas.length)} de ${alertas.length}`;
        }

        estado.textContent = `Se agregaron ${alertas.length} alertas correctamente.`;
        alert(`Se agregaron ${alertas.length} registros al mapa y al dashboard.`);
        await cargarAlertas();
    } catch (error) {
        console.error('Error al importar Excel:', error);
        estado.textContent = 'No se pudo importar el archivo.';
        alert(`Error al importar el Excel: ${error.message}`);
    }
}

function convertirFilaAAlerta(fila) {
    const columnas = Object.keys(fila).reduce((resultado, columna) => {
        resultado[normalizarColumna(columna)] = fila[columna];
        return resultado;
    }, {});

    let latitud = obtenerNumero(columnas, ['latitud', 'lat', 'latitude']);
    let longitud = obtenerNumero(columnas, ['longitud', 'lon', 'lng', 'longitude']);

    if (!Number.isFinite(latitud) || !Number.isFinite(longitud) || Math.abs(latitud) > 90 || Math.abs(longitud) > 180) {
        const este = obtenerNumero(columnas, ['coordenadasx', 'x', 'este', 'easting']);
        const norte = obtenerNumero(columnas, ['coordenadasy', 'y', 'norte', 'northing']);
        if (!Number.isFinite(este) || !Number.isFinite(norte)) return null;
        const coordenadas = convertirUtmALatLon(este, norte, 16);
        latitud = coordenadas.latitud;
        longitud = coordenadas.longitud;
    }

    const nivelOriginal = obtenerValor(columnas, ['nivelriesgo', 'nivel', 'riesgo', 'gradoderiesgoqueseviveensucomunidadanteinundaciones']);
    const nivelRiesgo = convertirNivelRiesgo(nivelOriginal);
    const tipo = obtenerValor(columnas, ['tipo', 'tiporiesgo', 'evento']) || 'Inundación';
    const descripcion = obtenerValor(columnas, ['descripcion', 'detalle', 'observaciones', 'podriadefinirensuspropiaspalabrasqueesinundacion']) || 'Registro importado desde Excel';
    return { tipo, nivel_riesgo: nivelRiesgo, descripcion: String(descripcion), latitud, longitud };
}

function normalizarColumna(valor) {
    return String(valor).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function obtenerValor(columnas, nombres) {
    for (const nombre of nombres) {
        if (columnas[nombre] !== null && columnas[nombre] !== undefined && columnas[nombre] !== '') return columnas[nombre];
    }
    return null;
}

function obtenerNumero(columnas, nombres) {
    const valor = obtenerValor(columnas, nombres);
    if (typeof valor === 'number') return valor;
    if (typeof valor !== 'string') return Number.NaN;
    const numero = Number(valor.trim().replace(',', '.'));
    return Number.isFinite(numero) ? numero : Number.NaN;
}

function convertirNivelRiesgo(valor) {
    const texto = String(valor || '').trim().toLowerCase();
    if (texto.includes('alto')) return 'Alto';
    if (texto.includes('medio') || texto.includes('moderado')) return 'Medio';
    if (texto.includes('bajo')) return 'Bajo';
    const numero = Number(texto.replace(',', '.'));
    if (Number.isFinite(numero)) {
        if (numero >= 5) return 'Alto';
        if (numero >= 3) return 'Medio';
    }
    return 'Bajo';
}

function convertirUtmALatLon(este, norte, zona) {
    const semiejeMayor = 6378137;
    const excentricidad = 0.0818191908426;
    const escala = 0.9996;
    const x = este - 500000;
    const ePrimaCuadrada = excentricidad ** 2 / (1 - excentricidad ** 2);
    const meridianoCentral = ((zona - 1) * 6 - 180 + 3) * Math.PI / 180;
    const arcoMeridiano = norte / escala;
    const pie = arcoMeridiano / (semiejeMayor * (1 - excentricidad ** 2 / 4 - 3 * excentricidad ** 4 / 64 - 5 * excentricidad ** 6 / 256));
    const senoPie = Math.sin(pie);
    const cosenoPie = Math.cos(pie);
    const radioCurvatura = semiejeMayor / Math.sqrt(1 - excentricidad ** 2 * senoPie ** 2);
    const radioMeridiano = semiejeMayor * (1 - excentricidad ** 2) / (1 - excentricidad ** 2 * senoPie ** 2) ** 1.5;
    const tangentePie = Math.tan(pie);
    const d = x / (radioCurvatura * escala);
    const latitud = pie - (radioCurvatura * tangentePie / radioMeridiano) * (d ** 2 / 2 - (5 + 3 * tangentePie ** 2 + 10 * ePrimaCuadrada * cosenoPie ** 2 - 4 * ePrimaCuadrada ** 2 - 9 * excentricidad ** 2) * d ** 4 / 24);
    const longitud = meridianoCentral + (d - (1 + 2 * tangentePie ** 2 + ePrimaCuadrada * cosenoPie ** 2) * d ** 3 / 6) / cosenoPie;
    return { latitud: latitud * 180 / Math.PI, longitud: longitud * 180 / Math.PI };
}

async function cerrarSesion() {
    await supabaseClient.auth.signOut();
    location.reload();
}

async function eliminarAlerta(id) {
    if (confirm("¿Deseas eliminar esta alerta?")) {
        const { error } = await supabaseClient.from('alertas').delete().eq('id', id);
        if (error) alert("No tienes permisos o ocurrió un error.");
        else location.reload();
    }
}