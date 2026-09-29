import { useEffect, useState } from 'react'
import { TranslationBoundary } from './i18n'

const documentLabels = { nid_card: 'NID card', driving_license: 'Driving license', profile_photo: 'Profile photo' }
const requiredFields = ['full_name', 'date_of_birth', 'nid_number', 'phone', 'address', 'vehicle_make_model', 'vehicle_registration', 'license_number', 'license_expiry']

export default function RiderProfile({ token, user, language }) {
  const [profile, setProfile] = useState(null)
  const [verification, setVerification] = useState(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const [message, setMessage] = useState({ text: '', type: '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState('')
  const [loading, setLoading] = useState(true)
  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    let active = true
    fetch('/api/rider-profile', { headers }).then(async (response) => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Could not load rider profile.')
      if (active) { setProfile(data.profile); setVerification(data.verification) }
    }).catch((error) => { if (active) setMessage({ text: error.message, type: 'error' }) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])

  useEffect(() => {
    if (!profile?.documents?.profile_photo) { setPhotoUrl(''); return undefined }
    let active = true
    let objectUrl = ''
    fetch('/api/rider-profile/documents/profile_photo', { headers }).then((response) => {
      if (!response.ok) throw new Error('Photo preview unavailable.')
      return response.blob()
    }).then((blob) => {
      objectUrl = URL.createObjectURL(blob)
      if (active) setPhotoUrl(objectUrl)
    }).catch(() => setPhotoUrl(''))
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [profile?.documents?.profile_photo?.file_name, token])

  const update = (key, value) => setProfile((current) => ({ ...current, [key]: value }))
  const saveProfile = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage({ text: '', type: '' })
    try {
      const response = await fetch('/api/rider-profile', { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(profile) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Could not save rider profile.')
      setProfile(data.profile)
      setVerification(data.verification)
      setMessage({ text: 'Profile details saved securely.', type: 'success' })
    } catch (error) { setMessage({ text: error.message, type: 'error' }) }
    finally { setSaving(false) }
  }
  const uploadDocument = async (documentType, file) => {
    if (!file) return
    setUploading(documentType)
    setMessage({ text: '', type: '' })
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(`/api/rider-profile/documents/${documentType}`, { method: 'POST', headers, body: formData })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Could not upload document.')
      setProfile(data.profile)
      setVerification(data.verification)
      setMessage({ text: `${documentLabels[documentType]} uploaded. Verification is pending manual review.`, type: 'success' })
    } catch (error) { setMessage({ text: error.message, type: 'error' }) }
    finally { setUploading('') }
  }
  const downloadDocument = async (documentType) => {
    try {
      const response = await fetch(`/api/rider-profile/documents/${documentType}`, { headers })
      if (!response.ok) throw new Error('Could not download document.')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = profile.documents[documentType].original_name || documentType
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) { setMessage({ text: error.message, type: 'error' }) }
  }

  const completedFields = profile ? requiredFields.filter((key) => String(profile[key] || '').trim()).length : 0
  const completedDocuments = profile ? ['nid_card', 'driving_license', 'profile_photo'].filter((key) => profile.documents?.[key]).length : 0
  const completion = Math.round(((completedFields + completedDocuments) / (requiredFields.length + 3)) * 100)
  const statusClass = verification?.status === 'Pending review' ? 'pending' : verification?.status === 'Action required' ? 'required' : 'incomplete'

  if (loading) return <TranslationBoundary language={language}><main className="profile-page"><p className="muted">Loading rider profile...</p></main></TranslationBoundary>
  if (!profile) return <TranslationBoundary language={language}><main className="profile-page"><div className="profile-alert error">{message.text || 'Could not load rider profile.'}</div></main></TranslationBoundary>
  return <TranslationBoundary language={language} components={[ProfileField, DocumentUpload, VerificationItem]}><main className="profile-page">
    <div className="route-header profile-header"><div><p className="eyebrow">Rider account</p><h2>Rider Profile</h2><p className="muted">Keep your identity, license, and vehicle details current for safer dispatch.</p></div><span className={`verification-badge ${statusClass}`}><i />{verification?.status || 'Incomplete'}</span></div>
    <div className="profile-layout">
      <form className="profile-form" onSubmit={saveProfile}>
        <section className="data-panel profile-section">
          <div className="profile-section-heading"><div><p className="eyebrow">Identity</p><h3>Personal information</h3></div><span className="profile-step">01</span></div>
          <div className="profile-photo-row"><div className="profile-avatar">{photoUrl ? <img src={photoUrl} alt="Rider profile" /> : <span>{(profile.full_name || user?.name || 'R').slice(0, 1).toUpperCase()}</span>}</div><div className="profile-photo-copy"><strong>Profile photo</strong><small>Clear, recent photo. JPG, PNG, or WEBP, up to 8 MB.</small><label className="upload-button">{uploading === 'profile_photo' ? 'Uploading...' : profile.documents?.profile_photo ? 'Replace photo' : 'Upload photo'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(uploading)} onChange={(event) => uploadDocument('profile_photo', event.target.files?.[0])} /></label></div></div>
          <div className="profile-fields"><ProfileField label="Full legal name" required><input autoComplete="name" required maxLength="120" value={profile.full_name || ''} onChange={(event) => update('full_name', event.target.value)} /></ProfileField><ProfileField label="Date of birth" required><input type="date" required value={profile.date_of_birth || ''} onChange={(event) => update('date_of_birth', event.target.value)} /></ProfileField><ProfileField label="NID number" required><input autoComplete="off" required maxLength="30" value={profile.nid_number || ''} onChange={(event) => update('nid_number', event.target.value)} /></ProfileField><ProfileField label="Blood group"><select value={profile.blood_group || ''} onChange={(event) => update('blood_group', event.target.value)}><option value="">Select</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => <option key={group}>{group}</option>)}</select></ProfileField></div>
        </section>
        <section className="data-panel profile-section">
          <div className="profile-section-heading"><div><p className="eyebrow">Contact & safety</p><h3>Contact information</h3></div><span className="profile-step">02</span></div>
          <div className="profile-fields"><ProfileField label="Email address"><input type="email" autoComplete="email" maxLength="254" value={profile.email || ''} onChange={(event) => update('email', event.target.value)} /></ProfileField><ProfileField label="Phone number" required><input type="tel" autoComplete="tel" maxLength="40" value={profile.phone || ''} onChange={(event) => update('phone', event.target.value)} /></ProfileField><ProfileField label="Home address" required wide><textarea autoComplete="street-address" rows="2" maxLength="300" value={profile.address || ''} onChange={(event) => update('address', event.target.value)} /></ProfileField><ProfileField label="Emergency contact name"><input autoComplete="off" maxLength="120" value={profile.emergency_contact_name || ''} onChange={(event) => update('emergency_contact_name', event.target.value)} /></ProfileField><ProfileField label="Emergency contact phone"><input type="tel" autoComplete="off" maxLength="40" value={profile.emergency_contact_phone || ''} onChange={(event) => update('emergency_contact_phone', event.target.value)} /></ProfileField></div>
        </section>
        <section className="data-panel profile-section">
          <div className="profile-section-heading"><div><p className="eyebrow">On the road</p><h3>Vehicle information</h3></div><span className="profile-step">03</span></div>
          <div className="profile-fields"><ProfileField label="Vehicle type"><select value={profile.vehicle_type || 'Motorcycle'} onChange={(event) => update('vehicle_type', event.target.value)}>{['Motorcycle', 'Car', 'Van', 'Truck'].map((type) => <option key={type}>{type}</option>)}</select></ProfileField><ProfileField label="Make and model" required><input required maxLength="120" placeholder="e.g. Honda CB 150R" value={profile.vehicle_make_model || ''} onChange={(event) => update('vehicle_make_model', event.target.value)} /></ProfileField><ProfileField label="Registration number" required><input required maxLength="40" value={profile.vehicle_registration || ''} onChange={(event) => update('vehicle_registration', event.target.value)} /></ProfileField></div>
        </section>
        <section className="data-panel profile-section">
          <div className="profile-section-heading"><div><p className="eyebrow">Required verification</p><h3>Identity documents</h3></div><span className="profile-step">04</span></div>
          <p className="profile-helper">Documents are private to your account. Accepted: PDF, JPG, or PNG, up to 8 MB each.</p>
          <div className="document-list">{[['nid_card', 'NID Card', verification?.nid], ['driving_license', 'Driving License', verification?.license]].map(([key, label, state]) => <DocumentUpload key={key} documentType={key} label={label} document={profile.documents?.[key]} state={state} uploading={uploading === key} disabled={Boolean(uploading)} onUpload={uploadDocument} onDownload={downloadDocument} />)}</div>
          <div className="profile-fields license-fields"><ProfileField label="Driving license number" required><input autoComplete="off" maxLength="40" value={profile.license_number || ''} onChange={(event) => update('license_number', event.target.value)} /></ProfileField><ProfileField label="License expiry date" required><input type="date" value={profile.license_expiry || ''} onChange={(event) => update('license_expiry', event.target.value)} /></ProfileField></div>
        </section>
        {message.text && <div className={`profile-alert ${message.type}`} role="status">{message.text}</div>}
        <button className="primary-button profile-save" type="submit" disabled={saving}><span>{saving ? 'Saving profile...' : 'Save profile details'}</span><b>→</b></button>
      </form>
      <aside className="profile-sidebar">
        <section className="data-panel profile-progress-panel"><p className="eyebrow">Profile readiness</p><div className="profile-progress-heading"><strong>{completion}%</strong><span>complete</span></div><div className="profile-progress-track"><span style={{ width: `${completion}%` }} /></div><p className="muted">Complete the required details and add all three documents to submit your profile for review.</p></section>
        <section className="data-panel profile-section"><p className="eyebrow">Verification checklist</p><h3>Review status</h3><VerificationItem label="Personal details" complete={completedFields === requiredFields.length} detail={completedFields === requiredFields.length ? 'Required details added' : `${completedFields} of ${requiredFields.length} required`} /><VerificationItem label="NID card" complete={Boolean(profile.documents?.nid_card)} detail={verification?.nid || 'Required'} /><VerificationItem label="Driving license" complete={Boolean(profile.documents?.driving_license)} detail={verification?.license || 'Required'} /><VerificationItem label="Profile photo" complete={Boolean(profile.documents?.profile_photo)} detail={verification?.photo || 'Required'} /></section>
      </aside>
    </div>
  </main></TranslationBoundary>
}

function ProfileField({ label, required = false, wide = false, children }) { return <label className={`profile-field ${wide ? 'wide' : ''}`}>{label}{required && <span className="required-mark">Required</span>}{children}</label> }
function DocumentUpload({ documentType, label, document, state, uploading, disabled, onUpload, onDownload }) { return <div className="document-row"><div className={`document-icon ${document ? 'uploaded' : ''}`} aria-hidden="true">{document ? '✓' : '↑'}</div><div className="document-info"><strong>{label}</strong><small>{document ? `${document.original_name} · ${(document.size / 1024 / 1024).toFixed(1)} MB` : `${state || 'Required'} · PDF, JPG, PNG`}</small></div><div className="document-actions">{document && <button type="button" className="document-download" onClick={() => onDownload(documentType)}>Download</button>}<label className="upload-button compact">{uploading ? 'Uploading...' : document ? 'Replace' : 'Upload'}<input type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={disabled} onChange={(event) => onUpload(documentType, event.target.files?.[0])} /></label></div></div> }
function VerificationItem({ label, complete, detail }) { return <div className="verification-item"><i className={complete ? 'complete' : ''}>{complete ? '✓' : '!'}</i><span><strong>{label}</strong><small>{detail}</small></span></div> }
