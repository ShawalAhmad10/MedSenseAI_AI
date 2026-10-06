// User-requested category directory; clinical descriptions are not inferred.
const MEDICINE_CATEGORIES = require('../../data/requested-categories.json');
const CATEGORY_OPTIONS = MEDICINE_CATEGORIES.map(value => ({ value, label: value }));
const CATEGORY_DESCRIPTIONS = {};
const isValidCategory = category => MEDICINE_CATEGORIES.includes(category);
const getCategoryDescription = category => CATEGORY_DESCRIPTIONS[category] || 'No description available';
module.exports = { MEDICINE_CATEGORIES, CATEGORY_OPTIONS, CATEGORY_DESCRIPTIONS, isValidCategory, getCategoryDescription };
