// --- VARIABLES GLOBALES Y ALMACENAMIENTO ---
let map, baseLayer, userMarker = null, currentLatLng = null;
let isDarkMode = false;
let destinoMarcadorTemp = null;
let temporizadorBusqueda = null;
let capaParaderos = L.layerGroup();
let paraderoSeleccionadoActual = null; // Para gestionar el favorito del Bottom Sheet

// Memoria de la App (Base de Datos RAM y Persistencia en Disco)
let lineasAgrupadas = {}; 
let paraderosGlobales = {}; 
let favoritos = JSON.parse(localStorage.getItem('favs')) || [];
let rutasActivasGuardadas = JSON.parse(localStorage.getItem('rutas_activas')) || [];

// --- 1. CONFIGURACIÓN FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyDaourUoy1CgLslN9UxO-9DyTz3IjhRVpI",
    authDomain: "linea-map.firebaseapp.com",
    projectId: "linea-map",
    storageBucket: "linea-map.firebasestorage.app",
    messagingSenderId: "350770978437",
    appId: "1:350770978437:web:cf2ef2b5e9b4c6a33e13ec",
    measurementId: "G-LD6E7P550C"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 2. GESTIÓN DE PANTALLAS E UI GLOBALES ---
window.entrarInvitado = function() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('map').style.display = 'block';
    document.getElementById('top-bar').classList.remove('hidden-ui');
    document.querySelector('.btn-locate').classList.remove('hidden-ui');
    initMap();
};

window.toggleTheme = function() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-theme');
    document.getElementById('btn-theme').innerText = isDarkMode ? '☀️' : '🌙';
};

function obtenerTarifaActual(tarifaDia, tarifaNoche) {
    const horaLocal = new Date().getHours();
    const esNoche = (horaLocal >= 22 || horaLocal < 7);
    const precioDia = tarifaDia || "1000";
    const precioNoche = tarifaNoche || "1300";
    return esNoche ? `<span class="tarifa-badge noche">🌙 $${precioNoche} (Nocturna)</span>` : `<span class="tarifa-badge dia">☀️ $${precioDia} (Diurna)</span>`;
}

// --- 3. MENÚ LATERAL Y REACTIVIDAD ---
window.toggleMenu = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    } else {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        renderizarListaLineasGlobal();
    }
};

window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.sidebar-content').forEach(content => content.classList.add('hidden'));
    
    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.getElementById(`sidebar-${tabName}-content`).classList.remove('hidden');
    
    if (tabName === 'favs') renderizarFavoritosSidebar();
};

window.verFavoritos = function() {
    toggleMenu();
    switchTab('favs');
};

// --- 4. RENDERIZADO DE PANELES (SIDEBAR) ---
window.renderizarListaLineasGlobal = function() {
    const contenedor = document.getElementById('sidebar-lineas-content');
    contenedor.innerHTML = "";

    Object.keys(lineasAgrupadas).forEach(nombreLinea => {
        const info = lineasAgrupadas[nombreLinea];
        const idaActiva = info.ida && map.hasLayer(info.ida.capa) ? 'checked' : '';
        const vueltaActiva = info.vuelta && map.hasLayer(info.vuelta.capa) ? 'checked' : '';
        
        const tarjeta = document.createElement('div');
        tarjeta.className = 'line-control-card';
        tarjeta.innerHTML = `
            <div class="line-control-header">🚕 ${nombreLinea}<br>${obtenerTarifaActual(info.tDia, info.tNoche)}<hr></div>
            ${info.ida ? `<div class="toggle-row"><div class="toggle-label"><div class="color-dot" style="background-color: ${info.ida.color}"></div>Ida</div><label class="switch"><input type="checkbox" ${idaActiva} onchange="alternarCapaEspecifica('${nombreLinea}', 'ida', this.checked)"><span class="slider"></span></label></div>` : ''}
            ${info.vuelta ? `<div class="toggle-row"><div class="toggle-label"><div class="color-dot" style="background-color: ${info.vuelta.color}"></div>Vuelta</div><label class="switch"><input type="checkbox" ${vueltaActiva} onchange="alternarCapaEspecifica('${nombreLinea}', 'vuelta', this.checked)"><span class="slider"></span></label></div>` : ''}
        `;
        contenedor.appendChild(tarjeta);
    });
};

