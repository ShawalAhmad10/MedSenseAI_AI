import React from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ currentPage, totalPages, onPageChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.95 }}
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        style={{
          padding: '0.3rem', borderRadius: 6, border: '1px solid var(--dash-border)',
          background: 'white', color: 'var(--gray-600)', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
          opacity: currentPage <= 1 ? 0.5 : 1
        }}
      >
        <ChevronLeft size={16} />
      </motion.button>
      
      <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-body)', color: 'var(--navy)' }}>
        Page {currentPage} of {totalPages}
      </span>
      
      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.95 }}
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        style={{
          padding: '0.3rem', borderRadius: 6, border: '1px solid var(--dash-border)',
          background: 'white', color: 'var(--gray-600)', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
          opacity: currentPage >= totalPages ? 0.5 : 1
        }}
      >
        <ChevronRight size={16} />
      </motion.button>
    </div>
  )
}
