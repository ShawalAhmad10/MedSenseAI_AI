import React, { useRef } from 'react'
import { motion } from 'framer-motion'
import { Bold, Italic, List, AlertCircle } from 'lucide-react'

export default function RichTextNote({ value = '', onChange, placeholder, label, required, error, maxLength = 500 }) {
  const textareaRef = useRef(null)

  const applyFormat = (action) => {
    if (!textareaRef.current) return
    
    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = value.substring(start, end)
    
    let replacement = ''
    if (action === 'bold') {
      replacement = `**${selectedText}**`
    } else if (action === 'italic') {
      replacement = `_${selectedText}_`
    } else if (action === 'bullet') {
      replacement = `\n• ${selectedText}`
    }
    
    const newValue = value.substring(0, start) + replacement + value.substring(end)
    onChange(newValue)
    
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + replacement.length, start + replacement.length)
    }, 0)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {label && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--gray-800)' }}>
            {label} {required && <span style={{ color: 'var(--red)' }}>*</span>}
          </label>
          <span style={{ fontSize: '0.68rem', color: 'var(--gray-400)' }}>
            {value.length}/{maxLength}
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 4, padding: '0.35rem 0.5rem',
                    background: 'var(--dash-bg)', borderRadius: '8px 8px 0 0',
                    borderBottom: '1px solid var(--dash-border)' }}>
        {[
          { icon: Bold,   action: 'bold',   title: 'Bold (Ctrl+B)' },
          { icon: Italic, action: 'italic', title: 'Italic (Ctrl+I)' },
          { icon: List,   action: 'bullet', title: 'Bullet list' },
        ].map(tool => (
          <motion.button key={tool.action}
            whileHover={{ color: 'var(--blue)', background: 'var(--blue-light)' }}
            whileTap={{ scale: 0.92 }}
            onClick={(e) => { e.preventDefault(); applyFormat(tool.action); }}
            title={tool.title}
            style={{ width: 26, height: 26, borderRadius: 6, border: 'none',
                     background: 'transparent', cursor: 'pointer', display: 'flex',
                     alignItems: 'center', justifyContent: 'center',
                     color: 'var(--gray-400)', transition: 'all 0.15s' }}>
            <tool.icon size={13} />
          </motion.button>
        ))}
        {(!label) && (
          <span style={{ fontSize: '0.68rem', color: 'var(--gray-400)', marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            {value.length}/{maxLength}
          </span>
        )}
      </div>

      <textarea
        ref={textareaRef}
        className="rx-note-textarea"
        style={{ borderRadius: '0 0 8px 8px', marginTop: 0 }}
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
      />

      {error && (
        <p style={{ fontSize: '0.72rem', color: 'var(--red)',
                    display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertCircle size={12} /> {error}
        </p>
      )}
    </div>
  )
}
