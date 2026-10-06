import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import {
  MEDICINE_CATEGORIES,
  getCategorySlug,
  isValidCategory,
} from '../src/constants/categories.js';
import { getCategories, searchProducts } from '../src/services/storefrontProductService.js';

const requestedCategories = [
  'Analgesic / Antipyretic', 'Analgesic', 'NSAID / Painkiller', 'Cold & Flu',
  'Antibiotic', 'Antibiotic / Antiprotozoal', 'Gastrointestinal', 'Antiemetic',
  'Antispasmodic', 'Antihistamine', 'Respiratory', 'Cough / Respiratory',
  'Cough Suppressant', 'Cardiovascular', 'Cardiovascular / Lipid Lowering',
  'Antihypertensive', 'Lipid Lowering', 'Antidiabetic', 'Multivitamin', 'Vitamins',
  'Calcium / Supplement', 'Supplement', 'Iron Supplement', 'Calcium / Vitamin D',
  'Joint Supplement', 'Antimalarial', 'Herbal Supplement', 'Personal Care',
  'Neurological', 'Antipsychotic', 'Antidepressant', 'Neuropathic Pain',
  'Respiratory / Antiallergic', 'Throat / Cough Relief', 'Other',
];

const product = (id, category, stockQty = 0) => ({
  id: `prod-${id}`, title: `Catalogue medicine ${id}`, category,
  status: stockQty ? 'active' : 'inactive', stockQty, price: 10, minThreshold: 5,
});

test('medicine options match 35 approved names including Other and exclude unapproved categories', () => {
  assert.deepEqual(MEDICINE_CATEGORIES, requestedCategories);
  assert.equal(isValidCategory('Analgesic'), true);
  assert.equal(isValidCategory('Other'), true);
  assert.equal(isValidCategory('Ophthalmic'), false);
  assert.equal(isValidCategory('Gout / Uric Acid'), false);
  assert.equal(isValidCategory('Analgesics'), false);
  assert.equal(isValidCategory('DEMO ONLY'), false);
  const slugs = MEDICINE_CATEGORIES.map(getCategorySlug);
  assert.equal(new Set(slugs).size, 35);
  slugs.forEach(slug => assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/));
  assert.equal(getCategorySlug('NSAID / Painkiller'), 'nsaid-painkiller');
  assert.equal(getCategorySlug('Cold & Flu'), 'cold-flu');
  assert.equal(getCategorySlug('Calcium / Vitamin D'), 'calcium-vitamin-d');
});

test('storefront shows the category master list when no products or stock exist', async t => {
  const requests = [];
  t.mock.method(axios, 'get', async (url, options) => {
    requests.push([url, options]);
    return { data: url.endsWith('/categories')
      ? { success: true, data: { categories: requestedCategories } }
      : [] };
  });
  const categories = await getCategories();
  assert.deepEqual(categories.map(category => category.name), requestedCategories);
  assert.equal(categories.length, 35);
  assert.ok(categories.every(category => category.count === 0));
  assert.ok(requests.some(([url]) => url === '/api/products/categories'));
  assert.ok(requests.some(([url, options]) => url === '/api/products' && options.params.view === 'storefront'));
});

test('old product categories do not reappear in the new category master navigation', async t => {
  t.mock.method(axios, 'get', async url => ({ data: url.endsWith('/categories')
    ? { data: { categories: ['Analgesic', 'Cold & Flu', 'Vitamins'] } }
    : [product(1, 'Analgesics', 10), product(2, 'Cold & Flu'), product(3, 'Cold & Flu', 10)] }));
  assert.deepEqual((await getCategories()).map(({ name, count }) => [name, count]),
    [['Analgesic', 0], ['Cold & Flu', 2], ['Vitamins', 0]]);
});

test('slash and ampersand category routes return only their matching medicines', async t => {
  t.mock.method(axios, 'get', async () => ({ data: [
    product(1, 'NSAID / Painkiller', 10),
    product(2, 'Cold & Flu', 10),
    product(3, 'Calcium / Vitamin D'),
    product(4, 'Analgesic', 10),
    product(5, 'Other'),
  ] }));
  for (const [slug, expectedId] of [
    ['nsaid-painkiller', 'prod-1'], ['cold-flu', 'prod-2'], ['calcium-vitamin-d', 'prod-3'], ['other', 'prod-5'],
  ]) {
    const products = await searchProducts('', slug);
    assert.deepEqual(products.map(product => product.id), [expectedId]);
    assert.equal(products[0].categorySlug, slug);
  }
  assert.deepEqual(await searchProducts('not in catalogue', 'cold-flu'), []);
});

test('a failed category API does not fall back to old hardcoded or product names', async t => {
  t.mock.method(axios, 'get', async url => {
    if (url.endsWith('/categories')) throw new Error('Category service unavailable');
    return { data: [product(1, 'Analgesics', 10)] };
  });
  await assert.rejects(getCategories(), /Category service unavailable/);
});
