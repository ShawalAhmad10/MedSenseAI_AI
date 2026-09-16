// src/pages/dashboard/Consultations.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWindowSize } from '../../hooks/useWindowSize';
import { queueData as initialQueue } from '../../utils/consultationData';

// Sub-components
import ConsultationQueue from '../../components/consultations/ConsultationQueue';
import ConsultationChat from '../../components/consultations/ConsultationChat';
import PatientContextPanel from '../../components/consultations/PatientContextPanel';

export default function Consultations() {
  const [queue, setQueue] = useState(initialQueue);
  const [activeId, setActiveId] = useState(initialQueue[0]?.id || null);
  const [isQueueOpen, setIsQueueOpen] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(true);
  const { width } = useWindowSize();

  const isTablet = width < 1280;
  const isMobile = width < 900;

  useEffect(() => {
    if (isMobile) {
      setIsQueueOpen(false);
      setIsProfileOpen(false);
    } else if (isTablet) {
      setIsQueueOpen(true);
      setIsProfileOpen(false);
    } else {
      setIsQueueOpen(true);
      setIsProfileOpen(true);
    }
  }, [isTablet, isMobile]);

  const activePatient = queue.find(p => p.id === activeId);

  const playBeep = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn("Audio play failed", e);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const newPatient = {
        id: `p${Date.now()}`,
        name: 'Usman Ghani',
        age: 29,
        gender: 'Male',
        urgency: 'medium',
        waitStart: new Date(),
        preview: 'Hi, I received my order but one item is missing...',
        unread: true,
        source: 'Direct',
        handoff: {
          summary: 'Missing item in order',
          query: 'Hi, I received my order but one item is missing...',
          confidence: 100,
          attempted: 'Direct escalation',
        }
      };
      setQueue(prev => [newPatient, ...prev]);
      playBeep();
    }, 15000);
    return () => clearTimeout(timer);
  }, [playBeep]);

  const handleResolve = (id) => {
    setQueue(prev => prev.filter(p => p.id !== id));
    if (activeId === id) {
      setActiveId(null);
    }
  };

  const handleSelectPatient = (id) => {
    setActiveId(id);
    setQueue(prev => prev.map(p => p.id === id ? { ...p, unread: false } : p));
    if (isMobile) setIsQueueOpen(false);
  };

  return (
    <div style={{ 
      height: 'calc(100vh - 64px)', // Adjust for dashboard header
      display: 'flex', 
      background: 'white',
      overflow: 'hidden',
      position: 'relative'
    }}>
      
      {/* ZONE A: ESCALATED QUEUE (300px) */}
      <AnimatePresence mode="wait">
        {(isQueueOpen || !isMobile) && (
          <motion.div
            initial={isMobile ? { x: -300 } : { width: 0, opacity: 0 }}
            animate={isMobile ? { x: 0 } : { width: 300, opacity: 1 }}
            exit={isMobile ? { x: -300 } : { width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{ 
              height: '100%',
              background: 'white',
              borderRight: '1px solid var(--dash-border)',
              zIndex: 40,
              position: isMobile ? 'absolute' : 'relative',
              left: 0, top: 0,
              boxShadow: isMobile ? '10px 0 30px rgba(0,0,0,0.05)' : 'none',
              flexShrink: 0
            }}
          >
            <ConsultationQueue 
              queue={queue} 
              activeId={activeId} 
              onSelect={handleSelectPatient} 
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ZONE B: ACTIVE CONSULTATION (FLUID) */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        minWidth: 0,
        background: 'white',
        position: 'relative',
        zIndex: 10
      }}>
        {activePatient ? (
          <ConsultationChat 
            patient={activePatient} 
            onResolve={handleResolve}
            onToggleQueue={() => setIsQueueOpen(!isQueueOpen)}
            isTablet={isTablet || isMobile}
            isProfileOpen={isProfileOpen}
            onToggleProfile={() => setIsProfileOpen(!isProfileOpen)}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dash-bg)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'white', border: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                <span style={{ fontSize: '2rem' }}>OK</span>
              </div>
              <h2 style={{ color: 'var(--navy)', fontWeight: 700, margin: 0 }}>All Caught Up</h2>
              <p style={{ color: 'var(--gray-400)', marginTop: '0.5rem' }}>Select a patient from the queue to start</p>
              {!isQueueOpen && (
                <button 
                  onClick={() => setIsQueueOpen(true)}
                  style={{ marginTop: '1.5rem', padding: '0.75rem 1.5rem', background: 'var(--navy)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  View Queue ({queue.length})
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ZONE C: PATIENT PROFILE (300px) */}
      <AnimatePresence>
        {isProfileOpen && activePatient && (
          <motion.div
            initial={isTablet ? { x: 300 } : { width: 0, opacity: 0 }}
            animate={isTablet ? { x: 0 } : { width: 300, opacity: 1 }}
            exit={isTablet ? { x: 300 } : { width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{ 
              height: '100%',
              background: 'white',
              borderLeft: '1px solid var(--dash-border)',
              zIndex: 30,
              position: isTablet ? 'absolute' : 'relative',
              right: 0, top: 0,
              boxShadow: isTablet ? '-10px 0 30px rgba(0,0,0,0.05)' : 'none',
              flexShrink: 0
            }}
          >
            <PatientContextPanel patient={activePatient} isOpen={true} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* OVERLAYS FOR MOBILE/TABLET DRAWERS */}
      <AnimatePresence>
        {((isMobile && isQueueOpen) || (isTablet && isProfileOpen)) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (isMobile) setIsQueueOpen(false);
              if (isTablet) setIsProfileOpen(false);
            }}
            style={{ 
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.15)', 
              backdropFilter: 'blur(2px)', zIndex: 25 
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

