const delay = (payload, timeout = 150) =>
  new Promise((resolve) => {
    setTimeout(() => resolve(payload), timeout);
  });

export const categories = [
  { slug: 'pain-relief', name: 'Pain Relief', icon: 'Pill', description: 'Fever, headache, body ache and recovery support.' },
  { slug: 'vitamins', name: 'Vitamins', icon: 'Sparkles', description: 'Daily wellness, immunity and nutrition essentials.' },
  { slug: 'digestive-care', name: 'Digestive Care', icon: 'ShieldPlus', description: 'Acidity, probiotics and gut health support.' },
  { slug: 'allergy-relief', name: 'Allergy Relief', icon: 'Wind', description: 'Sneezing, skin irritation and seasonal relief.' },
  { slug: 'personal-care', name: 'Personal Care', icon: 'HeartPulse', description: 'Daily hygiene, grooming and intimate care.' },
  { slug: 'baby-care', name: 'Baby Care', icon: 'Baby', description: 'Gentle essentials for infants and growing kids.' },
];

export const trustHighlights = [
  {
    title: 'Live Catalogue',
    detail: 'Browse products from the current pharmacy catalogue.',
    icon: 'BadgeCheck',
  },
  {
    title: 'DDI-Aware Checkout',
    detail: 'Cart medicines pass through the governed interaction workflow.',
    icon: 'ShieldCheck',
  },
  {
    title: 'Prescription OCR',
    detail: 'Upload prescription images and review OCR results before confirmation.',
    icon: 'Microscope',
  },
  {
    title: 'Pharmacist Support',
    detail: 'Cases that require review can enter the pharmacist workflow.',
    icon: 'Stethoscope',
  },
];

export const services = [
  {
    title: 'Prescription OCR',
    blurb: 'Upload a prescription image, review extracted medicine evidence, and confirm the result.',
    icon: 'Microscope',
    href: '/prescription/upload',
  },
  {
    title: 'Refill Reminders',
    blurb: 'Review refill reminders associated with your recorded medicine and order history.',
    icon: 'BellRing',
    href: '/refills',
  },
  {
    title: 'Pharmacist Review',
    blurb: 'Request pharmacist guidance when the governed workflow requires additional review.',
    icon: 'Stethoscope',
    href: '/consult/pharmacist',
  },
  {
    title: 'Order Tracking',
    blurb: 'Review your recorded pharmacy orders and their current application status.',
    icon: 'ShieldCheck',
    href: '/orders',
  },
];

export const trustBadges = [
  'Catalogue-backed products',
  'DDI-aware checkout',
  'Prescription OCR review',
  'Pharmacist review workflow',
];

export const shoppingSteps = [
  {
    title: 'Browse the catalogue',
    detail: 'Explore medicines and product information from the current pharmacy catalogue.',
    eyebrow: 'Step 01',
  },
  {
    title: 'Review your selection',
    detail: 'Check product details, prescription requirements, and selected cart items.',
    eyebrow: 'Step 02',
  },
  {
    title: 'Complete governed checkout',
    detail: 'Checkout preserves drug-interaction checks and pharmacist review when required.',
    eyebrow: 'Step 03',
  },
];

export const curatedCollections = [
  {
    title: 'Browse medicines',
    description: 'Search the current pharmacy catalogue and review available product information.',
    href: '/search',
    cta: 'Open catalogue',
    stats: 'Catalogue',
  },
  {
    title: 'Upload a prescription',
    description: 'Run the prescription OCR workflow and review extracted evidence before confirming it.',
    href: '/prescription/upload',
    cta: 'Upload prescription',
    stats: 'OCR',
  },
  {
    title: 'Review refill reminders',
    description: 'Open the refill workflow and review reminders associated with your medicine history.',
    href: '/refills',
    cta: 'View refills',
    stats: 'Reminders',
  },
];

