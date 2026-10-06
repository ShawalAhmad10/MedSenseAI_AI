// Poll the shared backend without overlapping requests or refreshing hidden tabs.
export function startLiveDataRefresh(refresh, {
  intervalMs = 5000,
  windowObject = window,
  documentObject = document,
} = {}) {
  let stopped = false;
  let pending = false;
  let timer;
  const schedule = () => {
    if (!stopped) timer = windowObject.setTimeout(run, intervalMs);
  };
  async function run() {
    if (stopped || pending) return;
    windowObject.clearTimeout(timer);
    if (documentObject.visibilityState === 'hidden') { schedule(); return; }
    pending = true;
    try { await refresh(); }
    catch (error) { console.error('Unable to refresh shared pharmacy data:', error); }
    finally { pending = false; schedule(); }
  }
  windowObject.addEventListener('focus', run);
  documentObject.addEventListener('visibilitychange', run);
  schedule();
  return () => {
    stopped = true;
    windowObject.clearTimeout(timer);
    windowObject.removeEventListener('focus', run);
    documentObject.removeEventListener('visibilitychange', run);
  };
}
