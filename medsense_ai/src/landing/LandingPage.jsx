import React from 'react'
import './landing.css'
import { useCursorTrail } from './hooks/useCursorTrail'
import Navbar from './Navbar'
import HeroSection from './HeroSection'
import FeaturesSection from './FeaturesSection'
import HowItWorks from './HowItWorks'
import PricingSection from './PricingSection'
import Testimonials from './Testimonials'
import CtaSection from './CtaSection'
import Footer from './Footer'

function LandingPage() {
  useCursorTrail()

  return (
    <div style={{ overflowX: 'hidden' }}>
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorks />
      <PricingSection />
      <Testimonials />
      <CtaSection />
      <Footer />
    </div>
  )
}

export default LandingPage