export const blogPosts = [
  {
    slug: 'prescription-ocr-review',
    category: 'Prescription Workflow',
    title: 'Review OCR evidence before confirming a prescription',
    excerpt: 'OCR output remains subject to review before downstream use.',
    readTime: 'Review workflow',
    publishedAt: 'Prescription guidance',
  },
  {
    slug: 'ddi-checkout-review',
    category: 'DDI Workflow',
    title: 'What happens when a cart needs interaction review',
    excerpt: 'The checkout workflow preserves governed drug-interaction checks and escalation when required.',
    readTime: 'Safety workflow',
    publishedAt: 'Checkout guidance',
  },
  {
    slug: 'refill-reminders',
    category: 'Refill Workflow',
    title: 'Review refill reminders from your medicine history',
    excerpt: 'Refill reminders surface recorded medicines that may require attention without altering prescriptions.',
    readTime: 'Reminder workflow',
    publishedAt: 'Account guidance',
  },
];

export const mockProducts = [
  {
    id: 1,
    slug: 'paracetamol-500mg-tablets',
    name: 'Paracetamol 500mg Tablets',
    subtitle: 'Strip of 15 tablets',
    category: 'Pain Relief',
    categorySlug: 'pain-relief',
    price: 180,
    oldPrice: 240,
    discountPercent: 25,
    requiresPrescription: false,
    inStock: true,
    stockLabel: 'Ready to ship',
    badge: '25% OFF',
    imageLabel: 'PARA',
    description: 'Fast relief for fever, headache and daily aches with pharmacist-backed quality assurance.',
    usage: 'Take one tablet every 4 to 6 hours as needed after meals unless your healthcare provider advises otherwise.',
    sideEffects: 'May cause mild nausea or stomach discomfort in sensitive patients.',
    interactions: 'Avoid combining with other acetaminophen products or alcohol-based therapies.',
    strengths: ['500mg', '650mg'],
    tags: ['Best Seller', 'Fast Moving'],
    warningLevel: 'moderate',
    alternatives: [2, 5],
  },
  {
    id: 2,
    slug: 'ibuprofen-400mg-tablets',
    name: 'Ibuprofen 400mg Tablets',
    subtitle: 'Strip of 10 tablets',
    category: 'Pain Relief',
    categorySlug: 'pain-relief',
    price: 290,
    oldPrice: 350,
    discountPercent: 17,
    requiresPrescription: false,
    inStock: true,
    stockLabel: 'Limited stock',
    badge: 'Save 17%',
    imageLabel: 'IBU',
    description: 'Trusted anti-inflammatory support for headaches, cramps and joint discomfort.',
    usage: 'Use only after meals and do not exceed the recommended dose.',
    sideEffects: 'Can irritate the stomach in some patients.',
    interactions: 'Talk to a pharmacist before combining with blood thinners or ulcer medication.',
    strengths: ['200mg', '400mg'],
    tags: ['Weekend Deal'],
    warningLevel: 'high',
    alternatives: [1, 5],
  },
  {
    id: 3,
    slug: 'vitamin-d3-1000iu-softgels',
    name: 'Vitamin D3 1000IU Softgels',
    subtitle: 'Bottle of 60 softgels',
    category: 'Vitamins',
    categorySlug: 'vitamins',
    price: 890,
    oldPrice: 1090,
    discountPercent: 18,
    requiresPrescription: false,
    inStock: true,
    stockLabel: 'Best for immunity',
    badge: '18% OFF',
    imageLabel: 'D3',
    description: 'Daily vitamin D support for immunity, bone health and low-energy days.',
    usage: 'Take one softgel daily with food.',
    sideEffects: 'Generally well tolerated when taken as directed.',
    interactions: 'Check with your pharmacist if you use calcium or thyroid supplements.',
    strengths: ['1000IU', '2000IU'],
    tags: ['Wellness Pick'],
    warningLevel: 'low',
    alternatives: [4, 6],
  },
  {
    id: 4,
    slug: 'multivitamin-complete-capsules',
    name: 'Multivitamin Complete Capsules',
    subtitle: 'Bottle of 30 capsules',
    category: 'Vitamins',
    categorySlug: 'vitamins',
    price: 1250,
    oldPrice: 1480,
    discountPercent: 15,
    requiresPrescription: false,
    inStock: true,
    stockLabel: 'Recommended',
    badge: 'Hot Deal',
    imageLabel: 'MV',
    description: 'Broad-spectrum daily nutrients for active adults and immunity support.',
    usage: 'One capsule after breakfast.',
    sideEffects: 'May cause mild nausea if taken on an empty stomach.',
    interactions: 'Avoid stacking with other iron-heavy supplements without advice.',
    strengths: ['30 Capsules'],
    tags: ['Top Rated'],
    warningLevel: 'low',
    alternatives: [3],
  },
  {
    id: 5,
    slug: 'cetirizine-10mg-tablets',
    name: 'Cetirizine 10mg Tablets',
    subtitle: 'Strip of 10 tablets',
    category: 'Allergy Relief',
    categorySlug: 'allergy-relief',
    price: 320,
    oldPrice: 420,
    discountPercent: 24,
    requiresPrescription: false,
    inStock: true,
    stockLabel: 'Night delivery available',
    badge: '24% OFF',
    imageLabel: 'CTZ',
    description: 'Daily allergy relief for sneezing, itchy eyes and seasonal triggers.',
    usage: 'Take one tablet once daily, preferably at night.',
    sideEffects: 'May cause drowsiness in some users.',
    interactions: 'Use caution with sedative medicines and antihistamines.',
    strengths: ['10mg'],
    tags: ['Popular'],
    warningLevel: 'moderate',
    alternatives: [2],
  },
  {
    id: 6,
    slug: 'probiotic-digestive-support-capsules',
    name: 'Probiotic Digestive Support Capsules',
    subtitle: 'Box of 20 capsules',
    category: 'Digestive Care',
    categorySlug: 'digestive-care',
    price: 690,
    oldPrice: 820,
    discountPercent: 16,
    requiresPrescription: false,
    inStock: false,
    stockLabel: 'Back in 2 days',
    badge: '16% OFF',
    imageLabel: 'PRO',
    description: 'Gut-friendly probiotic blend for bloating, recovery and digestive balance.',
    usage: 'One capsule after lunch for 20 days.',
    sideEffects: 'Temporary bloating may occur during the first few doses.',
    interactions: 'Keep a gap from antibiotic doses unless advised otherwise.',
    strengths: ['20 Capsules'],
    tags: ['Restock Soon'],
    warningLevel: 'low',
    alternatives: [3],
  },
  {
    id: 7,
    slug: 'amoxicillin-500mg-capsules',
    name: 'Amoxicillin 500mg Capsules',
    subtitle: 'Strip of 12 capsules',
    category: 'Pain Relief',
    categorySlug: 'pain-relief',
    price: 460,
    oldPrice: 520,
    discountPercent: 12,
    requiresPrescription: true,
    inStock: true,
    stockLabel: 'Prescription needed',
    badge: 'Rx Required',
    imageLabel: 'AMX',
    description: 'Prescription antibiotic supply handled only after pharmacist verification.',
    usage: 'Use strictly as prescribed by a licensed clinician.',
    sideEffects: 'Can cause stomach upset or allergic reactions in sensitive patients.',
    interactions: 'Do not self-medicate; dosage and interactions require review.',
    strengths: ['500mg'],
    tags: ['Verified RX'],
    warningLevel: 'high',
    alternatives: [1],
  },
  {
    id: 8,
    slug: 'baby-gentle-rash-cream',
    name: 'Baby Gentle Rash Cream',
    subtitle: '50g tube',
    category: 'Baby Care',
    categorySlug: 'baby-care',
    price: 540,
    oldPrice: 650,
    discountPercent: 17,
    requiresPrescription: false,
    inStock: true,
    stockLabel: 'Gentle formula',
    badge: '17% OFF',
    imageLabel: 'BABY',
    description: 'Soothing zinc-based care for diaper rash and irritated baby skin.',
    usage: 'Apply a thin layer to clean, dry skin during each diaper change.',
    sideEffects: 'No major side effects expected when used externally.',
    interactions: 'External use only.',
    strengths: ['50g'],
    tags: ['Parent Pick'],
    warningLevel: 'low',
    alternatives: [4],
  },
];

