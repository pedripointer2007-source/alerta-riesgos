// Configuración de Supabase
const SUPABASE_URL = "https://ctlaralhkyzrtxnyvljw.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_pb36ddQJ_qh8NGwaqvuKVw_Hkeo25JN"; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let mapa;
let marcadorTemporal = null;
let coordsSeleccionadas = null;
let esAdmin = false;

// Inicialización de Mapa (Centrado por defecto)
window.onload = function () {
    // Inicializar mapa centrado en coordenadas generales (ej: Managua/León o tu ciudad)
    mapa = L.map('mapa').setView([12.435, -86.878], 13);

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
        }).addTo(mapa);

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
        document.getElementById('btn-logout').style.display = 'inline-block';
    }
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