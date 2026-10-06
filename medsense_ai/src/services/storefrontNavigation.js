const HISTORY_KEY = 'medsense_storefront_navigation_v1';
const LISTING_KEY = 'medsense_storefront_listing_v1';
const UPLOAD_ORIGIN_KEY = 'medsense_prescription_upload_origin_v1';

export function isStorefrontPath(path) {
  return typeof path === 'string' && /^\/(?:$|[?#]|search(?:[/?#]|$)|category\/|product\/|cart(?:[/?#]|$)|checkout(?:[/?#]|$)|prescription\/|account(?:[/?#]|$)|orders(?:[/?#]|$)|consult\/pharmacist(?:[/?#]|$)|refills(?:[/?#]|$)|refunds(?:[/?#]|$)|order-confirmation(?:[/?#]|$))/.test(path);
}

export function isListingPath(path) {
  return typeof path === 'string' && /^\/(?:search(?:[?#]|$)|category\/)/.test(path);
}

export function rememberStorefrontLocation(path) {
  if (!isStorefrontPath(path)) return;
  try {
    const history = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '{}');
    if (history.current !== path) {
      if (path.startsWith('/prescription/upload') && isStorefrontPath(history.current)
        && !history.current.startsWith('/prescription/')) {
        sessionStorage.setItem(UPLOAD_ORIGIN_KEY, history.current);
      }
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify({ current: path, previous: history.current || null }));
    }
    if (isListingPath(path)) sessionStorage.setItem(LISTING_KEY, path);
  } catch { /* Navigation still works when browser storage is unavailable. */ }
}

export function prescriptionUploadReturnPath(currentPath) {
  const previous = previousStorefrontLocation(currentPath);
  if (previous && !previous.startsWith('/prescription/')) return previous;
  try {
    const origin = sessionStorage.getItem(UPLOAD_ORIGIN_KEY);
    return isStorefrontPath(origin) && !origin.startsWith('/prescription/') ? origin : '/cart';
  } catch { return '/cart'; }
}

export function previousStorefrontLocation(currentPath) {
  try {
    const history = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '{}');
    const previous = history.current === currentPath ? history.previous : history.current;
    return isStorefrontPath(previous) && previous !== currentPath ? previous : null;
  } catch { return null; }
}

export function lastStorefrontListing() {
  try {
    const path = sessionStorage.getItem(LISTING_KEY);
    return isListingPath(path) ? path : '/search';
  } catch { return '/search'; }
}