export const heroStats = [
  { label: 'Catalogue', value: 'Live' },
  { label: 'Cart safety', value: 'DDI' },
  { label: 'Prescription review', value: 'OCR' },
];

export const refillAlerts = [
  {
    id: 'REF-1001',
    medicine: 'Paracetamol 500mg Tablets',
    dueDate: '2026-08-06',
    remaining: '2 days left',
    status: 'Due soon',
    notificationType: 'initial',
    notificationMessage: 'Reminder sent today: refill due in 2 days.',
  },
  {
    id: 'REF-1002',
    medicine: 'Cetirizine 10mg Tablets',
    dueDate: '2026-08-02',
    remaining: '2 days overdue',
    status: 'Follow-up sent',
    notificationType: 'follow-up',
    notificationMessage: 'Follow-up reminder: this refill is overdue. Reorder or snooze the alert.',
  },
];

export const mockOrders = [
  {
    id: 'ORD-22091',
    date: '2026-08-03',
    status: 'Delivered',
    eta: 'Delivered on Aug 3',
    total: 1410,
    items: ['Paracetamol 500mg Tablets', 'Vitamin D3 1000IU Softgels'],
    timeline: ['Order placed', 'Pharmacist review completed', 'Packed', 'Out for delivery', 'Delivered'],
  },
  {
    id: 'ORD-22074',
    date: '2026-07-28',
    status: 'In Transit',
    eta: 'Arriving today by 9 PM',
    total: 980,
    items: ['Cetirizine 10mg Tablets', 'Probiotic Digestive Support Capsules'],
    timeline: ['Order placed', 'Packed', 'Dispatched', 'Out for delivery'],
  },
];

