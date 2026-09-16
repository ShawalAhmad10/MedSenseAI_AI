import React, { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
import {
  ArrowLeft, Upload, Download, SlidersHorizontal, Search,
  Eye, X, Pill, AlertTriangle, ChevronLeft, ChevronRight,
  Plus, Trash2, ShieldAlert, RefreshCw, MessageSquare,
  MessageSquarePlus, CheckCircle, Flag, XCircle, AlertCircle, Info, FileX
} from 'lucide-react'

// Common components to import
import StatusBadge from '../../components/common/StatusBadge'
import ConfidenceBar from '../../components/common/ConfidenceBar'
import RichTextNote from '../../components/common/RichTextNote'
import ImageViewer from '../../components/common/ImageViewer'
import Pagination from '../../components/common/Pagination'
import SeverityBadge from '../../components/common/SeverityBadge'
import { useToast } from '../../hooks/useToast'
import { formatDate, formatTimeAgo } from '../../utils/formatters'

// Mock data
const mockPrescriptions = [
  {
    id:'RX-001', patientName:'Ahmed Khan', patientId:'PAT-1042',
    initials:'AK', hue:210,
    uploadDate: new Date(Date.now()-2*60000).toISOString(),
    medicineCount:3, interactionCount:2,
    confidence:91, status:'pending',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjgwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOWZhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2FhYSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+UFJFU0NSSVBUSU9OIFJYLTAwMTwvdGV4dD48L3N2Zz4=',
    medicines:[
      {id:'m1',name:'Warfarin 5mg',genericName:'Warfarin sodium',dosage:'5mg',frequency:'Once daily'},
      {id:'m2',name:'Aspirin 100mg',genericName:'Acetylsalicylic acid',dosage:'100mg',frequency:'Once daily'},
      {id:'m3',name:'Omeprazole',genericName:'Omeprazole',dosage:'20mg',frequency:'Before meals'},
    ],
    interactions:[
      {id:'i1', medicines:['Warfarin','Aspirin'], severity:'critical',
       description:'Concurrent use significantly increases bleeding risk.',
       recommendation:'Consider alternative antiplatelet or reduce Warfarin dose.'},
    ],
  },
  {
    id:'RX-002', patientName:'Sara Raza', patientId:'PAT-2091',
    initials:'SR', hue:142,
    uploadDate: new Date(Date.now()-15*60000).toISOString(),
    medicineCount:2, interactionCount:0,
    confidence:88, status:'pending',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjgwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOWZhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2FhYSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+UFJFU0NSSVBUSU9OIFJYLTAwMjwvdGV4dD48L3N2Zz4=',
    medicines:[
      {id:'m1',name:'Metformin 500mg',genericName:'Metformin HCl',dosage:'500mg',frequency:'Twice daily'},
      {id:'m2',name:'Glimepiride 2mg',genericName:'Glimepiride',dosage:'2mg',frequency:'Once daily'},
    ],
    interactions:[],
  },
  {
    id:'RX-003', patientName:'Bilal Hussain', patientId:'PAT-0337',
    initials:'BH', hue:280,
    uploadDate: new Date(Date.now()-60*60000).toISOString(),
    medicineCount:4, interactionCount:1,
    confidence:62, status:'flagged',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjgwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOWZhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2FhYSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+UFJFU0NSSVBUSU9OIFJYLTAwMzwvdGV4dD48L3N2Zz4=',
    medicines:[
      {id:'m1',name:'Lisinopril 10mg',genericName:'Lisinopril',dosage:'10mg',frequency:'Once daily'},
      {id:'m2',name:'Spironolactone',genericName:'Spironolactone',dosage:'25mg',frequency:'Once daily'},
      {id:'m3',name:'Potassium Chloride',genericName:'KCl',dosage:'20mEq',frequency:'Twice daily'},
      {id:'m4',name:'Ibuprofen 400mg',genericName:'Ibuprofen',dosage:'400mg',frequency:'As needed'},
    ],
    interactions:[
      {id:'i1', medicines:['Lisinopril','Potassium Chloride'], severity:'warning',
       description:'Risk of hyperkalemia when used together.',
       recommendation:'Monitor potassium levels regularly.'},
    ],
  },
  {
    id:'RX-004', patientName:'Fatima Ali', patientId:'PAT-1155',
    initials:'FA', hue:32,
    uploadDate: new Date(Date.now()-3*3600000).toISOString(),
    medicineCount:2, interactionCount:0,
    confidence:95, status:'approved',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjgwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOWZhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2FhYSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+UFJFU0NSSVBUSU9OIFJYLTAwNDwvdGV4dD48L3N2Zz4=',
    medicines:[
      {id:'m1',name:'Amoxicillin 500mg',genericName:'Amoxicillin trihydrate',dosage:'500mg',frequency:'Three times daily'},
      {id:'m2',name:'Paracetamol 500mg',genericName:'Acetaminophen',dosage:'500mg',frequency:'As needed'},
    ],
    interactions:[],
  },
  {
    id:'RX-005', patientName:'Usman Sheikh', patientId:'PAT-2240',
    initials:'US', hue:0,
    uploadDate: new Date(Date.now()-5*3600000).toISOString(),
    medicineCount:3, interactionCount:1,
    confidence:44, status:'rejected',
    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjgwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOWZhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2FhYSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+UFJFU0NSSVBUSU9OIFJYLTAwNTwvdGV4dD48L3N2Zz4=',
    medicines:[
      {id:'m1',name:'Atorvastatin 40mg',genericName:'Atorvastatin calcium',dosage:'40mg',frequency:'Once at night'},
      {id:'m2',name:'Erythromycin 500mg',genericName:'Erythromycin',dosage:'500mg',frequency:'Four times daily'},
      {id:'m3',name:'Digoxin 0.25mg',genericName:'Digoxin',dosage:'0.25mg',frequency:'Once daily'},
    ],
    interactions:[
      {id:'i1', medicines:['Atorvastatin','Erythromycin'], severity:'critical',
       description:'Erythromycin inhibits statin metabolism, risking rhabdomyolysis.',
       recommendation:'Temporarily discontinue statin during antibiotic course.'},
    ],
  },
]

// Mock service
const prescriptionService = {
  approve: async () => new Promise(res => setTimeout(res, 800)),
  flag: async () => new Promise(res => setTimeout(res, 800)),
  reject: async () => new Promise(res => setTimeout(res, 800)),
}

export default function PrescriptionReview() {
  const [prescriptions, setPrescriptions] = useState(mockPrescriptions)
  const [selectedRx, setSelectedRx] = useState(null)
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('Newest')
  
  const [medicines, setMedicines] = useState([])
  const [interactions, setInteractions] = useState([])
  
  const [reviewNote, setReviewNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const [actionRequiresNote, setActionRequiresNote] = useState(false)
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCheckingInteractions, setIsCheckingInteractions] = useState(false)
  const [isMedicinesEdited, setIsMedicinesEdited] = useState(false)
  const [expandedInteraction, setExpandedInteraction] = useState(null)
  const [actionResult, setActionResult] = useState(null)
  
  const [showUpload, setShowUpload] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadPatientName, setUploadPatientName] = useState('')
  
  const fileInputRef = useRef(null)
  const noteRef = useRef(null)
  const controls = useAnimation()
  
  const toast = useToast()
  const showToast = toast?.showToast || console.log

  function openReview(rx) {
    setSelectedRx(rx)
    setMedicines([...rx.medicines])
    setInteractions([...rx.interactions])
    setReviewNote('')
    setNoteError('')
    setActionRequiresNote(false)
    setIsMedicinesEdited(false)
    setExpandedInteraction(null)
    setActionResult(null)
  }

  const filteredRx = useMemo(() => {
    let list = prescriptions
    if (activeTab !== 'all') list = list.filter(r => r.status === activeTab)
    if (searchQuery) list = list.filter(r =>
      r.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.id.toLowerCase().includes(searchQuery.toLowerCase()))
    if (sortBy === 'Newest') list = [...list].sort((a,b) => new Date(b.uploadDate)-new Date(a.uploadDate))
    if (sortBy === 'Oldest') list = [...list].sort((a,b) => new Date(a.uploadDate)-new Date(b.uploadDate))
    if (sortBy === 'Critical First') list = [...list].sort((a,b) => b.interactionCount - a.interactionCount)
    return list
  }, [prescriptions, activeTab, searchQuery, sortBy])

  const total = prescriptions.length
  const pending = prescriptions.filter(r => r.status === 'pending')
  const approved = prescriptions.filter(r => r.status === 'approved')
  const flagged = prescriptions.filter(r => r.status === 'flagged')
  const rejected = prescriptions.filter(r => r.status === 'rejected')

  const tabs = [
    { id:'all',      label:'All',      count: total },
    { id:'pending',  label:'Pending',  count: pending.length },
    { id:'approved', label:'Approved', count: approved.length },
    { id:'flagged',  label:'Flagged',  count: flagged.length },
    { id:'rejected', label:'Rejected', count: rejected.length },
  ]

  function nextRx() {
    const idx = filteredRx.findIndex(r => r.id === selectedRx?.id)
    const next = filteredRx[idx + 1]
    if (next) openReview(next)
  }

  function prevRx() {
    const idx = filteredRx.findIndex(r => r.id === selectedRx?.id)
    const prev = filteredRx[idx - 1]
    if (prev) openReview(prev)
  }

  function moveToNext() {
    const idx = filteredRx.findIndex(r => r.id === selectedRx?.id)
    const next = filteredRx[idx + 1]
    if (next) openReview(next)
    else setSelectedRx(null)
    setActionResult(null)
  }

  function handleQuickReject(rx) {
    showToast({ type:'info', message:`Quick reject for ${rx.patientName}` })
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setUploadFile(e.dataTransfer.files[0])
    }
  }

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0])
    }
  }

  const handleUploadSubmit = () => {
    showToast({ type:'success', message: 'Prescription uploaded successfully' })
    setShowUpload(false)
    setUploadFile(null)
    setUploadPatientName('')
  }

  const updateMedicine = (index, field, value) => {
    const updated = [...medicines]
    updated[index][field] = value
    setMedicines(updated)
    setIsMedicinesEdited(true)
  }

  const removeMedicine = (index) => {
    const updated = medicines.filter((_, i) => i !== index)
    setMedicines(updated)
    setIsMedicinesEdited(true)
  }

  const addMedicineRow = () => {
    setMedicines([
      ...medicines,
      { id: Date.now().toString(), name: '', genericName: '', dosage: '', frequency: '' }
    ])
    setIsMedicinesEdited(true)
  }

  const reRunInteractionCheck = () => {
    setIsCheckingInteractions(true)
    setTimeout(() => {
      setIsCheckingInteractions(false)
      setIsMedicinesEdited(false)
      showToast({ type: 'success', message: 'Interactions re-checked successfully.' })
    }, 1500)
  }

  const updateInteractionNote = (id, value) => {
    const updated = interactions.map(i => i.id === id ? { ...i, note: value } : i)
    setInteractions(updated)
  }

  async function handleApprove() {
    setIsSubmitting(true)
    try {
      await prescriptionService.approve(selectedRx.id, {
        medicines, note: reviewNote
      })
      showToast({ type:'success', message:`Prescription approved for ${selectedRx.patientName}` })
      setActionResult('approved')
      setTimeout(() => {
        moveToNext()
      }, 1500)
    } catch (err) {
      showToast({ type:'error', message: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleFlag() {
    if (!reviewNote.trim()) {
      setNoteError('Please add a note explaining why this is flagged')
      setActionRequiresNote(true)
      noteRef.current?.scrollIntoView({ behavior:'smooth' })
      return
    }
    setIsSubmitting(true)
    try {
      await prescriptionService.flag(selectedRx.id, {
        medicines, note: reviewNote, interactions
      })
      showToast({ type:'warning', message:`Prescription flagged — ${reviewNote.slice(0,40)}...` })
      setActionResult('flagged')
      setTimeout(moveToNext, 1500)
    } catch (err) {
      showToast({ type:'error', message: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleReject() {
    if (!reviewNote.trim()) {
      setNoteError('A note is mandatory when rejecting a prescription')
      setActionRequiresNote(true)
      controls.start({ x:[0,-6,6,-4,4,0], transition:{duration:0.4} })
      noteRef.current?.scrollIntoView({ behavior:'smooth' })
      return
    }
    setIsSubmitting(true)
    try {
      await prescriptionService.reject(selectedRx.id, {
        note: reviewNote, reason: 'Rejected by pharmacist'
      })
      showToast({ type:'error', message:`Prescription rejected` })
      setActionResult('rejected')
      setTimeout(moveToNext, 1500)
    } catch (err) {
      showToast({ type:'error', message: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    function handleKey(e) {
      if (!selectedRx) return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'a' || e.key === 'A') handleApprove()
      if (e.key === 'f' || e.key === 'F') handleFlag()
      if (e.key === 'r' || e.key === 'R') handleReject()
      if (e.key === 'Escape') setSelectedRx(null)
      if (e.key === 'ArrowRight') nextRx()
      if (e.key === 'ArrowLeft') prevRx()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedRx, reviewNote, medicines, interactions])

  const safeFormatDate = (date) => formatDate ? formatDate(date) : new Date(date).toLocaleDateString()
  const safeFormatTimeAgo = (date) => formatTimeAgo ? formatTimeAgo(date) : 'Recently'

  return (
    <div style={{ padding: '1.5rem', width: '100%', maxWidth: 1400, margin: '0 auto' }}>
      
      {/* PAGE HEADER */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
          {selectedRx && (
            <motion.button
              initial={{ opacity:0, x:-10 }}
              animate={{ opacity:1, x:0 }}
              whileHover={{ x:-3 }}
              onClick={() => setSelectedRx(null)}
              style={{ display:'flex', alignItems:'center', gap:6, border:'none',
                       background:'none', cursor:'pointer', color:'var(--gray-600)',
                       fontFamily:'var(--font-body)', fontSize:'0.82rem', padding:0 }}>
              <ArrowLeft size={16} /> Back to Queue
            </motion.button>
          )}
          <div>
            <h1 style={{ fontFamily:'var(--font-display)', fontWeight:800,
                         fontSize:'1.6rem', color:'var(--navy)', marginBottom:2 }}>
              Prescription Review
            </h1>
            <p style={{ fontSize:'0.78rem', color:'var(--gray-400)', fontWeight:300 }}>
              {selectedRx
                ? `Reviewing: ${selectedRx.patientName} · ${safeFormatDate(selectedRx.uploadDate)}`
                : `Overview › All Prescriptions`}
            </p>
          </div>
        </div>

        <div style={{ display:'flex', gap:'0.6rem', alignItems:'center' }}>
          <motion.div
            whileHover={{ y:-2, boxShadow:'var(--dash-shadow-hover)' }}
            whileTap={{ scale:0.97 }}
            onClick={() => setShowUpload(true)}
            style={{ display:'flex', alignItems:'center', gap:6,
                     padding:'0.5rem 1rem', borderRadius:100,
                     background:'var(--navy)', color:'white',
                     fontSize:'0.82rem', fontWeight:500, cursor:'pointer',
                     border:'none', fontFamily:'var(--font-body)' }}>
            <Upload size={14} /> Upload Prescription
          </motion.div>

          <motion.div
            whileHover={{ boxShadow:'var(--dash-shadow-hover)' }}
            style={{ display:'flex', alignItems:'center', gap:6,
                     padding:'0.5rem 0.9rem', borderRadius:100,
                     border:'1px solid var(--dash-border)', background:'white',
                     fontSize:'0.82rem', color:'var(--navy)', cursor:'pointer' }}>
            <Download size={14} /> Export
          </motion.div>

          <motion.div
            whileHover={{ boxShadow:'var(--dash-shadow-hover)' }}
            style={{ display:'flex', alignItems:'center', gap:6,
                     padding:'0.5rem 0.9rem', borderRadius:100,
                     border:'1px solid var(--dash-border)', background:'white',
                     fontSize:'0.82rem', color:'var(--navy)', cursor:'pointer' }}>
            <SlidersHorizontal size={14} /> Filter
          </motion.div>
        </div>
      </div>

      {/* STATUS TABS */}
      {!selectedRx && (
        <div style={{ display:'flex', alignItems:'center', gap:'0.35rem',
                      background:'white', borderRadius:100, padding:4,
                      border:'1px solid var(--dash-border)',
                      boxShadow:'var(--dash-shadow)',
                      marginBottom:'1.25rem',
                      width:'fit-content' }}>
          {tabs.map(tab => (
            <motion.button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{ position:'relative', padding:'0.42rem 1rem',
                       borderRadius:100, border:'none', background:'transparent',
                       fontFamily:'var(--font-body)', fontSize:'0.82rem',
                       fontWeight: activeTab===tab.id ? 600 : 400,
                       color: activeTab===tab.id ? 'white' : 'var(--gray-600)',
                       cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              {activeTab===tab.id && (
                <motion.div
                  layoutId="rx-tab-pill"
                  style={{ position:'absolute', inset:0, borderRadius:100,
                           background:'var(--navy)', zIndex:0 }}
                  transition={{ type:'spring', stiffness:500, damping:35 }}
                />
              )}
              <span style={{ position:'relative', zIndex:1 }}>{tab.label}</span>
              {tab.count > 0 && (
                <span style={{ position:'relative', zIndex:1,
                               background: activeTab===tab.id
                                 ? 'rgba(255,255,255,0.2)'
                                 : 'var(--dash-bg)',
                               borderRadius:100, fontSize:'0.65rem',
                               fontWeight:700, padding:'1px 6px',
                               color: activeTab===tab.id ? 'white' : 'var(--gray-600)' }}>
                  {tab.count}
                </span>
              )}
            </motion.button>
          ))}
        </div>
      )}

      {/* PAGE BODY */}
      <AnimatePresence mode="wait">
        {!selectedRx ? (
          <motion.div
            key="queue-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ background: 'white', borderRadius: 'var(--dash-radius)', boxShadow: 'var(--dash-shadow)' }}
          >
            {/* SEARCH + SORT ROW */}
            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem',
                          padding:'1rem 1.25rem', borderBottom:'1px solid var(--dash-border)' }}>
              <div style={{ flex:1, position:'relative', maxWidth:320 }}>
                <Search size={15} style={{ position:'absolute', left:12, top:'50%',
                                           transform:'translateY(-50%)', color:'var(--gray-400)' }} />
                <input
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by patient name or Rx ID..."
                  style={{ width:'100%', height:38, background:'var(--dash-bg)',
                           border:'1px solid var(--dash-border)', borderRadius:100,
                           paddingLeft:36, paddingRight:12, fontFamily:'var(--font-body)',
                           fontSize:'0.82rem', color:'var(--navy)', outline:'none' }}
                />
              </div>
              <div style={{ display:'flex', gap:'0.4rem' }}>
                {['Newest','Oldest','Critical First'].map(sort => (
                  <motion.div key={sort}
                    onClick={() => setSortBy(sort)}
                    whileHover={{ boxShadow:'var(--dash-shadow-hover)' }}
                    style={{ padding:'0.4rem 0.875rem', borderRadius:100,
                             border:'1px solid var(--dash-border)', fontSize:'0.78rem',
                             background: sortBy===sort ? 'var(--navy)' : 'white',
                             color: sortBy===sort ? 'white' : 'var(--gray-600)',
                             cursor:'pointer', fontWeight: sortBy===sort ? 600 : 400,
                             transition:'all 0.2s' }}>
                    {sort}
                  </motion.div>
                ))}
              </div>
              <span style={{ marginLeft:'auto', fontSize:'0.75rem', color:'var(--gray-400)' }}>
                {filteredRx.length} prescriptions
              </span>
            </div>

            {/* TABLE */}
            {filteredRx.length === 0 ? (
              <motion.div initial={{opacity:0}} animate={{opacity:1}}
                style={{ textAlign:'center', padding:'4rem 2rem' }}>
                <FileX size={48} color="var(--gray-200)" strokeWidth={1} style={{marginBottom:'1rem', margin:'0 auto'}} />
                <p style={{fontFamily:'var(--font-display)', fontWeight:700, color:'var(--gray-400)'}}>
                  No prescriptions {activeTab !== 'all' ? `with "${activeTab}" status` : 'found'}
                </p>
                <p style={{fontSize:'0.82rem', color:'var(--gray-400)', fontWeight:300, marginTop:4}}>
                  {searchQuery ? 'Try a different search term' : 'Upload a prescription to get started'}
                </p>
              </motion.div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--dash-border)', color: 'var(--gray-400)', fontSize: '0.78rem', fontWeight: 500 }}>
                      <th style={{ padding: '1rem 1.25rem', fontWeight: 500 }}>#</th>
                      <th style={{ padding: '1rem 0', fontWeight: 500 }}>Patient Name</th>
                      <th style={{ padding: '1rem 0', fontWeight: 500 }}>Upload Date</th>
                      <th style={{ padding: '1rem 0', fontWeight: 500 }}>Medicines</th>
                      <th style={{ padding: '1rem 0', fontWeight: 500, minWidth: 120 }}>OCR Confidence</th>
                      <th style={{ padding: '1rem 0', fontWeight: 500 }}>Status</th>
                      <th style={{ padding: '1rem 1.25rem 1rem 0', fontWeight: 500 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRx.map((rx, i) => (
                      <motion.tr
                        key={rx.id}
                        className={`rx-table-row ${selectedRx?.id === rx.id ? 'selected' : ''}`}
                        initial={{ opacity:0, y:10 }}
                        animate={{ opacity:1, y:0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => openReview(rx)}
                        whileHover={{ backgroundColor:'var(--dash-bg)' }}
                        style={{ borderBottom: '1px solid var(--dash-border)' }}
                      >
                        <td style={{ padding:'1rem 1.25rem', fontSize:'0.78rem',
                                     color:'var(--gray-400)', fontWeight:300 }}>
                          #{String(i+1).padStart(3,'0')}
                        </td>

                        <td style={{ padding:'1rem 0' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
                            <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0,
                                          background:`hsl(${rx.hue},60%,88%)`, display:'flex',
                                          alignItems:'center', justifyContent:'center',
                                          fontFamily:'var(--font-display)', fontWeight:700,
                                          fontSize:'0.72rem', color:`hsl(${rx.hue},50%,35%)` }}>
                              {rx.initials}
                            </div>
                            <div>
                              <p style={{ fontSize:'0.85rem', fontWeight:600, color:'var(--navy)' }}>
                                {rx.patientName}
                              </p>
                              <p style={{ fontSize:'0.7rem', color:'var(--gray-400)', fontWeight:300 }}>
                                ID: {rx.patientId}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding:'1rem 0' }}>
                          <p style={{ fontSize:'0.82rem', color:'var(--navy)', fontWeight:400 }}>
                            {safeFormatDate(rx.uploadDate)}
                          </p>
                          <p style={{ fontSize:'0.7rem', color:'var(--gray-400)', fontWeight:300 }}>
                            {safeFormatTimeAgo(rx.uploadDate)}
                          </p>
                        </td>

                        <td style={{ padding:'1rem 0' }}>
                          <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
                            <div style={{ width:28, height:28, borderRadius:8,
                                          background:'var(--blue-light)', display:'flex',
                                          alignItems:'center', justifyContent:'center' }}>
                              <Pill size={13} color="var(--blue)" />
                            </div>
                            <div>
                              <span style={{ fontSize:'0.85rem', fontWeight:600, color:'var(--navy)' }}>
                                {rx.medicineCount}
                              </span>
                              <span style={{ fontSize:'0.72rem', color:'var(--gray-400)',
                                             fontWeight:300, marginLeft:4 }}>medicines</span>
                              {rx.interactionCount > 0 && (
                                <div style={{ display:'flex', alignItems:'center', gap:3, marginTop:2 }}>
                                  <AlertTriangle size={10} color="var(--rx-flagged)" />
                                  <span style={{ fontSize:'0.65rem', color:'var(--rx-flagged)', fontWeight:600 }}>
                                    {rx.interactionCount} interaction{rx.interactionCount>1?'s':''}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td style={{ padding:'1rem 0', minWidth:120, paddingRight: '1rem' }}>
                          <ConfidenceBar value={rx.confidence} compact={false} />
                        </td>

                        <td style={{ padding:'1rem 0' }}>
                          <StatusBadge status={rx.status} size="md" />
                        </td>

                        <td style={{ padding:'1rem 1.25rem 1rem 0' }}>
                          <div style={{ display:'flex', gap:'0.4rem' }}>
                            <motion.div
                              whileHover={{ background:'var(--navy)', color:'white',
                                            borderColor:'var(--navy)' }}
                              whileTap={{ scale:0.95 }}
                              onClick={e => { e.stopPropagation(); openReview(rx) }}
                              style={{ padding:'0.3rem 0.75rem', borderRadius:100,
                                       border:'1px solid var(--dash-border)', background:'white',
                                       fontSize:'0.72rem', fontWeight:500, color:'var(--navy)',
                                       cursor:'pointer', transition:'all 0.2s',
                                       display:'flex', alignItems:'center', gap:5 }}>
                              <Eye size={12} /> Review
                            </motion.div>
                            <motion.div
                              whileHover={{ background:'var(--red-light)', borderColor:'var(--red)',
                                            color:'var(--red)' }}
                              whileTap={{ scale:0.95 }}
                              onClick={e => { e.stopPropagation(); handleQuickReject(rx) }}
                              style={{ width:30, height:30, borderRadius:'50%',
                                       border:'1px solid var(--dash-border)', background:'white',
                                       display:'flex', alignItems:'center', justifyContent:'center',
                                       cursor:'pointer', transition:'all 0.2s', color:'var(--gray-400)' }}>
                              <X size={13} />
                            </motion.div>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {filteredRx.length > 0 && (
               <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--dash-border)', display: 'flex', justifyContent: 'center' }}>
                 <Pagination currentPage={1} totalPages={1} onPageChange={() => {}} />
               </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="split-view"
            initial={{ opacity:0 }}
            animate={{ opacity:1 }}
            exit={{ opacity:0 }}
            style={{ display:'grid', gridTemplateColumns:'42% 58%',
                     gap:'1rem', height:'calc(100vh - 220px)', minHeight:600 }}
          >
            <motion.div
              initial={{ opacity:0, x:-30 }}
              animate={{ opacity:1, x:0 }}
              transition={{ duration:0.5, ease:[0.16,1,0.3,1] }}
              style={{ display:'flex', flexDirection:'column', gap:'0.75rem', height:'100%' }}
            >
              <div style={{ background:'white', border:'1px solid var(--dash-border)',
                            borderRadius:'var(--dash-radius)', padding:'1rem 1.25rem',
                            display:'flex', alignItems:'center', gap:'0.875rem' }}>
                <div style={{ width:42, height:42, borderRadius:'50%', flexShrink:0,
                              background:`hsl(${selectedRx.hue},60%,88%)`, display:'flex',
                              alignItems:'center', justifyContent:'center',
                              fontFamily:'var(--font-display)', fontWeight:700,
                              color:`hsl(${selectedRx.hue},50%,35%)` }}>
                  {selectedRx.initials}
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontFamily:'var(--font-display)', fontWeight:700,
                              fontSize:'0.95rem', color:'var(--navy)' }}>
                    {selectedRx.patientName}
                  </p>
                  <p style={{ fontSize:'0.72rem', color:'var(--gray-400)', fontWeight:300 }}>
                    Uploaded {safeFormatTimeAgo(selectedRx.uploadDate)} · {selectedRx.medicineCount} medicines
                  </p>
                </div>
                <StatusBadge status={selectedRx.status} size="sm" />
                <ConfidenceBar value={selectedRx.confidence} compact />
              </div>

              <div style={{ flex:1 }}>
                <ImageViewer
                  src={selectedRx.imageUrl}
                  alt={`Prescription for ${selectedRx.patientName}`}
                  isProcessing={selectedRx.isProcessing}
                />
              </div>

              <div style={{ display:'flex', gap:'0.5rem' }}>
                <motion.div whileHover={{y:-2}} onClick={prevRx}
                  style={{ flex:1, padding:'0.55rem', borderRadius:100,
                           border:'1px solid var(--dash-border)', background:'white',
                           display:'flex', alignItems:'center', justifyContent:'center',
                           gap:6, fontSize:'0.78rem', color:'var(--gray-600)',
                           cursor:'pointer', fontWeight:400 }}>
                  <ChevronLeft size={14} /> Previous
                </motion.div>
                <motion.div whileHover={{y:-2}} onClick={nextRx}
                  style={{ flex:1, padding:'0.55rem', borderRadius:100,
                           border:'1px solid var(--dash-border)', background:'white',
                           display:'flex', alignItems:'center', justifyContent:'center',
                           gap:6, fontSize:'0.78rem', color:'var(--gray-600)',
                           cursor:'pointer', fontWeight:400 }}>
                  Next <ChevronRight size={14} />
                </motion.div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity:0, x:30 }}
              animate={{ opacity:1, x:0 }}
              transition={{ duration:0.5, delay:0.1, ease:[0.16,1,0.3,1] }}
              style={{ display:'flex', flexDirection:'column', gap:'0.85rem',
                       height:'100%', overflowY:'auto',
                       paddingRight:'0.25rem',
                       scrollbarWidth:'thin',
                       scrollbarColor:'var(--gray-200) transparent' }}
            >
              <div style={{ background:'white', border:'1px solid var(--dash-border)',
                            borderRadius:'var(--dash-radius)',
                            boxShadow:'var(--dash-shadow)' }}>

                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                              padding:'1rem 1.25rem',
                              borderBottom:'1px solid var(--dash-border)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                    <div style={{ width:28, height:28, borderRadius:8, background:'var(--blue-light)',
                                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <Pill size={14} color="var(--blue)" />
                    </div>
                    <h3 style={{ fontFamily:'var(--font-display)', fontWeight:600,
                                 fontSize:'0.95rem', color:'var(--navy)' }}>
                      Extracted Medicines
                    </h3>
                    <span style={{ background:'var(--dash-bg)', borderRadius:100,
                                   padding:'2px 8px', fontSize:'0.68rem',
                                   fontWeight:700, color:'var(--gray-600)' }}>
                      {medicines.length} found
                    </span>
                  </div>
                  <motion.div
                    whileHover={{ scale:1.05 }}
                    whileTap={{ scale:0.95 }}
                    onClick={addMedicineRow}
                    style={{ display:'flex', alignItems:'center', gap:5,
                             padding:'0.35rem 0.75rem', borderRadius:100,
                             border:'1px solid var(--dash-border)', background:'white',
                             fontSize:'0.72rem', fontWeight:500, color:'var(--navy)',
                             cursor:'pointer' }}>
                    <Plus size={12} /> Add Medicine
                  </motion.div>
                </div>

                <div style={{ padding:'0.5rem 0' }}>
                  <AnimatePresence>
                    {medicines.map((med, i) => (
                      <motion.div
                        key={med.id}
                        initial={{ opacity:0, y:10 }}
                        animate={{ opacity:1, y:0 }}
                        exit={{ opacity:0, height:0, marginBottom:0 }}
                        transition={{ delay: i * 0.05 }}
                        style={{ display:'grid',
                                 gridTemplateColumns:'2fr 1fr 1fr auto',
                                 gap:'0.5rem', padding:'0.625rem 1.25rem',
                                 alignItems:'center',
                                 borderBottom:'1px solid var(--dash-border)' }}
                      >
                        <div>
                          <input
                            value={med.name}
                            onChange={e => updateMedicine(i, 'name', e.target.value)}
                            style={{ width:'100%', border:'none', background:'transparent',
                                     fontFamily:'var(--font-body)', fontSize:'0.85rem',
                                     fontWeight:500, color:'var(--navy)', outline:'none',
                                     borderBottom:'1.5px solid transparent',
                                     padding:'2px 0', transition:'border-color 0.2s' }}
                            onFocus={e => e.target.style.borderBottomColor='var(--blue)'}
                            onBlur={e => e.target.style.borderBottomColor='transparent'}
                          />
                          <p style={{ fontSize:'0.68rem', color:'var(--gray-400)', fontWeight:300,
                                      marginTop:2 }}>
                            {med.genericName}
                          </p>
                        </div>

                        <input
                          value={med.dosage}
                          onChange={e => updateMedicine(i, 'dosage', e.target.value)}
                          placeholder="e.g. 500mg"
                          style={{ border:'1px solid var(--dash-border)', borderRadius:6,
                                   padding:'0.3rem 0.5rem', fontSize:'0.78rem',
                                   fontFamily:'var(--font-body)', color:'var(--navy)',
                                   outline:'none', background:'var(--dash-bg)',
                                   transition:'border-color 0.2s' }}
                          onFocus={e => e.target.style.borderColor='var(--blue)'}
                          onBlur={e => e.target.style.borderColor='var(--dash-border)'}
                        />

                        <input
                          value={med.frequency}
                          onChange={e => updateMedicine(i, 'frequency', e.target.value)}
                          placeholder="e.g. 3x daily"
                          style={{ border:'1px solid var(--dash-border)', borderRadius:6,
                                   padding:'0.3rem 0.5rem', fontSize:'0.78rem',
                                   fontFamily:'var(--font-body)', color:'var(--navy)',
                                   outline:'none', background:'var(--dash-bg)',
                                   transition:'border-color 0.2s' }}
                          onFocus={e => e.target.style.borderColor='var(--blue)'}
                          onBlur={e => e.target.style.borderColor='var(--dash-border)'}
                        />

                        <motion.div
                          whileHover={{ color:'var(--red)', background:'var(--red-light)' }}
                          whileTap={{ scale:0.9 }}
                          onClick={() => removeMedicine(i)}
                          style={{ width:26, height:26, borderRadius:'50%',
                                   display:'flex', alignItems:'center', justifyContent:'center',
                                   cursor:'pointer', color:'var(--gray-400)',
                                   transition:'all 0.15s' }}>
                          <Trash2 size={12} />
                        </motion.div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {isMedicinesEdited && (
                  <motion.div
                    initial={{ opacity:0, height:0 }}
                    animate={{ opacity:1, height:'auto' }}
                    style={{ padding:'0.75rem 1.25rem',
                             borderTop:'1px solid var(--dash-border)',
                             display:'flex', justifyContent:'flex-end' }}>
                    <motion.div
                      whileHover={{ y:-2, boxShadow:'var(--dash-shadow-hover)' }}
                      whileTap={{ scale:0.97 }}
                      onClick={reRunInteractionCheck}
                      style={{ display:'flex', alignItems:'center', gap:6,
                               padding:'0.45rem 1rem', borderRadius:100,
                               background:'var(--navy)', color:'white',
                               fontSize:'0.78rem', fontWeight:500, cursor:'pointer' }}>
                      <RefreshCw size={13} /> Re-check Interactions
                    </motion.div>
                  </motion.div>
                )}
              </div>

              <div style={{ background:'white', border:'1px solid var(--dash-border)',
                            borderRadius:'var(--dash-radius)',
                            boxShadow:'var(--dash-shadow)' }}>

                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem',
                              padding:'1rem 1.25rem',
                              borderBottom:'1px solid var(--dash-border)' }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:'var(--severity-critical-bg)',
                                display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <ShieldAlert size={14} color="var(--severity-critical)" />
                  </div>
                  <h3 style={{ fontFamily:'var(--font-display)', fontWeight:600,
                               fontSize:'0.95rem', color:'var(--navy)' }}>
                    Interaction Analysis
                  </h3>
                  {interactions.length > 0 && (
                    <span style={{ background:'var(--severity-critical-bg)',
                                   color:'var(--severity-critical)',
                                   borderRadius:100, padding:'2px 8px',
                                   fontSize:'0.68rem', fontWeight:700 }}>
                      {interactions.length} detected
                    </span>
                  )}
                </div>

                <div style={{ padding:'0.75rem 1.25rem',
                              display:'flex', flexDirection:'column', gap:'0.6rem' }}>

                  {interactions.length === 0 ? (
                    <motion.div
                      initial={{ opacity:0, scale:0.95 }}
                      animate={{ opacity:1, scale:1 }}
                      style={{ display:'flex', alignItems:'center', gap:'0.875rem',
                               padding:'1rem', borderRadius:12,
                               background:'var(--rx-approved-bg)',
                               border:'1px solid rgba(16,185,129,0.2)' }}>
                      <div style={{ width:40, height:40, borderRadius:'50%',
                                    background:'var(--green)', display:'flex',
                                    alignItems:'center', justifyContent:'center',
                                    flexShrink:0 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M5 12l5 5L19 7" stroke="white" strokeWidth="2.5"
                                strokeLinecap="round" strokeDasharray="60"
                                style={{ animation:'checkStroke 0.5s ease 0.2s forwards',
                                         strokeDashoffset:60 }} />
                        </svg>
                      </div>
                      <div>
                        <p style={{ fontWeight:600, fontSize:'0.875rem', color:'#065f46' }}>
                          No interactions detected
                        </p>
                        <p style={{ fontSize:'0.75rem', color:'#047857', fontWeight:300 }}>
                          All medicines are safe to dispense together
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    interactions.map((interaction, i) => {
                      const sevConfig = {
                        critical: {
                          bg:'#fff1f0', border:'rgba(239,68,68,0.2)',
                          titleColor:'#991b1b', bodyColor:'#dc2626',
                          iconBg:'#fee2e2', icon: AlertTriangle,
                        },
                        warning: {
                          bg:'#fffbeb', border:'rgba(245,158,11,0.2)',
                          titleColor:'#92400e', bodyColor:'#d97706',
                          iconBg:'#fef3c7', icon: AlertCircle,
                        },
                        info: {
                          bg:'#eff6ff', border:'rgba(59,130,246,0.2)',
                          titleColor:'#1e3a8a', bodyColor:'#2563eb',
                          iconBg:'#dbeafe', icon: Info,
                        },
                      }
                      const c = sevConfig[interaction.severity]
                      return (
                        <motion.div
                          key={interaction.id}
                          initial={{ opacity:0, y:12 }}
                          animate={{ opacity:1, y:0 }}
                          transition={{ delay: i * 0.08 }}
                          style={{ background:c.bg, border:`1px solid ${c.border}`,
                                   borderRadius:12, padding:'0.875rem 1rem',
                                   position:'relative', overflow:'hidden' }}
                        >
                          <div style={{ position:'absolute', left:0, top:0, bottom:0,
                                        width:3, background:c.bodyColor, borderRadius:'3px 0 0 3px' }} />

                          <div style={{ display:'flex', gap:'0.625rem', marginLeft:8 }}>
                            <div style={{ width:32, height:32, borderRadius:8, background:c.iconBg,
                                          display:'flex', alignItems:'center', justifyContent:'center',
                                          flexShrink:0 }}>
                              <c.icon size={16} color={c.bodyColor} />
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ display:'flex', alignItems:'center',
                                            justifyContent:'space-between', marginBottom:4 }}>
                                <p style={{ fontSize:'0.82rem', fontWeight:700, color:c.titleColor }}>
                                  {interaction.medicines.join(' + ')}
                                </p>
                                <SeverityBadge severity={interaction.severity} size="sm" />
                              </div>
                              <p style={{ fontSize:'0.78rem', color:c.titleColor,
                                           fontWeight:400, lineHeight:1.5, marginBottom:'0.5rem' }}>
                                {interaction.description}
                              </p>
                              {interaction.recommendation && (
                                <p style={{ fontSize:'0.72rem', color:c.bodyColor,
                                             fontWeight:500, fontStyle:'italic' }}>
                                  💡 {interaction.recommendation}
                                </p>
                              )}

                              {expandedInteraction === interaction.id ? (
                                <motion.div
                                  initial={{ opacity:0, height:0 }}
                                  animate={{ opacity:1, height:'auto' }}
                                  style={{ marginTop:'0.625rem' }}>
                                  <textarea
                                    placeholder="Add notes about this interaction..."
                                    value={interaction.note || ''}
                                    onChange={e => updateInteractionNote(interaction.id, e.target.value)}
                                    style={{ width:'100%', minHeight:60,
                                             background:'rgba(255,255,255,0.7)',
                                             border:`1px solid ${c.border}`,
                                             borderRadius:8, padding:'0.5rem 0.75rem',
                                             fontFamily:'var(--font-body)', fontSize:'0.78rem',
                                             color:c.titleColor, outline:'none', resize:'none' }}
                                  />
                                </motion.div>
                              ) : (
                                <motion.button
                                  whileHover={{ color:c.bodyColor }}
                                  onClick={() => setExpandedInteraction(interaction.id)}
                                  style={{ marginTop:6, background:'none', border:'none',
                                           padding:0, fontSize:'0.7rem', cursor:'pointer',
                                           color:c.titleColor, opacity:0.6,
                                           fontFamily:'var(--font-body)',
                                           display:'flex', alignItems:'center', gap:4 }}>
                                  <MessageSquare size={11} /> Add note
                                </motion.button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )
                    })
                  )}

                  {isCheckingInteractions && (
                    <div style={{ padding:'1.5rem', textAlign:'center' }}>
                      <motion.div
                        animate={{ rotate:360 }}
                        transition={{ duration:1, repeat:Infinity, ease:'linear' }}
                        style={{ width:24, height:24, border:'2px solid var(--blue-light)',
                                 borderTopColor:'var(--blue)', borderRadius:'50%',
                                 margin:'0 auto 0.75rem' }}
                      />
                      <p style={{ fontSize:'0.78rem', color:'var(--gray-400)', fontWeight:300 }}>
                        Checking interactions...
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div ref={noteRef} style={{ background:'white', border:'1px solid var(--dash-border)',
                            borderRadius:'var(--dash-radius)', padding:'1.25rem',
                            boxShadow:'var(--dash-shadow)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.875rem' }}>
                  <div style={{ width:28, height:28, borderRadius:8,
                                background:'var(--purple-light)',
                                display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <MessageSquarePlus size={14} color="var(--purple)" />
                  </div>
                  <h3 style={{ fontFamily:'var(--font-display)', fontWeight:600,
                               fontSize:'0.95rem', color:'var(--navy)' }}>
                    Pharmacist Note
                  </h3>
                  {reviewNote && (
                    <span style={{ fontSize:'0.68rem', color:'var(--gray-400)', marginLeft:'auto' }}>
                      {reviewNote.length}/500
                    </span>
                  )}
                </div>
                <RichTextNote
                  value={reviewNote}
                  onChange={setReviewNote}
                  placeholder="Add observations, dosage adjustments, patient counseling notes..."
                  label=""
                  required={actionRequiresNote}
                  error={noteError}
                  maxLength={500}
                />
              </div>

              <motion.div
                animate={controls}
                style={{ background:'var(--dash-card-dark)',
                         borderRadius:'var(--dash-radius)',
                         padding:'1.25rem', boxShadow:'var(--dash-shadow)' }}>
                <p style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.4)',
                            fontWeight:300, marginBottom:'0.875rem',
                            textTransform:'uppercase', letterSpacing:'0.06em' }}>
                  Review Decision
                </p>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0.6rem' }}>
                  <motion.button
                    whileHover={{ y:-3, boxShadow:'0 12px 32px rgba(16,185,129,0.3)' }}
                    whileTap={{ scale:0.97 }}
                    onClick={handleApprove}
                    disabled={isSubmitting}
                    style={{ padding:'0.75rem', borderRadius:12, border:'none',
                             background:'var(--green)', color:'white', cursor:'pointer',
                             fontFamily:'var(--font-body)', fontWeight:600, fontSize:'0.875rem',
                             display:'flex', flexDirection:'column', alignItems:'center',
                             gap:6, transition:'all 0.2s', position:'relative', overflow:'hidden' }}>
                    <CheckCircle size={20} />
                    Approve
                    <span style={{ fontSize:'0.65rem', fontWeight:300, opacity:0.8 }}>
                      Safe to dispense
                    </span>
                  </motion.button>

                  <motion.button
                    whileHover={{ y:-3, boxShadow:'0 12px 32px rgba(249,115,22,0.3)' }}
                    whileTap={{ scale:0.97 }}
                    onClick={handleFlag}
                    disabled={isSubmitting}
                    style={{ padding:'0.75rem', borderRadius:12, border:'none',
                             background:'var(--rx-flagged)', color:'white', cursor:'pointer',
                             fontFamily:'var(--font-body)', fontWeight:600, fontSize:'0.875rem',
                             display:'flex', flexDirection:'column', alignItems:'center',
                             gap:6, transition:'all 0.2s' }}>
                    <Flag size={20} />
                    Flag
                    <span style={{ fontSize:'0.65rem', fontWeight:300, opacity:0.8 }}>
                      Needs attention
                    </span>
                  </motion.button>

                  <motion.button
                    whileHover={{ y:-3, boxShadow:'0 12px 32px rgba(239,68,68,0.3)' }}
                    whileTap={{ scale:0.97 }}
                    onClick={handleReject}
                    disabled={isSubmitting}
                    style={{ padding:'0.75rem', borderRadius:12, border:'none',
                             background:'var(--red)', color:'white', cursor:'pointer',
                             fontFamily:'var(--font-body)', fontWeight:600, fontSize:'0.875rem',
                             display:'flex', flexDirection:'column', alignItems:'center',
                             gap:6, transition:'all 0.2s' }}>
                    <XCircle size={20} />
                    Reject
                    <span style={{ fontSize:'0.65rem', fontWeight:300, opacity:0.8 }}>
                      Note required
                    </span>
                  </motion.button>
                </div>

                <AnimatePresence>
                  {actionRequiresNote && !reviewNote.trim() && (
                    <motion.div
                      initial={{ opacity:0, y:8 }}
                      animate={{ opacity:1, y:0 }}
                      exit={{ opacity:0, y:-8 }}
                      style={{ marginTop:'0.75rem', padding:'0.6rem 0.875rem',
                               background:'rgba(239,68,68,0.15)',
                               border:'1px solid rgba(239,68,68,0.3)',
                               borderRadius:10, display:'flex', alignItems:'center', gap:8 }}>
                      <AlertCircle size={14} color='#fca5a5' />
                      <p style={{ fontSize:'0.75rem', color:'#fca5a5', fontWeight:400 }}>
                        A pharmacist note is required before rejecting
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <p style={{ textAlign:'center', marginTop:'0.75rem',
                            fontSize:'0.65rem', color:'rgba(255,255,255,0.25)' }}>
                  Shortcuts: A to Approve · F to Flag · R to Reject
                </p>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ opacity:0 }}
            animate={{ opacity:1 }}
            exit={{ opacity:0 }}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
                     backdropFilter:'blur(4px)', zIndex:200,
                     display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={() => setShowUpload(false)}
          >
            <motion.div
              initial={{ scale:0.92, opacity:0 }}
              animate={{ scale:1, opacity:1 }}
              exit={{ scale:0.92, opacity:0 }}
              transition={{ type:'spring', stiffness:400, damping:30 }}
              onClick={e => e.stopPropagation()}
              style={{ background:'white', borderRadius:'var(--dash-radius)',
                       padding:'2.5rem', maxWidth:480, width:'90%',
                       boxShadow:'0 32px 80px rgba(0,0,0,0.2)' }}
            >
              <motion.div
                animate={isDragOver
                  ? { borderColor:'var(--blue)', background:'var(--blue-light)' }
                  : { borderColor:'var(--dash-border)', background:'var(--dash-bg)' }}
                onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{ border:'2px dashed', borderRadius:16, padding:'2.5rem',
                         textAlign:'center', cursor:'pointer', transition:'all 0.2s' }}
              >
                <motion.div
                  animate={isDragOver ? { scale:1.1, y:-4 } : { scale:1, y:0 }}
                  style={{ marginBottom:'1rem', display:'flex', justifyContent:'center' }}>
                  <Upload size={40} color={isDragOver ? 'var(--blue)' : 'var(--gray-400)'}
                          strokeWidth={1.5} />
                </motion.div>
                <p style={{ fontFamily:'var(--font-display)', fontWeight:700,
                            color: isDragOver ? 'var(--blue)' : 'var(--navy)',
                            marginBottom:'0.4rem' }}>
                  {isDragOver ? 'Drop to upload' : 'Upload prescription image'}
                </p>
                <p style={{ fontSize:'0.78rem', color:'var(--gray-400)', fontWeight:300 }}>
                  PNG, JPG, PDF · Max 10MB · Drag & drop or click to browse
                </p>
                <input ref={fileInputRef} type="file"
                       accept="image/*,.pdf" onChange={handleFileSelect}
                       style={{ display:'none' }} />
              </motion.div>

              <div style={{ marginTop:'1.25rem' }}>
                <label style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--gray-800)',
                                display:'block', marginBottom:'0.35rem' }}>
                  Patient Name
                </label>
                <input
                  value={uploadPatientName}
                  onChange={e => setUploadPatientName(e.target.value)}
                  placeholder="Enter patient name"
                  className="auth-input"
                />
              </div>

              <div style={{ display:'flex', gap:'0.75rem', marginTop:'1.25rem' }}>
                <motion.button whileHover={{y:-2}} whileTap={{scale:0.97}}
                  onClick={() => setShowUpload(false)}
                  style={{ flex:1, padding:'0.7rem', borderRadius:100,
                           border:'1px solid var(--dash-border)', background:'white',
                           cursor:'pointer', fontFamily:'var(--font-body)',
                           fontSize:'0.875rem', color:'var(--gray-600)' }}>
                  Cancel
                </motion.button>
                <motion.button whileHover={{y:-2, boxShadow:'var(--dash-shadow-hover)'}}
                  whileTap={{scale:0.97}}
                  onClick={handleUploadSubmit}
                  disabled={!uploadFile || !uploadPatientName}
                  style={{ flex:2, padding:'0.7rem', borderRadius:100,
                           border:'none', background:'var(--navy)', color:'white',
                           cursor:'pointer', fontFamily:'var(--font-body)',
                           fontSize:'0.875rem', fontWeight:500,
                           opacity: (!uploadFile || !uploadPatientName) ? 0.5 : 1 }}>
                  Upload & Analyze
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {actionResult && (
          <motion.div
            initial={{ opacity:0, scale:0.8 }}
            animate={{ opacity:1, scale:1 }}
            exit={{ opacity:0, scale:1.1 }}
            style={{ position:'fixed', top:'50%', left:'50%',
                     transform:'translate(-50%,-50%)', zIndex:300,
                     background:'white', borderRadius:20, padding:'2rem 3rem',
                     textAlign:'center', boxShadow:'0 32px 80px rgba(0,0,0,0.2)',
                     pointerEvents:'none' }}
          >
            {actionResult === 'approved' && (
              <>
                <div style={{ width:56, height:56, borderRadius:'50%',
                              background:'var(--rx-approved-bg)',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              margin:'0 auto 1rem' }}>
                  <CheckCircle size={28} color="var(--green)" />
                </div>
                <p style={{ fontFamily:'var(--font-display)', fontWeight:700,
                            color:'var(--green)' }}>Approved!</p>
              </>
            )}
            {actionResult === 'flagged' && (
              <>
                <div style={{ width:56, height:56, borderRadius:'50%',
                              background:'var(--rx-flagged-bg)',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              margin:'0 auto 1rem' }}>
                  <Flag size={28} color="var(--rx-flagged)" />
                </div>
                <p style={{ fontFamily:'var(--font-display)', fontWeight:700,
                            color:'var(--rx-flagged)' }}>Flagged!</p>
              </>
            )}
            {actionResult === 'rejected' && (
              <>
                <div style={{ width:56, height:56, borderRadius:'50%',
                              background:'var(--rx-rejected-bg)',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              margin:'0 auto 1rem' }}>
                  <XCircle size={28} color="var(--red)" />
                </div>
                <p style={{ fontFamily:'var(--font-display)', fontWeight:700,
                            color:'var(--red)' }}>Rejected</p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
