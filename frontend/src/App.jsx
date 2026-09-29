import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import RiderProfile from './RiderProfile'
import AdminApp from './AdminApp'
import { TranslationBoundary } from './i18n'

const defaultForm = { start: 'Mirpur 10', destination: 'Dhanmondi', weather: 'Clear', vehicle_type: 'Motorcycle', hour: 18, month: 9 }
const savedToken = localStorage.getItem('smartroute_token')

function App() {
  const [adminRoute, setAdminRoute] = useState(() => window.location.pathname === '/admin' || window.location.pathname === '/admin/')
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('smartroute_admin_token') || '')
  const [adminUser, setAdminUser] = useState(null)
  const [adminChecking, setAdminChecking] = useState(() => window.location.pathname === '/admin' || window.location.pathname === '/admin/')
  const [token, setToken] = useState(savedToken)
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' })
  const [authStatus, setAuthStatus] = useState({ text: '', type: '' })
  const [locations, setLocations] = useState([])
  const [form, setForm] = useState(defaultForm)
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState({ text: '', type: '' })
  const [system, setSystem] = useState('Connecting to planner')
  const [serviceHealth, setServiceHealth] = useState(null)
  const [servicePanelOpen, setServicePanelOpen] = useState(false)
  const [serviceRefreshing, setServiceRefreshing] = useState(false)
  const [serviceCheckedAt, setServiceCheckedAt] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('smartroute_theme') || 'light')
  const [language, setLanguage] = useState(() => localStorage.getItem('smartroute_language') || 'en')
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState('planner')
  const [routeMode, setRouteMode] = useState('fastest')
  const [avoidTolls, setAvoidTolls] = useState(false)
  const [avoidHighRisk, setAvoidHighRisk] = useState(true)
  const [selectedStops, setSelectedStops] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [orders, setOrders] = useState([])
  const [drivers, setDrivers] = useState([])
  const [routeHistory, setRouteHistory] = useState([])
  const [orderForm, setOrderForm] = useState({ customer_name: '', address: '', priority: 'Normal', time_window: '' })
  const [driverForm, setDriverForm] = useState({ name: '', phone: '', vehicle_type: 'Motorcycle' })
  const [orderStatus, setOrderStatus] = useState('')
  const [driverStatus, setDriverStatus] = useState('')
  const [driverLocation, setDriverLocation] = useState(null)
  const [liveTracking, setLiveTracking] = useState(false)
  const [deviationWarning, setDeviationWarning] = useState('')
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const routeLayer = useRef(null)
  const riskLayers = useRef([])
  const markers = useRef([])
  const alternativeLayers = useRef([])
  const driverMarker = useRef(null)
  const trackingWatchId = useRef(null)
  const serviceControlRef = useRef(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = language
    localStorage.setItem('smartroute_theme', theme)
    localStorage.setItem('smartroute_language', language)
  }, [theme, language])

  useEffect(() => {
    if (!adminRoute) { setAdminChecking(false); return undefined }
    const storedToken = localStorage.getItem('smartroute_admin_token')
    if (!storedToken) {
      window.history.replaceState(null, '', '/')
      setAdminRoute(false)
      setAdminChecking(false)
      return undefined
    }
    let active = true
    setAdminChecking(true)
    fetch('/api/admin/auth/me', { headers: { Authorization: `Bearer ${storedToken}` } }).then(async (response) => {
      if (!response.ok) throw new Error('Admin session expired')
      return response.json()
    }).then((data) => {
      if (active) { setAdminToken(storedToken); setAdminUser(data.admin); setAdminChecking(false) }
    }).catch(() => {
      localStorage.removeItem('smartroute_admin_token')
      if (active) { window.history.replaceState(null, '', '/'); setAdminRoute(false); setAdminToken(''); setAdminUser(null); setAdminChecking(false) }
    })
    return () => { active = false }
  }, [adminRoute])

  useEffect(() => {
    if (!token || adminRoute) return
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }).then((response) => {
      if (!response.ok) throw new Error('Session expired')
      return response.json()
    }).then((data) => setUser(data.user)).catch(() => { localStorage.removeItem('smartroute_token'); setToken(null) })
  }, [token, adminRoute])

  useEffect(() => {
    if (!token || adminRoute) return
    fetch('/api/locations').then((response) => response.json()).then((data) => {
      setLocations(data.locations)
      setForm((current) => ({ ...current, start: data.locations.includes(current.start) ? current.start : data.locations[0], destination: data.locations.includes(current.destination) ? current.destination : data.locations[1] }))
    }).catch(() => setStatus({ text: 'Could not load delivery locations.', type: 'error' }))
    fetch('/api/health').then((response) => response.json()).then((data) => { setServiceHealth(data); setServiceCheckedAt(new Date()); setSystem(data.status === 'ok' ? 'Planner online' : 'Planner needs attention') }).catch(() => setSystem('Backend unavailable'))
    fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()).then(setDashboard).catch(() => {})
    fetch('/api/orders', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()).then((data) => setOrders(data.orders || [])).catch(() => {})
    fetch('/api/drivers', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()).then((data) => setDrivers(data.drivers || [])).catch(() => {})
    fetch('/api/routes/history', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()).then((data) => setRouteHistory(data.routes || [])).catch(() => {})
  }, [token, adminRoute])

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    const map = L.map(mapRef.current, { zoomControl: false }).setView([23.78, 90.39], 12)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map)
    mapInstance.current = map
    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [user])

  useEffect(() => {
    if (!result || !mapInstance.current) return
    const map = mapInstance.current
    routeLayer.current?.remove()
    riskLayers.current.forEach((layer) => layer.remove())
    riskLayers.current = []
    alternativeLayers.current.forEach((layer) => layer.remove())
    alternativeLayers.current = []
    markers.current.forEach((marker) => marker.remove())
    markers.current = []

    const riskColors = { Low: '#2c8069', Medium: '#d28c38', High: '#cf5d53' }
    const riskCounts = result.risk_edge_counts || { Low: 0, Medium: 0, High: 0 }
    const totalRiskSegments = Object.values(riskCounts).reduce((sum, count) => sum + count, 0)
    const routePoints = Array.isArray(result.path_points) ? result.path_points : []
    if (routePoints.length > 0 && totalRiskSegments > 0) {
      const sequence = []
      for (const level of ['Low', 'Medium', 'High']) {
        for (let i = 0; i < (riskCounts[level] || 0); i += 1) sequence.push(level)
      }
      const step = Math.max(1, Math.floor(routePoints.length / Math.max(1, sequence.length)))
      for (let i = 0; i < sequence.length; i += 1) {
        const startIndex = i * step
        const endIndex = Math.min(routePoints.length - 1, (i + 1) * step)
        if (startIndex >= routePoints.length || startIndex >= endIndex) continue
        const segment = L.polyline(routePoints.slice(startIndex, endIndex + 1), { color: riskColors[sequence[i]], weight: 8, opacity: 0.92, lineCap: 'round' }).addTo(map)
        riskLayers.current.push(segment)
      }
    }

    routeLayer.current = L.polyline(result.path_points, { color: '#0f172a', weight: 3, opacity: 0.28, dashArray: '8 10', lineCap: 'round' }).addTo(map)
    alternativeLayers.current = (result.alternatives || []).map((alternative) => L.polyline(alternative.path_points, { color: '#7fa99b', weight: 3, opacity: 0.7, dashArray: '7 8' }).addTo(map))
    const start = L.circleMarker([result.start_coordinate.lat, result.start_coordinate.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#2c8069', fillOpacity: 1 }).addTo(map).bindPopup(`Pickup: ${result.start}`)
    const destination = L.circleMarker([result.destination_coordinate.lat, result.destination_coordinate.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#cf5d53', fillOpacity: 1 }).addTo(map).bindPopup(`Delivery: ${result.destination}`)
    markers.current = [start, destination]

    if (driverLocation) {
      driverMarker.current?.remove()
      driverMarker.current = L.circleMarker([driverLocation.lat, driverLocation.lon], { radius: 10, color: '#fff', weight: 3, fillColor: '#1d4ed8', fillOpacity: 1 }).addTo(map).bindPopup('Current driver location')
    }

    map.fitBounds(routeLayer.current.getBounds(), { padding: [30, 30] })
  }, [result, driverLocation])

  useEffect(() => {
    if (!servicePanelOpen) return
    const closeOnOutsideClick = (event) => {
      if (!serviceControlRef.current?.contains(event.target)) setServicePanelOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setServicePanelOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [servicePanelOpen])

  const update = (key, value) => setForm((current) => ({ ...current, [key]: ['hour', 'month'].includes(key) ? Number(value) : value }))
  const updateAuth = (key, value) => setAuthForm((current) => ({ ...current, [key]: value }))
  const submitAuth = async (event) => {
    event.preventDefault(); setAuthStatus({ text: 'Connecting...', type: 'loading' })
    try {
      const response = await fetch(`/api/auth/${authMode === 'login' ? 'login' : 'signup'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(authForm) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Authentication failed.')
      if (data.role === 'admin') { 
        localStorage.removeItem('smartroute_token')
        localStorage.setItem('smartroute_admin_token', data.token)
        setToken(null)
        setUser(null)
        setAdminToken(data.token)
        setAdminUser(data.user)
        setAdminChecking(false)
        window.history.pushState(null, '', '/admin')
        setAdminRoute(true)
        setAuthStatus({ text: '', type: '' })
        return
      }
      localStorage.removeItem('smartroute_admin_token')
      localStorage.setItem('smartroute_token', data.token); setToken(data.token); setUser(data.user); setAuthStatus({ text: '', type: '' })
    } catch (error) { setAuthStatus({ text: error.message, type: 'error' }) }
  }
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); localStorage.removeItem('smartroute_token'); setToken(null); setUser(null) }
  const logoutAdmin = async () => {
    try { await fetch('/api/admin/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } }) } catch {}
    localStorage.removeItem('smartroute_admin_token')
    setAdminToken('')
    setAdminUser(null)
    setAdminRoute(false)
    window.history.replaceState(null, '', '/')
  }
  const createOrder = async (event) => {
    event.preventDefault(); setOrderStatus('Saving order...')
    const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(orderForm) })
    const data = await response.json()
    if (!response.ok) return setOrderStatus(data.detail || 'Could not create order.')
    setOrders((current) => [data.order, ...current]); setOrderForm({ customer_name: '', address: '', priority: 'Normal', time_window: '' }); setOrderStatus('Order added to dispatch queue.'); refreshDashboard()
  }
  const refreshDashboard = async () => {
    const response = await fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } })
    if (response.ok) setDashboard(await response.json())
  }
  const refreshServiceHealth = async () => {
    setServiceRefreshing(true)
    try {
      const response = await fetch('/api/health')
      if (!response.ok) throw new Error('Health check failed')
      const data = await response.json()
      setServiceHealth(data)
      setServiceCheckedAt(new Date())
      setSystem(data.status === 'ok' ? 'Planner online' : 'Planner needs attention')
    } catch {
      setSystem('Backend unavailable')
    } finally {
      setServiceRefreshing(false)
    }
  }
  const createDriver = async (event) => {
    event.preventDefault(); setDriverStatus('Adding driver...')
    const response = await fetch('/api/drivers', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(driverForm) })
    const data = await response.json()
    if (!response.ok) return setDriverStatus(data.detail || 'Could not add driver.')
    setDrivers((current) => [...current, data.driver]); setDriverForm({ name: '', phone: '', vehicle_type: 'Motorcycle' }); setDriverStatus('Driver added.'); refreshDashboard()
  }
  const assignDriver = async (orderId, driverId) => {
    if (!driverId) return
    const response = await fetch(`/api/orders/${orderId}/assign?driver_id=${driverId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    const data = await response.json()
    if (!response.ok) return setOrderStatus(data.detail || 'Could not assign driver.')
    setOrders((current) => current.map((order) => order.id === orderId ? data.order : order))
    setDrivers((current) => current.map((driver) => driver.id === Number(driverId) ? { ...driver, status: 'Busy' } : driver))
    setOrderStatus(`${data.order.driver_name} assigned to ${data.order.order_code}.`); refreshDashboard()
  }
  const updateOrderStatus = async (orderId, status) => {
    const failedReason = status === 'Delayed' ? window.prompt('Reason for delay?') : ''
    if (status === 'Delayed' && !failedReason?.trim()) return
    const response = await fetch(`/api/orders/${orderId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status, failed_reason: failedReason || '' }) })
    const data = await response.json()
    if (!response.ok) return setOrderStatus(data.detail || 'Could not update order.')
    setOrders((current) => current.map((order) => order.id === orderId ? data.order : order))
      if (data.order.driver_id && ['Completed', 'Delayed', 'Cancelled'].includes(status)) setDrivers((current) => current.map((driver) => driver.id === data.order.driver_id ? { ...driver, status: 'Available' } : driver))
    setOrderStatus(`${data.order.order_code}: ${status.toLowerCase()}.`); refreshDashboard()
  }
  const updateDriverStatus = async (driverId, status) => {
    const response = await fetch(`/api/drivers/${driverId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) })
    const data = await response.json()
    if (!response.ok) return setDriverStatus(data.detail || 'Could not update driver.')
    setDrivers((current) => current.map((driver) => driver.id === driverId ? { ...driver, status: data.status } : driver)); refreshDashboard()
  }
  const calculateRoute = async (event) => {
    event.preventDefault()
    if (form.start === form.destination) return setStatus({ text: 'Choose two different locations.', type: 'error' })
    setLoading(true); setStatus({ text: 'Evaluating road network...', type: 'loading' }); setSystem('Calculating route')
    try {
      const response = await fetch('/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...form, stops: selectedStops, route_mode: routeMode, avoid_tolls: avoidTolls, avoid_high_risk: avoidHighRisk }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Route calculation failed.')
      setResult(data); setStatus({ text: 'Route ready to dispatch.', type: 'success' }); setSystem('Planner online')
    } catch (error) { setStatus({ text: error.message, type: 'error' }); setSystem('Planner needs attention') } finally { setLoading(false) }
  }

  const requestDriverLocation = () => {
    if (!navigator.geolocation) {
      setStatus({ text: 'Location permission is required to enable live tracking.', type: 'error' })
      return
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const nextLocation = { lat: position.coords.latitude, lon: position.coords.longitude }
      setDriverLocation(nextLocation)
      setLiveTracking(true)
      setDeviationWarning('')
      try {
        await fetch('/api/driver/location', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude }) })
      } catch (error) {
        setStatus({ text: 'Driver GPS is active, but location sync could not be saved.', type: 'warning' })
      }
    }, () => {
      setStatus({ text: 'Location permission is required to enable live tracking.', type: 'error' })
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 })
  }

  useEffect(() => () => {
    if (trackingWatchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(trackingWatchId.current)
  }, [])

  useEffect(() => {
    if (!liveTracking || !navigator.geolocation || !result) return
    trackingWatchId.current = navigator.geolocation.watchPosition(async (position) => {
      const nextLocation = { lat: position.coords.latitude, lon: position.coords.longitude }
      setDriverLocation(nextLocation)
      try {
        await fetch('/api/driver/location', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude }) })
      } catch (error) {
        // ignore sync failures here; the map still shows the current driver position
      }
      if (result.path_points?.length > 1) {
        const nearestDistance = nearestRouteDistanceKm(nextLocation, result.path_points)
        if (nearestDistance > 0.8) {
          setDeviationWarning('⚠️ Route Deviation Detected')
          setStatus({ text: 'Route Deviation Detected. Refreshing the route from the driver position.', type: 'warning' })
          try {
            const response = await fetch('/api/route/recalculate', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude, destination: result.destination, weather: result.context.weather, hour: result.context.hour, month: result.context.month, vehicle_type: result.context.vehicle_type, route_mode: routeMode, avoid_tolls: avoidTolls, avoid_high_risk: avoidHighRisk }) })
            const data = await response.json()
            if (response.ok) {
              setResult(data)
              setStatus({ text: 'Updated route calculated from the driver’s current position.', type: 'success' })
            }
          } catch (error) {
            setStatus({ text: 'Deviation detected, but the route could not be recalculated.', type: 'error' })
          }
        }
      }
    }, () => {
      setStatus({ text: 'Location permission is required to enable live tracking.', type: 'error' })
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 })

    return () => {
      if (trackingWatchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(trackingWatchId.current)
      trackingWatchId.current = null
    }
  }, [liveTracking, result, routeMode, avoidTolls, avoidHighRisk, token])

  const counts = result?.risk_edge_counts || { Low: 0, Medium: 0, High: 0 }
  const totalEdges = Object.values(counts).reduce((sum, count) => sum + count, 0) || 1
  const riskMessage = counts.High > 0 ? 'The route balances distance with road safety.' : 'A clear run with no high-risk segments detected.'
  const routeInsights = result ? [
    `${Number(result.distance_km).toFixed(1)} km route with ${counts.High || 0} high-risk segments`,
    `${Math.max(0, counts.Low || 0)} low-risk segments help keep the route stable`,
    `Estimated arrival time: ${Math.max(12, Math.round((Number(result.distance_km) * 4.2) + (Number(result.duration_min) || 0)))} minutes`,
    `Overall route cost: ${result.risk_weighted_cost}`,
  ] : []
  const comparisonRoutes = result ? [{ label: 'Current route', distance: result.distance_km, risk: result.overall_risk, cost: result.risk_weighted_cost, duration: result.duration_min }, ...(result.alternatives || []).slice(0, 2).map((alternative, index) => ({ label: index === 0 ? 'Faster route' : 'Safer route', distance: alternative.distance_km, risk: alternative.risk || 'Medium', cost: alternative.cost || (alternative.distance_km * 1.4).toFixed(1), duration: alternative.duration_min }))] : []
  const etaMinutes = result ? Math.max(12, Math.round((Number(result.distance_km) * 4.2) + 8)) : null
  const progressMetrics = result && driverLocation ? createDeliveryProgress(result.path_points, { lat: driverLocation.lat, lon: driverLocation.lon }, Number(result.distance_km)) : null

  if (adminRoute) {
    if (adminChecking) return <div className="admin-route-loading" role="status">Checking admin session...</div>
    if (adminUser) return <AdminApp token={adminToken} admin={adminUser} onLogout={logoutAdmin} />
  }

  if (!user) return <TranslationBoundary language={language} components={[AuthScreen, PreferenceControls]}><AuthScreen mode={authMode} form={authForm} status={authStatus} language={language} theme={theme} onLanguageChange={setLanguage} onThemeChange={setTheme} onModeChange={(mode) => { setAuthMode(mode); setAuthStatus({ text: '', type: '' }) }} onChange={updateAuth} onSubmit={submitAuth} /></TranslationBoundary>

  return <TranslationBoundary language={language} components={[Dashboard, Metric, ServiceRow, PreferenceControls, Field]}><div className="app-shell">
    <header className="topbar"><div className="brand-lockup"><div className="brand-mark">SR</div><div><p className="eyebrow">Dhaka delivery intelligence</p><h1>SmartRoute <span>BD</span></h1></div></div><div className="topbar-actions"><nav className="app-nav"><button className={view === 'planner' ? 'active' : ''} onClick={() => setView('planner')}>Planner</button><button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>Dashboard</button></nav><div className="service-control" ref={serviceControlRef}><button className="system-status status-toggle" aria-controls="planner-service-status" aria-expanded={servicePanelOpen} onClick={() => { const open = !servicePanelOpen; setServicePanelOpen(open); if (open) refreshServiceHealth() }}><i className={system === 'Planner online' ? 'ready' : ''}></i>{system}<span className="status-chevron" aria-hidden="true">⌄</span></button>{servicePanelOpen && <section className="service-popover" id="planner-service-status" aria-label="Planner service status"><div className="service-popover-heading"><div><p className="eyebrow">Service health</p><strong>{serviceHealth?.status === 'ok' ? 'All systems operational' : 'Check required'}</strong></div><button className="icon-close" aria-label="Close service status" onClick={() => setServicePanelOpen(false)}>×</button></div><ServiceRow label="Backend API" ready={system !== 'Backend unavailable'} detail={system === 'Backend unavailable' ? 'Not reachable' : 'Responding'} /><ServiceRow label="Risk model" ready={serviceHealth?.model_available} detail={serviceHealth?.model_loaded ? 'Loaded in memory' : serviceHealth?.model_available ? 'Ready to load' : 'Model file missing'} /><ServiceRow label="Dhaka road graph" ready={serviceHealth?.graph_available} detail={serviceHealth?.graph_available ? 'Available' : 'Missing'} /><ServiceRow label="Delivery database" ready={serviceHealth?.database_connected} detail={serviceHealth?.database_connected ? 'Connected' : 'Unavailable'} /><div className="service-provider"><span>Road routing</span><b>{serviceHealth?.routing_provider || 'Checking...'}</b></div><div className="service-popover-footer"><small>{serviceCheckedAt ? `Checked ${serviceCheckedAt.toLocaleTimeString()}` : 'Waiting for health check'}</small><button onClick={refreshServiceHealth} disabled={serviceRefreshing}>{serviceRefreshing ? 'Checking...' : 'Refresh'}</button></div></section>}</div><button className="logout-button" onClick={logout}>Log out</button></div></header>
    <nav className="profile-shortcut-row" aria-label="Rider account"><span className="passive-system-status"><i className={system === 'Planner online' ? 'ready' : ''} />{system}</span><PreferenceControls theme={theme} language={language} onThemeChange={setTheme} onLanguageChange={setLanguage} /><button type="button" className={view === 'profile' ? 'active' : ''} onClick={() => setView('profile')}>Rider Profile</button></nav>
    {view === 'profile' ? <RiderProfile token={token} user={user} language={language} /> : view === 'dashboard' ? <Dashboard data={dashboard} orders={orders} drivers={drivers} history={routeHistory} orderForm={orderForm} setOrderForm={setOrderForm} driverForm={driverForm} setDriverForm={setDriverForm} orderStatus={orderStatus} driverStatus={driverStatus} onCreateOrder={createOrder} onCreateDriver={createDriver} onAssignDriver={assignDriver} onUpdateOrderStatus={updateOrderStatus} onUpdateDriverStatus={updateDriverStatus} language={language} /> : <>
    <main className="workspace">
      <aside className="panel controls"><div className="section-heading"><div><p className="eyebrow">Route studio</p><h2>Plan a delivery</h2></div><span className="step-number">01</span></div><p className="muted intro">Set the trip context and let risk-aware routing find the better road.</p>
        <form onSubmit={calculateRoute}><div className="route-fields field-group"><label htmlFor="start">Pickup from</label><select id="start" value={form.start} onChange={(e) => update('start', e.target.value)}>{locations.map((location) => <option key={location}>{location}</option>)}</select><div className="route-connector" /><label htmlFor="destination">Deliver to</label><select id="destination" value={form.destination} onChange={(e) => update('destination', e.target.value)}>{locations.map((location) => <option key={location}>{location}</option>)}</select></div>
          <div className="field-grid"><Field label="Weather"><select value={form.weather} onChange={(e) => update('weather', e.target.value)}><option>Clear</option><option>Rain</option><option>Fog</option><option>Storm</option></select></Field><Field label="Vehicle"><select value={form.vehicle_type} onChange={(e) => update('vehicle_type', e.target.value)}><option>Motorcycle</option><option>Car</option><option>Van</option><option>Truck</option></select></Field><Field label="Hour"><input type="number" min="0" max="23" value={form.hour} onChange={(e) => update('hour', e.target.value)} /></Field><Field label="Month"><input type="number" min="1" max="12" value={form.month} onChange={(e) => update('month', e.target.value)} /></Field></div>
          <div className="route-options"><label>Route preference<select value={routeMode} onChange={(e) => setRouteMode(e.target.value)}><option value="fastest">Fastest arrival</option><option value="shortest">Shortest distance</option></select></label><label className="check-option"><input type="checkbox" checked={avoidTolls} onChange={(e) => setAvoidTolls(e.target.checked)} /> Avoid toll roads</label><label className="check-option"><input type="checkbox" checked={avoidHighRisk} onChange={(e) => setAvoidHighRisk(e.target.checked)} /> Prioritize lower-risk roads</label></div>
          <label className="field-label">Stops <span>optional, order optimized</span></label><div className="stop-picker">{locations.filter((location) => ![form.start, form.destination].includes(location)).map((location) => <label key={location}><input type="checkbox" checked={selectedStops.includes(location)} onChange={() => setSelectedStops((current) => current.includes(location) ? current.filter((stop) => stop !== location) : [...current, location])} /> {location}</label>)}</div>
          <button className="primary-button" disabled={loading}><span>{loading ? 'Calculating route' : 'Calculate smart route'}</span><b>→</b></button><div className={`status ${status.type}`} role="status">{status.text}</div>
        </form><div className="method-note"><span className="spark">✦</span><span><strong>Context-aware planning</strong><br />Built for safer delivery decisions</span></div>
      </aside>
      <section className="content-column"><div className="route-header"><div><p className="eyebrow">Live route overview</p><h2>{result ? `${result.start} to ${result.destination}` : 'Ready for your next delivery'}</h2><p className="muted">{result ? `Recommended for ${result.context.weather.toLowerCase()} conditions, a ${result.context.vehicle_type.toLowerCase()}, and a ${result.context.hour}:00 departure.` : 'Choose two locations to see a risk-aware recommendation.'}</p></div>{result && <div className={`risk-badge risk-${result.overall_risk.toLowerCase()}`}><i />{result.overall_risk} overall risk</div>}</div>
        <div className="metric-grid"><Metric label="Distance" value={result ? `${result.distance_km} km` : '--'} note="estimated road distance" /><Metric label="Route cost" value={result ? result.risk_weighted_cost : '--'} note="risk-weighted meters" /><Metric label="Risk edges" value={result ? totalEdges : '--'} note="segments evaluated" /><Metric label="Planning mode" value="Smart" note="context-aware route" /></div>
        <div className="map-panel"><div className="map-toolbar"><span className="map-title"><i />Dhaka road network</span><span className="map-hint">Route updates with your trip context</span></div><div className="map-frame" ref={mapRef}><div className={`map-empty ${result ? 'is-hidden' : ''}`}><div className="map-empty-icon">⌁</div><strong>Your route will appear here</strong><span>Calculate a route to explore the safest path.</span></div></div><div className="map-legend"><span><i className="legend-line" />Recommended route</span><span><i className="legend-dot pickup-dot" />Pickup</span><span><i className="legend-dot delivery-dot" />Delivery</span></div></div>
        <div className="insight-panel"><div><p className="eyebrow">Route intelligence</p><h3>Why this route?</h3><div className="explanation">{result ? <><p><strong>{riskMessage}</strong></p>{routeInsights.map((line) => <p key={line}>{line}</p>)}<p>Each road segment is evaluated against your selected trip context, balancing distance and predicted road risk.</p></> : <p className="muted">Your route explanation and risk mix will show here after calculation.</p>}</div></div><div className="risk-breakdown"><p className="eyebrow">Road segment mix</p>{['Low', 'Medium', 'High'].map((level) => <div className="risk-row" key={level}><span>{level}</span><div className="bar"><i className={`${level.toLowerCase()}-bar`} style={{ width: `${(counts[level] / totalEdges) * 100}%` }} /></div><b>{result ? counts[level] : '--'}</b></div>)}<div className="safety-summary"><p className="eyebrow">Delivery safety</p><strong>{result ? result.overall_risk : 'Pending'}</strong><small>{result ? `${counts.Low || 0} low · ${counts.Medium || 0} medium · ${counts.High || 0} high` : 'Awaiting route'}</small></div></div></div>
        <div className="feature-grid">
          <div className="feature-card">
            <p className="eyebrow">Live tracking</p>
            <h3>📍 Current Driver Location</h3>
            {driverLocation ? <div className="driver-location"><strong>{driverLocation.lat.toFixed(5)}, {driverLocation.lon.toFixed(5)}</strong><small>GPS refreshed from the device</small></div> : <p className="muted">Location permission is required to enable live tracking.</p>}
            <button type="button" className="secondary-button" onClick={requestDriverLocation}>{liveTracking ? 'Refresh GPS' : 'Enable GPS tracking'}</button>
            {deviationWarning && <div className="warning-banner">{deviationWarning}</div>}
          </div>
          <div className="feature-card">
            <p className="eyebrow">Estimated arrival</p>
            <h3>ETA estimate</h3>
            <div className="eta-box"><strong>{etaMinutes ? `${etaMinutes} minutes` : 'Waiting for route'}</strong><small>Estimated using route distance and average vehicle speed. Not live traffic.</small></div>
          </div>
          <div className="feature-card full-width">
            <p className="eyebrow">Delivery progress</p>
            <h3>Delivery Progress</h3>
            {progressMetrics ? <>
              <div className="progress-track"><span style={{ width: `${progressMetrics.percent}%` }} /></div>
              <div className="progress-meta"><span>{progressMetrics.percent}% complete</span><span>{progressMetrics.remainingKm.toFixed(1)} km remaining</span></div>
              <div className="progress-grid"><div><strong>{progressMetrics.completedKm.toFixed(1)} km</strong><small>Completed</small></div><div><strong>{progressMetrics.remainingKm.toFixed(1)} km</strong><small>Remaining</small></div><div><strong>{etaMinutes || '--'} min</strong><small>ETA</small></div></div>
            </> : <p className="muted">Enable GPS tracking to estimate route progress and delivery status.</p>}
          </div>
          <div className="feature-card full-width">
            <p className="eyebrow">Route comparison</p>
            <h3>Fastest vs safer route</h3>
            <div className="comparison-grid">{comparisonRoutes.map((route) => <div className="comparison-card" key={route.label}><strong>{route.label}</strong><div className="comparison-row"><span>Distance</span><b>{route.distance} km</b></div><div className="comparison-row"><span>Risk</span><b>{route.risk}</b></div><div className="comparison-row"><span>ETA</span><b>{route.duration} min</b></div><div className="comparison-row"><span>Cost</span><b>{route.cost}</b></div></div>)}</div>
          </div>
        </div>
      </section>
    </main></>}
  </div></TranslationBoundary>
}