export const prescriptionHistory = [
  {
    id: 'RX-901',
    uploadedAt: '2026-08-02',
    status: 'Verified',
    // doctor field removed
    notes: 'Verification completed. Quantity adjusted for 5-day course.',
  },
  {
    id: 'RX-884',
    uploadedAt: '2026-07-24',
    status: 'Needs Edit',
    // doctor field removed
    notes: 'One line item had low OCR confidence and was corrected manually.',
  },
];

export const ocrRows = [
  { id: 1, medicine: 'Amoxicillin 500mg', dosage: '1 capsule', frequency: '3 times daily', duration: '5 days', confidence: 0.94 },
  { id: 2, medicine: 'Paracetamol 500mg', dosage: '1 tablet', frequency: 'SOS for fever', duration: '3 days', confidence: 0.88 },
  { id: 3, medicine: 'Cetzirine 10mg', dosage: '1 tablet', frequency: 'Night', duration: '7 days', confidence: 0.56 },
];

export const accountSections = [
  {
    title: 'Profile',
    entries: ['Areeba Khan', 'areeba@example.com', '+92 300 123 8899'],
  },
  {
    title: 'Addresses',
    entries: ['Home: 44-G Gulberg III, Lahore', 'Office: MM Alam Road, Lahore'],
  },
  {
    title: 'Security',
    entries: ['Password updated 12 days ago', '2-step verification available'],
  },
  {
    title: 'Notifications',
    entries: ['Refill reminders enabled', 'Prescription review alerts enabled'],
  },
];

