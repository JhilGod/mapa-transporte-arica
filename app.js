document.addEventListener("DOMContentLoaded", function() {

    // 1. Inicializar Mapa
    const map = L.map('map', { zoomControl: false }).setView([-18.4783, -70.3126], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    setTimeout(() => { map.invalidateSize(); }, 500);

    // 2. Base de Datos de Rutas y Paradas (Estructura para el boceto)
    const datosTransporte = {
        linea5: {
            nombre: "Línea 5", tarifaD: 1000, tarifaN: 1100, color: "red",
            ruta: [[-18.4783, -70.3126], [-18.4800, -70.3000], [-18.4850, -70.2950], [-18.4900, -70.2900]],
            paradas: [
                { nombre: "UTA", color: "red" },
                { nombre: "Santo Tomás", color: "purple" },
                { nombre: "Hospital", color: "blue" },
                { nombre: "21 De Mayo", color: "orange" },
                { nombre: "Calle Maipú", color: "red" }
            ]
        }
    };

    let capaRutaActiva = null;

    // 3. Función: Transición a Modo Ruta (Al apretar la flecha ➔)
    window.iniciarRuta = function() {
        const lineaSeleccionada = document.getElementById('lineaSelect').value;
        const paradaSeleccionada = document.getElementById('paradaSelect').options[document.getElementById('paradaSelect').selectedIndex].text;

        if (!lineaSeleccionada) {
            alert("Por favor, selecciona una línea primero.");
            return;
        }

        // Simular que siempre usamos los datos de la línea 5 para este ejemplo
        const datos = datosTransporte.linea5; 

        // Cambiar Interfaz (Ocultar Home, Mostrar Header y Bottom Sheet)
        document.getElementById('homePanel').classList.add('hidden');
        document.getElementById('routeHeader').classList.remove('hidden');
        document.getElementById('stopsSheet').classList.remove('hidden');

        // Actualizar Textos
        document.getElementById('destinoLabel').innerText = paradaSeleccionada;
        document.getElementById('tDiurno').innerText = datos.tarifaD;
        document.getElementById('tNocturno').innerText = datos.tarifaN;

        // Dibujar Ruta en el Mapa
        if (capaRutaActiva) { map.removeLayer(capaRutaActiva); }
        capaRutaActiva = L.polyline(datos.ruta, { color: '#3498db', weight: 6 }).addTo(map);
        map.fitBounds(capaRutaActiva.getBounds());

        // Llenar la lista de paradas (Como en el boceto 3)
        const listaHTML = document.getElementById('listaParadas');
        listaHTML.innerHTML = '';
        datos.paradas.forEach(parada => {
            listaHTML.innerHTML += `
                <li>
                    <span>${parada.nombre}</span>
                    <div class="dot ${parada.color}"></div>
                </li>
            `;
        });
    };

    // 4. Función: Volver al Inicio (Al apretar ❮)
    window.volverInicio = function() {
        document.getElementById('homePanel').classList.remove('hidden');
        document.getElementById('routeHeader').classList.add('hidden');
        document.getElementById('stopsSheet').classList.add('hidden');

        if (capaRutaActiva) { map.removeLayer(capaRutaActiva); }
        map.setView([-18.4783, -70.3126], 14);
        
        // Resetear Tarifas
        document.getElementById('tDiurno').innerText = "1000";
        document.getElementById('tNocturno').innerText = "1100";
    };
});