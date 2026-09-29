import { useEffect, useState } from 'react'
import { TranslationBoundary } from './i18n'
import './admin.css'

const emptyDashboard = { totals: { riders: 0, drivers: 0, orders: 0, routes: 0, suspended: 0 }, orders_by_status: {}, verification: {}, routes_last_7_days: [], recent_admin_activity: [], pending_documents: 0 }

async function adminRequest(path, token, options = {}) {
  const response = await fetch(`/api/admin${path}`, {
    ...options,
    headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  })
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null
  if (!response.ok) throw new Error(data?.detail || 'Admin request failed.')
  return data
}

export default function AdminApp({ token, admin, onLogout }) {
  const [language, setLanguage] = useState(() => localStorage.getItem('smartroute_language') || 'en')
  const [theme, setTheme] = useState(() => localStorage.getItem('smartroute_theme') || 'light')
  const [section, setSection] = useState('overview')
  const [dashboard, setDashboard] = useState(emptyDashboard)
  const [riders, setRiders] = useState([])
  const [drivers, setDrivers] = useState([])
  const [activity, setActivity] = useState([])
  const [query, setQuery] = useState('')
  const [verificationFilter, setVerificationFilter] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [driverAccountFilter, setDriverAccountFilter] = useState('')
  const [riderSort, setRiderSort] = useState('created_at')
  const [sortOrder, setSortOrder] = useState('desc')
  const [selectedRider, setSelectedRider] = useState(null)
  const [selectedDriver, setSelectedDriver] = useState(null)
  const [selectedDocument, setSelectedDocument] = useState('nid_card')
  const [documentUrl, setDocumentUrl] = useState('')
  const [reviewReason, setReviewReason] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    localStorage.setItem('smartroute_language', language)
    localStorage.setItem('smartroute_theme', theme)
    document.documentElement.lang = language
    document.documentElement.dataset.theme = theme
  }, [language, theme])

  const loadDashboard = async () => {
    if (!token) return
    try {
      const [overview, riderData, driverData, activityData] = await Promise.all([
        adminRequest('/dashboard', token),
        adminRequest(`/riders?search=${encodeURIComponent(query)}&verification=${encodeURIComponent(verificationFilter)}&account_status=${encodeURIComponent(accountFilter)}&sort=${encodeURIComponent(riderSort)}&order=${sortOrder}`, token),
        adminRequest(`/drivers?search=${encodeURIComponent(query)}&status=${encodeURIComponent(driverAccountFilter)}`, token),
        adminRequest('/activity?limit=100', token),
      ])
      setDashboard(overview)
      setRiders(riderData.riders)
      setDrivers(driverData.drivers)
      setActivity(activityData.events)
    } catch (error) { setMessage(error.message) }
  }

  useEffect(() => { if (admin) loadDashboard() }, [admin, token, query, verificationFilter, accountFilter, driverAccountFilter, riderSort, sortOrder])

  useEffect(() => {
    if (!token || !selectedRider || !selectedRider.rider.documents?.[selectedDocument]) { setDocumentUrl(''); return undefined }
    let active = true
    let objectUrl = ''
    fetch(`/api/admin/riders/${selectedRider.rider.id}/documents/${selectedDocument}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Document preview unavailable.')
        objectUrl = URL.createObjectURL(await response.blob())
        if (active) setDocumentUrl(objectUrl)
      }).catch(() => { if (active) setDocumentUrl('') })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [token, selectedRider?.rider?.id, selectedDocument, selectedRider?.rider?.documents?.[selectedDocument]?.file_name])

  const signOut = async () => {
    try { await adminRequest('/auth/logout', token, { method: 'POST' }) } catch {}
    onLogout()
  }

  const openRider = async (riderId) => {
    try {
      const data = await adminRequest(`/riders/${riderId}`, token)
      setSelectedRider(data)
      setSelectedDocument(data.rider.documents?.nid_card ? 'nid_card' : 'driving_license')
      setReviewReason('')
    } catch (error) { setMessage(error.message) }
  }

  const openDriver = async (driverId) => {
    try {
      const data = await adminRequest(`/drivers/${driverId}`, token)
      setSelectedDriver(data)
    } catch (error) { setMessage(error.message) }
  }

  const updateReview = async (status) => {
    if (!selectedRider) return
    setBusy(true)
    try {
      await adminRequest(`/riders/${selectedRider.rider.id}/documents/${selectedDocument}`, token, {
        method: 'PATCH', body: JSON.stringify({ status, reason: reviewReason }),
      })
      setMessage(`Document marked ${status.replaceAll('_', ' ')}.`)
      await openRider(selectedRider.rider.id)
      await loadDashboard()
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }

  const setAccountStatus = async (subjectType, subjectId, status) => {
    const reason = status === 'active' ? '' : window.prompt(`Reason for ${status}?`) || ''
    if (status !== 'active' && !reason.trim()) return
    try {
      await adminRequest(`/accounts/${subjectType}/${subjectId}`, token, { method: 'PATCH', body: JSON.stringify({ status, reason }) })
      setMessage(`${subjectType === 'user' ? 'Rider' : 'Driver'} account ${status}.`)
      await loadDashboard()
      if (subjectType === 'user' && selectedRider?.rider.id === subjectId) await openRider(subjectId)
    } catch (error) { setMessage(error.message) }
  }

  return <TranslationBoundary language={language} components={[Overview, ReviewDetail, DriverDetail, AdminStat, AdminStatus, StatusCount, EmptyAdmin, LanguageSwitch, AdminThemeToggle]}><div className="admin-shell">
    <aside className="admin-sidebar"><div className="admin-brand"><div className="admin-mark">SR</div><div><strong>SmartRoute</strong><small>ADMIN CONSOLE</small></div></div><p className="admin-nav-label">WORKSPACE</p><nav>{[['overview','Overview'],['reviews','Verification queue'],['riders','Riders'],['drivers','Drivers'],['activity','Activity log']].map(([key,label])=><button key={key} className={section===key?'active':''} onClick={()=>{setSection(key);setMessage('')}}><span className="admin-nav-dot" />{label}{key==='reviews'&&dashboard.pending_documents>0&&<b className="admin-nav-count">{dashboard.pending_documents}</b>}</button>)}</nav><div className="admin-sidebar-foot"><span className="admin-online-dot" />System connected</div></aside>
    <main className="admin-main"><header className="admin-topbar"><div><p className="admin-kicker">SYSTEM CONTROL / {section.toUpperCase()}</p><h1>{sectionTitles[section]}</h1></div><div className="admin-top-actions"><LanguageSwitch language={language} onChange={setLanguage}/><AdminThemeToggle theme={theme} onChange={setTheme}/><span className="admin-user"><i>{(admin.username||'A').slice(0,1).toUpperCase()}</i><span><strong>{admin.username}</strong><small>Administrator</small></span></span><button className="admin-logout" onClick={signOut}>Sign out</button></div></header>
      {message&&<div className="admin-message" role="status">{message}<button onClick={()=>setMessage('')} aria-label="Dismiss">×</button></div>}
      {(section==='riders'||section==='reviews')&&<div className="admin-global-filters"><label>Sort by<select value={riderSort} onChange={(event)=>setRiderSort(event.target.value)}><option value="created_at">Newest</option><option value="name">Name</option><option value="verification_status">Verification</option><option value="account_status">Account status</option></select></label><button className="admin-sort-toggle" onClick={()=>setSortOrder((current)=>current==='asc'?'desc':'asc')}>{sortOrder==='asc'?'↑ Ascending':'↓ Descending'}</button></div>}
      {section==='overview'&&<Overview dashboard={dashboard} activity={activity} onNavigate={setSection}/>}
      {section==='reviews'&&<div className="admin-content"><div className="admin-section-head"><div><h2>Verification requests</h2><p>Review submitted NID and driving-license documents.</p></div><select value={verificationFilter} onChange={(event)=>setVerificationFilter(event.target.value)}><option value="">All statuses</option><option value="pending_review">Pending review</option><option value="action_required">Action required</option><option value="verified">Verified</option><option value="incomplete">Incomplete</option></select></div><div className="review-layout"><section className="admin-table-panel"><div className="admin-toolbar"><input placeholder="Search riders" value={query} onChange={(event)=>setQuery(event.target.value)}/><span>{riders.length} requests</span></div><div className="admin-list">{riders.map((rider)=><button key={rider.id} className={`admin-rider-row ${selectedRider?.rider.id===rider.id?'selected':''}`} onClick={()=>openRider(rider.id)}><span className="admin-avatar">{rider.name.slice(0,1).toUpperCase()}</span><span className="admin-row-main"><strong>{rider.name}</strong><small>{rider.email}</small></span><AdminStatus value={rider.verification_status}/></button>)}</div></section><section className="admin-review-panel">{selectedRider?<ReviewDetail data={selectedRider} selectedDocument={selectedDocument} setSelectedDocument={setSelectedDocument} documentUrl={documentUrl} reason={reviewReason} setReason={setReviewReason} onReview={updateReview} onAccountStatus={setAccountStatus} busy={busy}/>:<EmptyAdmin title="Select a rider" detail="Choose a rider to inspect submitted documents."/>}</section></div></div>}
      {section==='riders'&&<div className="admin-content"><div className="admin-section-head"><div><h2>Rider accounts</h2><p>Search riders, inspect their profiles, and manage access.</p></div><select value={accountFilter} onChange={(event)=>setAccountFilter(event.target.value)}><option value="">All account states</option><option value="active">Active</option><option value="deactivated">Deactivated</option><option value="suspended">Suspended</option></select></div><div className="admin-table-panel"><div className="admin-toolbar"><input placeholder="Search name, email, phone, registration" value={query} onChange={(event)=>setQuery(event.target.value)}/><span>{riders.length} riders</span></div><div className="admin-table-scroll"><table><thead><tr><th>Rider</th><th>Vehicle</th><th>Verification</th><th>Account</th><th>Joined</th><th /></tr></thead><tbody>{riders.map((rider)=><tr key={rider.id}><td><strong>{rider.name}</strong><small>{rider.email} · {rider.phone||'No phone'}</small></td><td>{rider.vehicle_make_model||rider.vehicle_type||'—'}<small>{rider.vehicle_registration||'Registration missing'}</small></td><td><AdminStatus value={rider.verification_status}/></td><td><AdminStatus value={rider.account_status}/></td><td>{new Date(rider.created_at).toLocaleDateString()}</td><td><button className="admin-text-action" onClick={()=>openRider(rider.id)}>View profile</button></td></tr>)}</tbody></table></div></div></div>}
      {section==='drivers'&&<div className="admin-content"><div className="admin-section-head"><div><h2>Driver accounts</h2><p>Review vehicle assignments and control account availability.</p></div><div className="admin-inline-filters"><input placeholder="Search drivers" value={query} onChange={(event)=>setQuery(event.target.value)}/><select value={driverAccountFilter} onChange={(event)=>setDriverAccountFilter(event.target.value)}><option value="">All account states</option><option value="active">Active</option><option value="deactivated">Deactivated</option><option value="suspended">Suspended</option></select></div></div><div className="admin-table-panel admin-table-scroll"><table><thead><tr><th>Driver</th><th>Vehicle</th><th>Phone</th><th>Workspace owner</th><th>Dispatch status</th><th>Account</th><th>Action</th></tr></thead><tbody>{drivers.map((driver)=><tr key={driver.id}><td><button className="admin-text-action" onClick={()=>openDriver(driver.id)}>{driver.name}</button><small>Driver #{driver.id}</small></td><td>{driver.vehicle_type}</td><td>{driver.phone||'—'}</td><td>{driver.owner_name||driver.owner_email||'—'}</td><td><AdminStatus value={driver.status}/></td><td><AdminStatus value={driver.account_status}/></td><td><select aria-label={`Manage ${driver.name}`} value={driver.account_status} onChange={(event)=>setAccountStatus('driver',driver.id,event.target.value)}><option value="active">Active</option><option value="deactivated">Deactivate</option><option value="suspended">Suspend</option></select></td></tr>)}</tbody></table></div></div>}
      {section==='drivers'&&selectedDriver&&<DriverDetail data={selectedDriver} onClose={()=>setSelectedDriver(null)}/>}
      {section==='activity'&&<div className="admin-content"><div className="admin-section-head"><div><h2>System activity</h2><p>Administrative actions, route planning, and order activity.</p></div><span className="admin-count-pill">{activity.length} events</span></div><div className="admin-table-panel admin-activity-list">{activity.map((event)=><article className="admin-activity-row" key={event.id}><i className={`activity-marker ${event.kind}`}/><div><strong>{event.action}</strong><p>{event.actor}{event.subject_type?` · ${event.subject_type}${event.subject_id?` #${event.subject_id}`:''}`:''}</p></div><time>{new Date(event.created_at).toLocaleString()}</time></article>)}</div></div>}
    </main>
  </div></TranslationBoundary>
}

const sectionTitles = { overview: 'System overview', reviews: 'Verification review', riders: 'Rider management', drivers: 'Driver management', activity: 'Activity log' }

function DriverDetail({data,onClose}) {
  const driver=data.driver
  return <section className="admin-panel driver-detail-panel"><div className="admin-panel-head"><div><p className="admin-kicker">DRIVER PROFILE · #{driver.id}</p><h3>{driver.name}</h3></div><button className="admin-logout" onClick={onClose}>Close</button></div><div className="review-rider-facts"><span><small>Phone</small>{driver.phone||'—'}</span><span><small>Vehicle</small>{driver.vehicle_type}</span><span><small>Dispatch status</small>{driver.status}</span><span><small>Account status</small>{data.account_control?.status||'active'}</span><span><small>Registration/owner</small>{data.owner_name||data.owner_email||'—'}</span></div><h4 className="admin-driver-orders-title">Recent deliveries</h4>{data.orders.length?data.orders.map((order)=><div className="admin-driver-order" key={order.id}><strong>{order.order_code} · {order.customer_name}</strong><span>{order.status}</span><small>{order.address}</small></div>):<p className="admin-empty-line">No deliveries assigned to this driver yet.</p>}</section>
}

function Overview({ dashboard, activity, onNavigate }) {
  const totals=dashboard.totals||emptyDashboard.totals
  const orders=dashboard.orders_by_status||{}
  const verification=dashboard.verification||{}
  const days=dashboard.routes_last_7_days||[]
  const maxRoutes=Math.max(1,...days.map((day)=>day.total))
  return <div className="admin-content"><div className="admin-section-head"><div><h2>Good to see you</h2><p>Live operational snapshot across SmartRoute BD.</p></div><button className="admin-outline" onClick={()=>onNavigate('reviews')}>{dashboard.pending_documents||0} pending reviews <span>→</span></button></div>
    <div className="admin-stat-grid"><AdminStat label="Registered riders" value={totals.riders||0} meta="Rider accounts" tone="green"/><AdminStat label="Drivers" value={totals.drivers||0} meta="Across all workspaces" tone="blue"/><AdminStat label="Deliveries" value={totals.orders||0} meta={`${orders.Completed||0} completed`} tone="amber"/><AdminStat label="Planned routes" value={totals.routes||0} meta="Recorded route activity" tone="slate"/></div>
    <div className="admin-overview-grid"><section className="admin-panel"><div className="admin-panel-head"><div><p className="admin-kicker">OPERATIONS</p><h3>Route activity</h3></div><span>Last 7 days</span></div><div className="admin-chart">{days.length?days.map((day)=><div className="admin-chart-col" key={day.day}><span>{day.total}</span><i style={{height:`${Math.max(8,day.total/maxRoutes*100)}%`}}/><small>{new Date(`${day.day}T12:00:00`).toLocaleDateString(undefined,{weekday:'short'})}</small></div>):<EmptyAdmin title="No recent routes" detail="Route planning activity will appear here."/>}</div></section><section className="admin-panel"><div className="admin-panel-head"><div><p className="admin-kicker">IDENTITY CHECKS</p><h3>Verification status</h3></div><button className="admin-text-action" onClick={()=>onNavigate('reviews')}>Review queue →</button></div><div className="admin-verification-stats"><StatusCount label="Pending review" value={verification.pending_review||0} tone="pending"/><StatusCount label="Verified" value={verification.verified||0} tone="verified"/><StatusCount label="Action required" value={verification.action_required||0} tone="attention"/><StatusCount label="Incomplete" value={verification.incomplete||0} tone="neutral"/></div></section></div>
    <section className="admin-panel admin-recent-panel"><div className="admin-panel-head"><div><p className="admin-kicker">AUDIT TRAIL</p><h3>Recent administrator activity</h3></div><button className="admin-text-action" onClick={()=>onNavigate('activity')}>View activity →</button></div>{activity.filter((item)=>item.kind==='admin').slice(0,5).map((event)=><div className="admin-activity-row compact" key={event.id}><i className="activity-marker admin"/><div><strong>{event.action}</strong><p>{event.admin_name||event.actor}</p></div><time>{new Date(event.created_at).toLocaleString()}</time></div>)}{!activity.some((item)=>item.kind==='admin')&&<p className="admin-empty-line">No administrative actions recorded yet.</p>}</section>
  </div>
}

function ReviewDetail({data,selectedDocument,setSelectedDocument,documentUrl,reason,setReason,onReview,onAccountStatus,busy}) {
  const rider=data.rider
  const document=rider.documents?.[selectedDocument]
  const review=rider.document_reviews?.[selectedDocument]
  const isPdf=document?.original_name?.toLowerCase().endsWith('.pdf')
  return <div className="review-detail"><div className="review-detail-head"><div><p className="admin-kicker">RIDER #{rider.id}</p><h3>{rider.name}</h3><p>{rider.email}</p></div><AdminStatus value={rider.verification_status}/></div><div className="review-rider-facts"><span><small>Phone</small>{rider.phone||'—'}</span><span><small>Vehicle</small>{rider.vehicle_make_model||rider.vehicle_type||'—'}</span><span><small>Registration</small>{rider.vehicle_registration||'—'}</span><span><small>License expiry</small>{rider.license_expiry||'—'}</span></div><div className="document-tabs">{[['nid_card','NID Card'],['driving_license','Driving License']].map(([key,label])=><button key={key} className={selectedDocument===key?'active':''} onClick={()=>setSelectedDocument(key)}>{label}{rider.document_reviews?.[key]&&<AdminStatus value={rider.document_reviews[key].status}/>}</button>)}</div><div className="document-preview">{documentUrl?isPdf?<iframe src={documentUrl} title={`${selectedDocument} preview`}/>:<img src={documentUrl} alt={`${selectedDocument} document preview`}/>:<EmptyAdmin title="Document not submitted" detail="This rider has not uploaded this document."/>}</div>{document&&<div className="review-file-name">{document.original_name} · {(document.size/1024/1024).toFixed(1)} MB</div>}<label className="admin-reason-label">Decision note<textarea rows="2" value={reason} onChange={(event)=>setReason(event.target.value)} placeholder="Required when rejecting or requesting a resubmission"/></label><div className="review-actions"><button disabled={!document||busy} className="review-approve" onClick={()=>onReview('approved')}>Approve</button><button disabled={!document||busy} className="review-resubmit" onClick={()=>onReview('resubmission_required')}>Request resubmission</button><button disabled={!document||busy} className="review-reject" onClick={()=>onReview('rejected')}>Reject</button></div><div className="review-account-control"><span>Rider account: <AdminStatus value={rider.account_status}/></span><select value={rider.account_status} onChange={(event)=>onAccountStatus('user',rider.id,event.target.value)}><option value="active">Active</option><option value="deactivated">Deactivate</option><option value="suspended">Suspend</option></select></div></div>
}

function AdminStat({label,value,meta,tone}) { return <article className={`admin-stat ${tone}`}><span className="admin-stat-mark"/><p>{label}</p><strong>{value.toLocaleString()}</strong><small>{meta}</small></article> }
function AdminStatus({value}) { const normalized=String(value||'unknown').toLowerCase().replaceAll(' ','_'); const labels={pending_review:'Pending review',action_required:'Action required',resubmission_required:'Resubmission required',active:'Active',deactivated:'Deactivated',suspended:'Suspended'}; const display=labels[normalized]||String(value||'unknown').replaceAll('_',' '); return <span className={`admin-status ${normalized}`}>{display}</span> }
function StatusCount({label,value,tone}) { return <div className="admin-status-count"><i className={tone}/><span>{label}</span><strong>{value}</strong></div> }
function EmptyAdmin({title,detail}) { return <div className="admin-empty"><strong>{title}</strong><span>{detail}</span></div> }
function LanguageSwitch({language,onChange}) { return <div className="admin-language-switch"><button className={language==='en'?'active':''} onClick={()=>onChange('en')}>EN</button><button className={language==='bn'?'active':''} onClick={()=>onChange('bn')}>বাংলা</button></div> }
function AdminThemeToggle({theme,onChange}) { return <button className="admin-theme-toggle" aria-label={theme==='dark'?'Light mode':'Dark mode'} title={theme==='dark'?'Light mode':'Dark mode'} onClick={()=>onChange(theme==='dark'?'light':'dark')}>{theme==='dark'?'☼':'☾'}</button> }