export const chatQuickReplies = [
  'Do I need a prescription?',
  'When will my order arrive?',
  'Suggest an alternative',
];

export const interactionWarnings = [
  {
    title: 'Possible duplicate pain relief ingredients',
    severity: 'moderate',
    detail: 'Paracetamol and a combination cold medicine both include acetaminophen. A pharmacist review is recommended before checkout.',
  },
  {
    title: 'Drowsiness risk with allergy medication',
    severity: 'high',
    detail: 'Cetirizine may increase drowsiness when taken with other sedating medicines.',
  },
];

export const pharmacistConsultStatus = {
  id: 'CONSULT-4102',
  createdAt: '2026-08-08T10:15:00+05:00',
  status: 'Awaiting pharmacist',
  fallback: true,
  summary: 'Your escalation was received for a possible drowsiness interaction, but no pharmacist is currently available.',
  guidance:
    'Treat the automated interaction warning as the safe default for now and check back shortly for pharmacist guidance.',
  timeline: [
    { label: 'Escalation received', detail: 'Your medicine safety query was logged on August 8, 2026.', state: 'done' },
    { label: 'Availability check', detail: 'No pharmacist accepted the case within the callback window.', state: 'warning' },
    { label: 'Next update', detail: 'We will keep the query open and surface any pharmacist response here.', state: 'idle' },
  ],
};

export const storefrontNotifications = [
  {
    id: 'NOTIF-1001',
    type: 'refill_followup',
    title: 'Follow-up refill reminder',
    message: 'Cetirizine 10mg Tablets are overdue. Reorder or snooze this alert.',
    href: '/refills',
    severity: 'high',
    date: '2026-08-08',
  },
  {
    id: 'NOTIF-1002',
    type: 'order_update',
    title: 'Order in transit',
    message: 'Order ORD-22074 is out for delivery today.',
    href: '/orders',
    severity: 'medium',
    date: '2026-08-08',
  },
  {
    id: 'NOTIF-1003',
    type: 'pharmacist_reply',
    title: 'Pharmacist consult pending',
    message: 'Your escalation was received, but no pharmacist is currently available.',
    href: '/consult/pharmacist',
    severity: 'medium',
    date: '2026-08-08',
  },
  {
    id: 'NOTIF-1004',
    type: 'prescription',
    title: 'Prescription verified',
    message: 'RX-901 was verified and updated for a 5-day course.',
    href: '/prescription/history',
    severity: 'low',
    date: '2026-08-02',
  },
];

export function getAllProducts() {
  return delay(mockProducts);
}

export function getFeaturedProducts() {
  return delay(mockProducts.slice(0, 6));
}

export function getTopDeals() {
  return delay([...mockProducts].sort((a, b) => b.discountPercent - a.discountPercent).slice(0, 6));
}

export function getProductBySlug(slug) {
  return delay(mockProducts.find((product) => product.slug === slug) || null);
}

export function getAlternatives(productId) {
  const product = mockProducts.find((entry) => entry.id === productId);
  const alternatives = product
    ? mockProducts.filter((entry) => product.alternatives.includes(entry.id))
    : [];
  return delay(alternatives);
}

export function searchProducts({ categorySlug = 'all', query = '', sort = 'featured' } = {}) {
  let items = [...mockProducts];

  if (categorySlug !== 'all') {
    items = items.filter((item) => item.categorySlug === categorySlug);
  }

  if (query.trim()) {
    const normalized = query.toLowerCase();
    items = items.filter((item) =>
      [item.name, item.category, item.subtitle, item.description].join(' ').toLowerCase().includes(normalized),
    );
  }

  const sorters = {
    featured: (a, b) => a.id - b.id,
    discount: (a, b) => b.discountPercent - a.discountPercent,
    priceLow: (a, b) => a.price - b.price,
    priceHigh: (a, b) => b.price - a.price,
  };

  items.sort(sorters[sort] || sorters.featured);

  return delay(items);
}