window.renderizarFavoritosSidebar = function() {
    const contenedor = document.getElementById('sidebar-favs-content');
    contenedor.innerHTML = "";
    
    if (favoritos.length === 0) {
        contenedor.innerHTML = '<p style="text-align: center; color: #888; margin-top: 20px;">Aún no tienes paraderos guardados.</p>';
        return;
    }
    
    favoritos.forEach(id => {
        const paradero = paraderosGlobales[id];
        if (!paradero) return;
        
        const card = document.createElement('div');
        card.className = 'line-control-card';
        card.style.cursor = 'pointer';
        card.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: center;"><div><strong style="color: #1a5276; font-size: 14px;">🚏 ${paradero.nombre}</strong><br><span style="font-size: 12px; color: #666;">${paradero.direccion}</span></div><button style="background:none; border:none; color:#f1c40f; font-size:24px; cursor:pointer; padding:0;" onclick="event.stopPropagation(); toggleParaderoFavoritoById('${id}')">★</button></div>`;
        
        card.onclick = () => {
            toggleMenu();
            map.flyTo([paradero.coordenadas.latitude, paradero.coordenadas.longitude], 18, { animate: true, duration: 1.0 });
            setTimeout(() => abrirBottomSheet(paradero), 800);
        };
        contenedor.appendChild(card);
    });
};

// --- 5. INICIALIZACIÓN DEL MAPA ---
function initMap() {
    const limites = L.latLngBounds(L.latLng(-18.55, -70.35), L.latLng(-18.35, -70.20));
    map = L.map('map', { center: [-18.4783, -70.3126], zoom: 14, minZoom: 13, maxBounds: limites, zoomControl: false });
    baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    descargarRutas();
    cargarParaderos();

    const gpsIcon = L.divIcon({ className: 'user-location-icon', html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="6" fill="#107c91" stroke="white" stroke-width="2"/><circle cx="12" cy="12" r="10" fill="none" stroke="#107c91" stroke-width="2" stroke-dasharray="4 2"/></svg>`, iconSize: [24, 24], iconAnchor: [12, 12] });
    userMarker = L.marker([0, 0], { icon: gpsIcon }).addTo(map);

    map.locate({ watch: true, setView: false, enableHighAccuracy: true }); 
    map.on('locationfound', (e) => { currentLatLng = e.latlng; userMarker.setLatLng(e.latlng); });
    window.centrarEnUsuario = function() { if (currentLatLng) map.setView(currentLatLng, 18); };
    map.on('click', cerrarBottomSheet);

    if (map.getZoom() >= 16) capaParaderos.addTo(map);
    map.on('zoomend', function() {
        if (map.getZoom() >= 16) { if (!map.hasLayer(capaParaderos)) map.addLayer(capaParaderos); }
        else { if (map.hasLayer(capaParaderos)) map.removeLayer(capaParaderos); }
    });
}

// --- 6. DATOS DE FIREBASE Y PERSISTENCIA DE RUTAS ---
function descargarRutas() {
    db.collection("lineas").get().then((querySnapshot) => {
        lineasAgrupadas = {}; 
        querySnapshot.forEach((doc) => {
            const datos = doc.data();
            let nombreBase = (datos.nombre || "Sin Nombre").replace(/ \((Ida|Vuelta|ida|vuelta)\)/gi, "").trim();
            const cIda = datos.color_ida || datos.color || "#1e90ff";
            const cVuelta = datos.color_vuelta || datos.color || "#ba1a3a";
            
            if (!lineasAgrupadas[nombreBase]) lineasAgrupadas[nombreBase] = { ida: null, vuelta: null, tDia: datos.tarifaDia || 1000, tNoche: datos.tarifaNoche || 1300 };

            const parsearCapa = (coords, dir, color) => {
                if (!coords || String(coords).trim() === "") return null;
                try {
                    let c = typeof coords === 'string' ? JSON.parse(coords) : coords;
                    const feat = { "type": "Feature", "properties": { "nombre": `${nombreBase} (${dir})` }, "geometry": { "type": "LineString", "coordinates": c } };
                    let flechas = null;
                    const capa = L.geoJSON(feat, {
                        style: { color: color, weight: 6, opacity: 0.85 },
                        onEachFeature: function (f, l) { flechas = L.polylineDecorator(l, { patterns: [{ offset: 25, repeat: 80, symbol: L.Symbol.arrowHead({ pixelSize: 14, polygon: true, pathOptions: { stroke: true, color: '#ffffff', fillColor: color, fillOpacity: 1, weight: 2 } }) }] }); }
                    }).bindPopup(`<div style="text-align:center; font-family:'Poppins';"><b>🚕 ${nombreBase} (${dir})</b><br><br>${obtenerTarifaActual(datos.tarifaDia||1000, datos.tarifaNoche||1300)}</div>`);
                    return { capa: capa, flechas: flechas, color: color };
                } catch (e) { return null; }
            };

            if (datos.ruta_ida) lineasAgrupadas[nombreBase].ida = parsearCapa(datos.ruta_ida, "Ida", cIda);
            if (datos.ruta_vuelta) lineasAgrupadas[nombreBase].vuelta = parsearCapa(datos.ruta_vuelta, "Vuelta", cVuelta);
        });

        // Aplicar persistencia de rutas activas al iniciar
        rutasActivasGuardadas.forEach(idRuta => {
            const [nBase, dir] = idRuta.split('_');
            const info = lineasAgrupadas[nBase];
            if (info) {
                const objRuta = dir === 'ida' ? info.ida : info.vuelta;
                if (objRuta && objRuta.capa) {
                    objRuta.capa.addTo(map);
                    if (objRuta.flechas) objRuta.flechas.addTo(map);
                }
            }
        });
    }).catch(console.error);
}

function cargarParaderos() {
    db.collection("paraderos").get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            data.id = doc.id;
            paraderosGlobales[data.id] = data; // Guarda en memoria RAM
            crearMarcadorParadero(data);
        });
    }).catch(console.error);
}

function crearMarcadorParadero(datos) {
    if (!datos.coordenadas) return;
    const iconoAutito = L.divIcon({ className: 'custom-paradero-icon', html: `<div style="background: white; border: 2px solid #1a5276; border-radius: 8px; padding: 4px; box-shadow: 0 4px 8px rgba(0,0,0,0.3);"><svg width="20" height="20" viewBox="0 0 24 24" fill="#1a5276"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg></div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
    const marker = L.marker([datos.coordenadas.latitude, datos.coordenadas.longitude], { icon: iconoAutito }).addTo(capaParaderos);
    
    marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        abrirBottomSheet(datos);
        map.flyTo([datos.coordenadas.latitude, datos.coordenadas.longitude], 17, { animate: true, duration: 0.8 });
    });
}

