// src/utils/consultationData.js

export const queueData = [
  {
    id: 'p1',
    name: 'Ayesha Malik',
    age: 34,
    gender: 'Female',
    urgency: 'high',
    waitStart: new Date(Date.now() - 272000), // 4m 32s ago
    preview: 'Can I take Brufen with my blood pressure medication?',
    unread: true,
    source: 'AI Escalation',
    handoff: {
      summary: 'Patient asking about drug interaction',
      query: 'Can I take Brufen with my blood pressure medication?',
      confidence: 42,
      attempted: 'Checked drug DB · No clear answer',
    }
  },
  {
    id: 'p2',
    name: 'Zaid Ahmed',
    age: 45,
    gender: 'Male',
    urgency: 'critical',
    waitStart: new Date(Date.now() - 115000), // 1m 55s ago
    preview: 'I am having severe chest tightness after taking the new dosage.',
    unread: false,
    source: 'Direct',
    handoff: {
      summary: 'Potential adverse drug reaction (Cardiac)',
      query: 'I am having severe chest tightness after taking the new dosage.',
      confidence: 15,
      attempted: 'Escalated immediately due to keywords',
    }
  },
  {
    id: 'p3',
    name: 'Sara Khan',
    age: 22,
    gender: 'Female',
    urgency: 'medium',
    waitStart: new Date(Date.now() - 480000), // 8m 0s ago
    preview: 'I forgot to refrigerate my insulin. Is it still safe to use?',
    unread: true,
    source: 'AI Escalation',
    handoff: {
      summary: 'Storage/Stability query',
      query: 'I forgot to refrigerate my insulin. Is it still safe to use?',
      confidence: 58,
      attempted: 'Provided general info but patient wants pharmacist confirmation',
    }
  },
  {
    id: 'p4',
    name: 'Omar Farooq',
    age: 62,
    gender: 'Male',
    urgency: 'low',
    waitStart: new Date(Date.now() - 620000), // 10m 20s ago
    preview: 'When is my next refill due for Lipitor?',
    unread: false,
    source: 'AI Escalation',
    handoff: {
      summary: 'Refill status check',
      query: 'When is my next refill due for Lipitor?',
      confidence: 90,
      attempted: 'Showed refill info but patient has concerns about stock',
    }
  }
];

export const patientContexts = {
  p1: {
    allergies: [
      { name: 'Penicillin', severity: 'Severe · Anaphylaxis risk' },
      { name: 'Sulfa drugs', severity: 'Moderate · Rash' }
    ],
    medications: [
      { name: 'Lisinopril 5mg', dosage: '1x daily', since: 'Mar 2024' },
      { name: 'Amlodipine 5mg', dosage: '1x daily', since: 'Jun 2024' }
    ],
    history: [
      { date: '2024-12-10', items: ['Lisinopril', 'Amlodipine'], status: 'Active' },
      { date: '2024-09-05', items: ['Amoxicillin (Cancelled due to allergy)'], status: 'Cancelled' },
      { date: '2024-06-12', items: ['Panadol 500mg'], status: 'Expired' }
    ],
    cart: [
      { name: 'Lisinopril 5mg', qty: 30, price: 450 },
      { name: 'Amlodipine 5mg', qty: 30, price: 380 }
    ]
  },
  p2: {
    allergies: [],
    medications: [
      { name: 'Atorvastatin 20mg', dosage: '1x nightly', since: 'Oct 2024' },
      { name: 'Aspirin 75mg', dosage: '1x daily', since: 'Oct 2024' }
    ],
    history: [
      { date: '2024-10-15', items: ['Atorvastatin', 'Aspirin'], status: 'Active' }
    ],
    cart: [
      { name: 'Atorvastatin 20mg', qty: 28, price: 1200 }
    ]
  }
};

export const chatHistory = {
  p1: [
    { id: 'm1', role: 'patient', text: 'Hi, I have a question about my meds.', time: '12:40 PM' },
    { id: 'm2', role: 'assistant', text: 'Hello Ayesha! I am here to help. What is your question?', time: '12:40 PM' },
    { id: 'm3', role: 'patient', text: 'Can I take Brufen with my blood pressure medication?', time: '12:41 PM' },
    { id: 'm4', role: 'assistant', text: 'I am checking our database for interactions between Brufen (Ibuprofen) and Lisinopril/Amlodipine. One moment please...', time: '12:41 PM' },
    { id: 'm5', role: 'assistant', text: 'I see a potential interaction that may affect your blood pressure. I am escalating this to our human pharmacist to give you the most accurate advice.', time: '12:42 PM' },
  ]
};

export const cannedResponses = [
  "I'm reviewing your medication history now.",
  "Please hold on while I check our drug database.",
  "This combination is safe — here's what you need to know:",
  "I recommend consulting your GP for this question.",
  "Your prescription has been noted. Please proceed with the order."
];
