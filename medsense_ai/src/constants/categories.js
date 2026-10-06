// Pharmacy categories supplied for the current medicine catalogue.
export const MEDICINE_CATEGORIES = [
  'Analgesic / Antipyretic',
  'Analgesic',
  'NSAID / Painkiller',
  'Cold & Flu',
  'Antibiotic',
  'Antibiotic / Antiprotozoal',
  'Gastrointestinal',
  'Antiemetic',
  'Antispasmodic',
  'Antihistamine',
  'Respiratory',
  'Cough / Respiratory',
  'Cough Suppressant',
  'Cardiovascular',
  'Cardiovascular / Lipid Lowering',
  'Antihypertensive',
  'Lipid Lowering',
  'Antidiabetic',
  'Multivitamin',
  'Vitamins',
  'Calcium / Supplement',
  'Supplement',
  'Iron Supplement',
  'Calcium / Vitamin D',
  'Joint Supplement',
  'Antimalarial',
  'Herbal Supplement',
  'Personal Care',
  'Neurological',
  'Antipsychotic',
  'Antidepressant',
  'Neuropathic Pain',
  'Respiratory / Antiallergic',
  'Throat / Cough Relief',
  'Other',
];

export const CATEGORY_OPTIONS = MEDICINE_CATEGORIES.map(category => ({
  value: category,
  label: category,
}));

export const CATEGORY_DESCRIPTIONS = {};

export const isValidCategory = category => MEDICINE_CATEGORIES.includes(category);

export const getCategoryDescription = category => CATEGORY_DESCRIPTIONS[category] || '';

// A slash or ampersand in a category name must not become part of a route path.
export const getCategorySlug = category => String(category || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');