function haversineKm(a, b) {
  const toRad = (value) => (value * Math.PI) / 180
  const lat1 = toRad(a.lat ?? a[0])
  const lon1 = toRad(a.lon ?? a[1])
  const lat2 = toRad(b.lat ?? b[0])
  const lon2 = toRad(b.lon ?? b[1])
  const dLat = lat2 - lat1
  const dLon = lon2 - lon1
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

function nearestRouteDistanceKm(current, pathPoints) {
  if (!Array.isArray(pathPoints) || pathPoints.length < 2) return Infinity
  let bestDistance = Infinity
  for (let i = 0; i < pathPoints.length - 1; i += 1) {
    const start = { lat: pathPoints[i][0], lon: pathPoints[i][1] }
    const end = { lat: pathPoints[i + 1][0], lon: pathPoints[i + 1][1] }
    const startDistance = haversineKm(current, start)
    const endDistance = haversineKm(current, end)
    const segmentDistance = haversineKm(start, end)
    const candidate = Math.min(startDistance, endDistance, segmentDistance > 0 ? (startDistance + endDistance + segmentDistance) / 3 : startDistance)
    if (candidate < bestDistance) bestDistance = candidate
  }
  return bestDistance
}

function createDeliveryProgress(pathPoints, currentLocation, routeDistanceKm) {
  if (!Array.isArray(pathPoints) || pathPoints.length < 2) return null
  let totalDistance = 0
  let completedDistance = 0
  let nearestDistance = Infinity
  for (let i = 0; i < pathPoints.length - 1; i += 1) {
    const start = { lat: pathPoints[i][0], lon: pathPoints[i][1] }
    const end = { lat: pathPoints[i + 1][0], lon: pathPoints[i + 1][1] }
    const segmentDistance = haversineKm(start, end)
    totalDistance += segmentDistance
    const currentDistance = haversineKm(currentLocation, start)
    const nextDistance = haversineKm(currentLocation, end)
    const currentSegmentDistance = Math.min(currentDistance, nextDistance, segmentDistance)
    if (currentSegmentDistance < nearestDistance) {
      nearestDistance = currentSegmentDistance
      completedDistance = totalDistance - segmentDistance + Math.max(0, segmentDistance - currentSegmentDistance)
    }
  }
  const safeDistance = Math.max(0, Number(routeDistanceKm || totalDistance))
  const completedKm = Math.min(safeDistance, Math.max(0, completedDistance || (safeDistance * 0.5)))
  const remainingKm = Math.max(0, safeDistance - completedKm)
  const percent = Math.min(100, Math.max(0, (completedKm / Math.max(0.1, safeDistance)) * 100))
  return { completedKm, remainingKm, percent: Number(percent.toFixed(0)) }
}

function Field({ label, children }) { return <div className="field-group"><label>{label}</label>{children}</div> }
function Metric({ label, value, note }) { return <div className={`metric-card ${value === '--' ? 'placeholder' : ''}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div> }
function ServiceRow({ label, ready, detail }) { return <div className="service-row"><span><i className={ready ? 'service-ok' : 'service-warning'} />{label}</span><small>{detail || 'Checking...'}</small></div> }
function PreferenceControls({ theme, language, onThemeChange, onLanguageChange }) {
  const themeLabel = theme === 'dark' ? 'Light mode' : 'Dark mode'
  return <div className="preference-controls" aria-label="Display preferences">
    <div className="language-switch" role="group" aria-label="Language">
      <button type="button" className={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} onClick={() => onLanguageChange('en')}>EN</button>
      <button type="button" className={language === 'bn' ? 'active' : ''} aria-pressed={language === 'bn'} onClick={() => onLanguageChange('bn')}>বাংলা</button>
    </div>
    <button type="button" className="theme-toggle" aria-label={themeLabel} title={themeLabel} onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}><span aria-hidden="true">{theme === 'dark' ? '☼' : '☾'}</span><span className="theme-label">{themeLabel}</span></button>
  </div>
}
function Dashboard({ data, orders, drivers, history, orderForm, setOrderForm, driverForm, setDriverForm, orderStatus, driverStatus, onCreateOrder, onCreateDriver, onAssignDriver, onUpdateOrderStatus, onUpdateDriverStatus }) {
  const deliveries = data?.deliveries || { total: 0, completed: 0, pending: 0, delayed: 0, cancelled: 0 }
  const performance = data?.performance || { average_distance_km: 0, average_duration_min: 0, on_time_rate: 0 }
  return <main className="dashboard-page"><div className="route-header"><div><p className="eyebrow">Operations center</p><h2>Delivery overview</h2><p className="muted">A live view of orders, route performance, and driver capacity.</p></div><div className="date-chip">Today · Dhaka</div></div><div className="dashboard-grid"><Metric label="Total deliveries" value={deliveries.total} note="all active records" /><Metric label="Completed" value={deliveries.completed} note="successfully delivered" /><Metric label="Pending" value={deliveries.pending} note="awaiting dispatch" /><Metric label="Delayed" value={deliveries.delayed} note="needs attention" /></div><div className="dashboard-panels"><section className="data-panel"><p className="eyebrow">Performance</p><h3>Route efficiency</h3><div className="performance-list"><span>Average distance <b>{performance.average_distance_km} km</b></span><span>Average ETA <b>{performance.average_duration_min} min</b></span><span>On-time delivery <b>{performance.on_time_rate}%</b></span></div></section><section className="data-panel"><p className="eyebrow">Dispatch health</p><h3>Driver availability</h3><div className="driver-status-grid"><span><i className="status-dot available" /> Available <b>{data?.drivers?.available || 0}</b></span><span><i className="status-dot busy" /> Busy <b>{data?.drivers?.busy || 0}</b></span><span><i className="status-dot offline" /> Offline <b>{data?.drivers?.offline || 0}</b></span></div></section></div><div className="operations-grid"><section className="data-panel"><p className="eyebrow">Order intake</p><h3>Add delivery</h3><form className="order-form" onSubmit={onCreateOrder}><input required placeholder="Customer name" value={orderForm.customer_name} onChange={(e) => setOrderForm({ ...orderForm, customer_name: e.target.value })} /><input required placeholder="Delivery address" value={orderForm.address} onChange={(e) => setOrderForm({ ...orderForm, address: e.target.value })} /><div><select value={orderForm.priority} onChange={(e) => setOrderForm({ ...orderForm, priority: e.target.value })}><option>Normal</option><option>High Priority</option><option>Urgent</option><option>Express</option></select><input placeholder="Time window e.g. 10:00–12:00" value={orderForm.time_window} onChange={(e) => setOrderForm({ ...orderForm, time_window: e.target.value })} /></div><button className="primary-button" type="submit"><span>Add to queue</span><b>→</b></button><div className="status success">{orderStatus}</div></form></section><section className="data-panel"><p className="eyebrow">Driver roster</p><h3>Add driver</h3><form className="order-form" onSubmit={onCreateDriver}><input required placeholder="Driver name" value={driverForm.name} onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })} /><input placeholder="Phone" value={driverForm.phone} onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })} /><div><select value={driverForm.vehicle_type} onChange={(e) => setDriverForm({ ...driverForm, vehicle_type: e.target.value })}><option>Motorcycle</option><option>Car</option><option>Van</option><option>Truck</option></select><button className="primary-button" type="submit"><span>Add driver</span><b>+</b></button></div><div className="status success">{driverStatus}</div></form><div className="mini-list">{drivers.map((driver) => <span key={driver.id}><b>{driver.name}</b>{driver.vehicle_type}<select aria-label={`${driver.name} availability`} value={driver.status} onChange={(event) => onUpdateDriverStatus(driver.id, event.target.value)}><option>Available</option><option>Busy</option><option>Offline</option></select></span>)}</div></section></div><section className="data-panel history-panel"><p className="eyebrow">Dispatch queue</p><h3>Orders and delivery status</h3>{orders.length ? <div className="order-table">{orders.map((order) => <div className="order-row" key={order.id}><div><strong>{order.order_code} · {order.customer_name}</strong><small>{order.address}{order.time_window ? ` · ${order.time_window}` : ''}</small></div><span className={`order-status status-${order.status.toLowerCase().replaceAll(' ', '-')}`}>{order.status}</span><select aria-label={`Assign driver for ${order.order_code}`} value={order.driver_id || ''} onChange={(event) => onAssignDriver(order.id, event.target.value)} disabled={['Completed', 'Cancelled'].includes(order.status)}><option value="">{order.driver_name || 'Assign available driver'}</option>{drivers.filter((driver) => driver.status === 'Available').map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select><select aria-label={`Update status for ${order.order_code}`} value={order.status} onChange={(event) => onUpdateOrderStatus(order.id, event.target.value)} disabled={['Completed', 'Cancelled'].includes(order.status)}>{['Pending', 'Assigned', 'In Transit', 'Completed', 'Delayed', 'Cancelled'].map((status) => <option key={status}>{status}</option>)}</select></div>)}</div> : <p className="muted empty-copy">No deliveries yet. Create one above to start dispatching.</p>}</section><section className="data-panel history-panel"><p className="eyebrow">Route history</p><h3>Recent planning runs</h3><div className="mini-list">{history.length ? history.slice(0, 5).map((route) => <span key={route.id}><b>{route.start_name} → {route.destination_name}</b>{route.distance_km} km · {route.duration_min} min<em>{route.overall_risk}</em></span>) : <p className="muted">Your completed route plans will appear here.</p>}</div></section></main>
}
function AuthScreen({ mode, form, status, language, theme, onLanguageChange, onThemeChange, onModeChange, onChange, onSubmit }) {
  const login = mode === 'login'
  return <TranslationBoundary language={language} components={[PreferenceControls]}><div className="auth-shell"><div className="auth-visual"><div className="brand-mark">SR</div><p className="eyebrow">Dhaka delivery intelligence</p><h1>Move with<br /><span>confidence.</span></h1><p>Plan better delivery days with a clear view of distance, weather, and road risk.</p><div className="auth-route-line"><i /><b /><i /></div></div><main className="auth-panel"><div className="auth-preferences"><PreferenceControls theme={theme} language={language} onThemeChange={onThemeChange} onLanguageChange={onLanguageChange} /></div><p className="eyebrow">SmartRoute BD</p><h2>{login ? 'Welcome back' : 'Create your account'}</h2><p className="muted">{login ? 'Sign in to open your delivery workspace.' : 'Save your delivery workspace and start planning.'}</p><form onSubmit={onSubmit} className="auth-form">{!login && <label>Full name<input required value={form.name} onChange={(e) => onChange('name', e.target.value)} placeholder="Your name" /></label>}<label>Email address<input required type="email" value={form.email} onChange={(e) => onChange('email', e.target.value)} placeholder="you@example.com" /></label><label>Password<input required type="password" minLength="8" value={form.password} onChange={(e) => onChange('password', e.target.value)} placeholder="At least 8 characters" /></label><button className="primary-button" type="submit"><span>{login ? 'Sign in' : 'Create account'}</span><b>→</b></button><div className={`status ${status.type}`}>{status.text}</div></form><p className="auth-switch">{login ? 'New to SmartRoute?' : 'Already have an account?'} <button type="button" onClick={() => onModeChange(login ? 'signup' : 'login')}>{login ? 'Create an account' : 'Sign in'}</button></p></main></div></TranslationBoundary>
}
export default App