// --- 7. CONTROL DE RUTAS (CON PERSISTENCIA) ---
window.alternarCapaEspecifica = function(nombreBase, direccion, encender) {
    const info = lineasAgrupadas[nombreBase];
    if (!info) return;

    const objetoRuta = direccion === 'ida' ? info.ida : info.vuelta;
    if (!objetoRuta || !objetoRuta.capa) return;

    if (encender) {
        objetoRuta.capa.addTo(map);
        if (objetoRuta.flechas) objetoRuta.flechas.addTo(map);
        map.fitBounds(objetoRuta.capa.getBounds(), { padding: [40, 40] });
    } else {
        map.removeLayer(objetoRuta.capa);
        if (objetoRuta.flechas) map.removeLayer(objetoRuta.flechas);
    }

    // Persistencia LocalStorage
    const idRuta = `${nombreBase}_${direccion}`;
    const idx = rutasActivasGuardadas.indexOf(idRuta);
    if (encender && idx === -1) rutasActivasGuardadas.push(idRuta);
    else if (!encender && idx !== -1) rutasActivasGuardadas.splice(idx, 1);
    localStorage.setItem('rutas_activas', JSON.stringify(rutasActivasGuardadas));

    // Refrescar Sidebar si está abierto
    if (document.getElementById('sidebar').classList.contains('active')) {
        renderizarListaLineasGlobal();
    }
};

// --- 8. BOTTOM SHEET (CON TARJETAS DE SWITCHES) ---
window.abrirBottomSheet = function(datos) {
    paraderoSeleccionadoActual = datos;
    document.getElementById('bottom-sheet').classList.add('active');
    document.getElementById('sheet-title').innerText = datos.nombre || "Paradero";
    document.getElementById('sheet-subtitle').innerText = datos.direccion || "";
    
    const idUnico = datos.id || datos.nombre; 
    const btnFav = document.getElementById('btn-star-paradero');
    
    if (favoritos.includes(idUnico)) { btnFav.innerText = "★"; btnFav.style.color = "#f1c40f"; } 
    else { btnFav.innerText = "☆"; btnFav.style.color = "#888"; }
    
    const contenedor = document.getElementById('sheet-lines');
    contenedor.innerHTML = ""; 
    
    if (datos.lineasQuePasan && datos.lineasQuePasan.length > 0) {
        datos.lineasQuePasan.forEach(info => {
            let nombreLinea = typeof info === 'string' ? info : info.linea;
            let destinoFinal = typeof info === 'string' ? "Ver recorrido" : info.destino;
            const infoRuta = lineasAgrupadas[nombreLinea];
            
            let colorBase = infoRuta && infoRuta.ida ? infoRuta.ida.color : '#444';

            const card = document.createElement('div');
            card.className = 'line-control-card';
            card.style.marginBottom = '10px';
            
            let htmlHTML = `
                <div style="display:flex; align-items:center; margin-bottom: 10px;">
                    <div class="line-id" style="background-color: ${colorBase}; padding: 4px 8px; border-radius: 6px; color: white; font-weight: bold; font-size: 13px; margin-right: 10px; white-space:nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">🚕 ${nombreLinea}</div>
                    <div style="font-size: 13px; line-height: 1.2; color:#333;"><strong>Hacia:</strong><br>${destinoFinal}</div>
                </div>
            `;
            
            if (infoRuta && infoRuta.ida) {
                const idaCheck = map.hasLayer(infoRuta.ida.capa) ? 'checked' : '';
                htmlHTML += `<div class="toggle-row"><div class="toggle-label"><div class="color-dot" style="background-color: ${infoRuta.ida.color}"></div>Ida</div><label class="switch"><input type="checkbox" ${idaCheck} onchange="alternarCapaEspecifica('${nombreLinea}', 'ida', this.checked)"><span class="slider"></span></label></div>`;
            }
            if (infoRuta && infoRuta.vuelta) {
                const vueltaCheck = map.hasLayer(infoRuta.vuelta.capa) ? 'checked' : '';
                htmlHTML += `<div class="toggle-row"><div class="toggle-label"><div class="color-dot" style="background-color: ${infoRuta.vuelta.color}"></div>Vuelta</div><label class="switch"><input type="checkbox" ${vueltaCheck} onchange="alternarCapaEspecifica('${nombreLinea}', 'vuelta', this.checked)"><span class="slider"></span></label></div>`;
            }
            
            card.innerHTML = htmlHTML;
            contenedor.appendChild(card);
        });
    } else {
        contenedor.innerHTML = "<p style='font-size:13px; color:#888; text-align:center;'>Sin información de líneas en este paradero</p>";
    }
};

