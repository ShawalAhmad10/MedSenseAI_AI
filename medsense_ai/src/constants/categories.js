/**
 * Medicine Categories
 * 
 * Standard categories for pharmaceutical products
 * Used across the application for consistency
 */

export const MEDICINE_CATEGORIES = [
  'Analgesics',
  'Antibiotics',
  'Antidiabetics',
  'Cardiovascular',
  'Antihistamines',
  'Vitamins and Supplements',
  'Topical',
  'Gastrointestinal',
  'Respiratory',
  'Dermatological',
  'Antifungals',
  'Antivirals',
  'Ophthalmic',
  'Neurological',
  'Hormonal',
  'Antacids',
  'Antiemetics',
  'Antiseptics',
  'Antiparasitics',
  'Antimalarials',
  'Anticonvulsants',
  'Antidepressants',
  'Antipsychotics',
  'Anxiolytics',
  'Sedatives',
  'Diuretics',
  'Laxatives',
  'Immunosuppressants',
  'Vaccines',
  'Hormonal Contraceptives',
  'Musculoskeletal',
  'Urological',
  'Dental',
  'Ear, Nose and Throat (ENT)',
  'Eye Care',
  'Other'
];

// For dropdown/select components
export const CATEGORY_OPTIONS = MEDICINE_CATEGORIES.map(cat => ({
  value: cat,
  label: cat
}));

// Category descriptions (optional - for tooltips/help text)
export const CATEGORY_DESCRIPTIONS = {
  'Analgesics': 'Pain relief medications',
  'Antibiotics': 'Bacterial infection treatment',
  'Antidiabetics': 'Diabetes management',
  'Cardiovascular': 'Heart and blood vessel health',
  'Antihistamines': 'Allergy relief',
  'Vitamins and Supplements': 'Nutritional supplements and vitamins',
  'Topical': 'External application medications',
  'Gastrointestinal': 'Digestive system medications',
  'Respiratory': 'Breathing and lung medications',
  'Dermatological': 'Skin condition treatments',
  'Antifungals': 'Fungal infection treatment',
  'Antivirals': 'Viral infection treatment',
  'Ophthalmic': 'Eye care medications',
  'Neurological': 'Nervous system medications',
  'Hormonal': 'Hormone-related medications',
  'Antacids': 'Acid reflux and heartburn relief',
  'Antiemetics': 'Nausea and vomiting relief',
  'Antiseptics': 'Disinfection and wound care',
  'Antiparasitics': 'Parasitic infection treatment',
  'Antimalarials': 'Malaria prevention and treatment',
  'Anticonvulsants': 'Seizure control medications',
  'Antidepressants': 'Depression treatment',
  'Antipsychotics': 'Psychotic disorder treatment',
  'Anxiolytics': 'Anxiety relief',
  'Sedatives': 'Sleep aid and relaxation',
  'Diuretics': 'Fluid retention management',
  'Laxatives': 'Constipation relief',
  'Immunosuppressants': 'Immune system regulation',
  'Vaccines': 'Disease prevention immunizations',
  'Hormonal Contraceptives': 'Birth control medications',
  'Musculoskeletal': 'Muscle and joint medications',
  'Urological': 'Urinary system medications',
  'Dental': 'Oral and dental care',
  'Ear, Nose and Throat (ENT)': 'ENT condition treatments',
  'Eye Care': 'Vision and eye health products',
  'Other': 'Miscellaneous medical products'
};

// Validate if a category is valid
export const isValidCategory = (category) => {
  return MEDICINE_CATEGORIES.includes(category);
};

// Get category description
export const getCategoryDescription = (category) => {
  return CATEGORY_DESCRIPTIONS[category] || 'No description available';
};
