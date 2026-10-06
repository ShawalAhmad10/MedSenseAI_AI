import test from 'node:test';
import assert from 'node:assert/strict';
import { startLiveDataRefresh } from '../src/services/liveDataRefresh.js';

function environment() {
  const timers = new Map(), windowListeners = new Map(), documentListeners = new Map();
  let id = 0;
  const windowObject = {
    setTimeout(fn) { const key = ++id; timers.set(key, fn); return key; },
    clearTimeout(key) { timers.delete(key); },
    addEventListener(type, fn) { windowListeners.set(type, fn); },
    removeEventListener(type) { windowListeners.delete(type); },
  };
  const documentObject = {
    visibilityState: 'visible',
    addEventListener(type, fn) { documentListeners.set(type, fn); },
    removeEventListener(type) { documentListeners.delete(type); },
  };
  return {windowObject,documentObject,timers,windowListeners,documentListeners,
    async tick() { const [key, fn] = timers.entries().next().value; timers.delete(key); await fn(); }};
}
test('refreshes again after completed requests and cleans up on unmount', async () => {
  const env = environment(); let calls = 0;
  const stop = startLiveDataRefresh(async () => { calls++; }, env);
  await env.tick(); await env.tick();
  assert.equal(calls, 2); stop();
  assert.equal(env.timers.size, 0);
  assert.equal(env.windowListeners.size, 0);
  assert.equal(env.documentListeners.size, 0);
});
test('hidden screens wait; returning to the screen reloads immediately', async () => {
  const env = environment(); let calls = 0;
  const stop = startLiveDataRefresh(async () => { calls++; }, env);
  env.documentObject.visibilityState = 'hidden'; await env.tick(); assert.equal(calls, 0);
  env.documentObject.visibilityState = 'visible'; await env.documentListeners.get('visibilitychange')();
  assert.equal(calls, 1); assert.equal(env.timers.size, 1); stop();
});
test('focus events never overlap a pending request or recreate a stopped timer', async () => {
  const env = environment(); let finish, calls = 0;
  const stop = startLiveDataRefresh(() => { calls++; return new Promise(resolve => { finish = resolve; }); }, env);
  const first = env.windowListeners.get('focus')();
  await env.windowListeners.get('focus')(); assert.equal(calls, 1);
  stop(); finish(); await first; assert.equal(env.timers.size, 0);
});