window.cerrarBottomSheet = function() { document.getElementById('bottom-sheet').classList.remove('active'); };

window.toggleParaderoFavoritoActual = function() {
    if (paraderoSeleccionadoActual) {
        toggleParaderoFavoritoById(paraderoSeleccionadoActual.id || paraderoSeleccionadoActual.nombre);
    }
};

window.toggleParaderoFavoritoById = function(idParadero) {
    if (!idParadero) return;
    const index = favoritos.indexOf(idParadero);
    if (index === -1) favoritos.push(idParadero);
    else favoritos.splice(index, 1);
    
    localStorage.setItem('favs', JSON.stringify(favoritos));
    
    // Sincronizar UI de la estrella en el Bottom Sheet si está abierto
    const btn = document.getElementById('btn-star-paradero');
    if (btn && paraderoSeleccionadoActual && (paraderoSeleccionadoActual.id === idParadero || paraderoSeleccionadoActual.nombre === idParadero)) {
        if (index === -1) { btn.innerText = "★"; btn.style.color = "#f1c40f"; }
        else { btn.innerText = "☆"; btn.style.color = "#888"; }
    }
    
    renderizarFavoritosSidebar();
};

// --- 9. BUSCADOR DINÁMICO ---
window.manejarInputBusqueda = function() {
    const query = document.getElementById('global-search').value.trim();
    const cajaSugerencias = document.getElementById('search-suggestions');

    if (query.length < 3) { cajaSugerencias.classList.remove('active'); return; }

    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(async () => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, Arica, Chile&limit=5`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.length > 0) {
                let html = '';
                data.forEach(res => {
                    const partesNombre = res.display_name.split(',');
                    const tituloPrincipal = partesNombre[0];
                    const subtituloCalle = partesNombre.slice(1, 3).join(', ').trim(); 
                    const tituloSeguro = tituloPrincipal.replace(/'/g, "\\'");
                    html += `<li class="suggestion-item" onclick="seleccionarSugerencia(${res.lat}, ${res.lon}, '${tituloSeguro}')"><span class="suggestion-icon">📍</span><b>${tituloPrincipal}</b><br><small style="color:#888;">${subtituloCalle}</small></li>`;
                });
                cajaSugerencias.innerHTML = html;
                cajaSugerencias.classList.add('active');
            } else {
                cajaSugerencias.innerHTML = '<li class="suggestion-item" style="padding:10px;">No se encontraron lugares.</li>';
                cajaSugerencias.classList.add('active');
            }
        } catch (error) { console.error("Error búsqueda:", error); }
    }, 600);
};

window.seleccionarSugerencia = function(lat, lng, nombre) {
    document.getElementById('global-search').value = nombre;
    document.getElementById('search-suggestions').classList.remove('active');
    irADestino(lat, lng, nombre);
};

window.irADestino = function(lat, lng, nombre) {
    const ubicacion = L.latLng(lat, lng);
    if (destinoMarcadorTemp) map.removeLayer(destinoMarcadorTemp);
    destinoMarcadorTemp = L.marker(ubicacion).addTo(map).bindPopup(`<div style="font-family:'Poppins';">📍 <b>${nombre}</b></div>`).openPopup();
    map.flyTo(ubicacion, 17, { animate: true, duration: 1.5 });
};