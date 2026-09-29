const startEl = document.getElementById('start');
const destEl = document.getElementById('destination');
const routeBtn = document.getElementById('routeBtn');
const statusEl = document.getElementById('status');
const cardsEl = document.getElementById('cards');
const explanationEl = document.getElementById('explanation');
const routeTitleEl = document.getElementById('routeTitle');
const routeSubtitleEl = document.getElementById('routeSubtitle');
const riskBadgeEl = document.getElementById('riskBadge');
const systemStatusEl = document.getElementById('systemStatus');
const mapEmptyEl = document.querySelector('.map-empty');

const map = L.map('map').setView([23.78, 90.39], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let routeLayer = null;
let markers = [];

function setSystemStatus(text, state = 'ready') {
  systemStatusEl.textContent = text;
  systemStatusEl.parentElement.className = `system-status ${state}`;
}

async function loadLocations() {
  const res = await fetch('/api/locations');
  const data = await res.json();
  for (const name of data.locations) {
    const a = document.createElement('option');
    a.value = name; a.textContent = name;
    startEl.appendChild(a);
    const b = document.createElement('option');
    b.value = name; b.textContent = name;
    destEl.appendChild(b);
  }
  startEl.value = 'Mirpur 10';
  destEl.value = 'Dhanmondi';
}

function setStatus(text, state = '') {
  statusEl.textContent = text;
  statusEl.className = `status ${state}`;
}

function updateRiskBars(counts) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0) || 1;
  for (const level of ['Low', 'Medium', 'High']) {
    const percent = Math.round((counts[level] / total) * 100);
    const bar = document.querySelector(`.${level.toLowerCase()}-bar`);
    bar.style.width = `${percent}%`;
    bar.parentElement.nextElementSibling.textContent = counts[level];
  }
}

function renderResult(data) {
  if (mapEmptyEl) mapEmptyEl.remove();
  cardsEl.innerHTML = `
    <div class="metric-card"><span>Distance</span><strong>${data.distance_km}<em> km</em></strong><small>estimated road distance</small></div>
    <div class="metric-card"><span>Route cost</span><strong>${data.risk_weighted_cost}</strong><small>risk-weighted meters</small></div>
    <div class="metric-card"><span>Risk edges</span><strong>${Object.values(data.risk_edge_counts).reduce((sum, count) => sum + count, 0)}</strong><small>segments evaluated</small></div>
    <div class="metric-card"><span>Engine</span><strong>A*</strong><small>with risk penalty</small></div>
  `;

  routeTitleEl.textContent = `${data.start} to ${data.destination}`;
  routeSubtitleEl.textContent = `Recommended using ${data.context.weather} conditions, a ${data.context.vehicle_type.toLowerCase()}, and a ${data.context.hour}:00 departure.`;
  riskBadgeEl.className = `risk-badge risk-${data.overall_risk.toLowerCase()}`;
  riskBadgeEl.innerHTML = `<i></i><span>${data.overall_risk} overall risk</span>`;
  updateRiskBars(data.risk_edge_counts);
  explanationEl.innerHTML = `
    <p><strong>${data.risk_edge_counts.High > 0 ? 'The route balances distance with road safety.' : 'A clear run with no high-risk segments detected.'}</strong></p>
    <p>The trained model scores each road segment for the selected context. A* then uses those scores as a penalty, so the recommendation considers both distance and predicted risk.</p>
  `;

  if (routeLayer) map.removeLayer(routeLayer);
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  routeLayer = L.polyline(data.path_points, { weight: 6 }).addTo(map);
  map.fitBounds(routeLayer.getBounds(), { padding: [30, 30] });

  const s = L.marker([data.start_coordinate.lat, data.start_coordinate.lon]).addTo(map).bindPopup('Start: ' + data.start);
  const d = L.marker([data.destination_coordinate.lat, data.destination_coordinate.lon]).addTo(map).bindPopup('Destination: ' + data.destination);
  markers.push(s, d);
}

routeBtn.addEventListener('click', async () => {
  if (startEl.value === destEl.value) {
    setStatus('Choose two different locations.', 'error');
    return;
  }
  setStatus('Evaluating road network...', 'loading');
  routeBtn.disabled = true;
  routeBtn.classList.add('loading');
  setSystemStatus('Calculating route...', 'loading');
  try {
    const res = await fetch('/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: startEl.value,
        destination: destEl.value,
        weather: document.getElementById('weather').value,
        vehicle_type: document.getElementById('vehicle_type').value,
        hour: Number(document.getElementById('hour').value),
        month: Number(document.getElementById('month').value)
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Request failed');
    renderResult(data);
    setStatus('Route ready to dispatch.', 'success');
    setSystemStatus('Planner online', 'ready');
  } catch (err) {
    setStatus(err.message, 'error');
    setSystemStatus('Planner needs attention', 'error');
  } finally {
    routeBtn.disabled = false;
    routeBtn.classList.remove('loading');
  }
});

Promise.all([
  loadLocations(),
  fetch('/api/health').then(res => res.json()).then(data => setSystemStatus(data.model_loaded ? 'Planner online' : 'Ready to calculate', 'ready'))
]).catch(err => {
  setStatus(err.message, 'error');
  setSystemStatus('Connection unavailable', 'error');
});
