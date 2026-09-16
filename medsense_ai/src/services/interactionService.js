// src/services/interactionService.js
// Dedicated service for the MedsenseAI DDI (Drug-Drug Interaction) AI backend.
// Routes through the /ai-api Vite proxy → FastAPI at localhost:8000/api/v1

import axios from 'axios';

const aiApi = axios.create({
  baseURL: '/ai-api',
  timeout: 30000, // DDI checks can take a few seconds with many drugs
});

/**
 * Check all pairwise drug-drug interactions for a list of drugs.
 *
 * @param {string[]} drugs - Array of drug/ingredient names (2–20)
 * @returns {Promise<{
 *   success: boolean,
 *   total_drugs: number,
 *   total_pairs_checked: number,
 *   interactions_found: number,
 *   results: Array<{
 *     drug_a: string,
 *     drug_b: string,
 *     normalized_a: string|null,
 *     normalized_b: string|null,
 *     severity: 'critical'|'warning'|'info'|'safe',
 *     warning_triggered: boolean,
 *     warning_score: number|null,
 *     known_interaction: boolean,
 *     descriptions: string[],
 *     message: string,
 *     status: string,
 *   }>,
 *   service_ready: boolean,
 *   disclaimer: string,
 * }>}
 */
export async function checkDrugInteractions(drugs) {
  const response = await aiApi.post('/interactions/check', { drugs });
  return response.data;
}

export default { checkDrugInteractions };
