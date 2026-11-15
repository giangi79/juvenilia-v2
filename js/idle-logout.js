import { db } from './supabase.js';

// The timestamp is shared by Juvenilia tabs in this browser.
const IDLE_LIMIT = 120000;
const ACTIVITY_KEY = 'juvenilia_gare_last_activity_v1';
let authenticated = false;
let initialized = false;
let signingOut = false;
let timer;
let lastWrite = 0;

function readActivity() {
  return Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
}
function schedule() {
  clearTimeout(timer);
  if (!authenticated || signingOut) return;
  timer = setTimeout(checkIdle, Math.max(0, IDLE_LIMIT - (Date.now() - readActivity())));
}
async function checkIdle() {
  if (!authenticated || signingOut) return;
  if (Date.now() - readActivity() < IDLE_LIMIT) {
    schedule();
    return;
  }
  signingOut = true;
  try {
    const { error } = await db.auth.signOut({ scope: 'local' });
    if (error) throw error;
  } catch (error) {
    signingOut = false;
    timer = setTimeout(checkIdle, 5000);
  }
}
function recordActivity(event) {
  if (!initialized || !authenticated || signingOut || !event.isTrusted) return;
  // A resumed tab must check expiry before accepting fresh activity.
  if (Date.now() - readActivity() >= IDLE_LIMIT) {
    checkIdle();
    return;
  }
  if (Date.now() - lastWrite < 1000) return;
  lastWrite = Date.now();
  localStorage.setItem(ACTIVITY_KEY, String(lastWrite));
  schedule();
}
for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
  window.addEventListener(type, recordActivity, { passive: true });
}
window.addEventListener('storage', event => {
  if (event.key === ACTIVITY_KEY && event.newValue) schedule();
});
window.addEventListener('pageshow', () => { if (initialized) checkIdle(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && initialized) checkIdle();
});
db.auth.onAuthStateChange((event, session) => {
  if (!initialized) return;
  if (event === 'SIGNED_OUT') {
    const wasAuthenticated = authenticated;
    authenticated = false;
    signingOut = false;
    clearTimeout(timer);
    localStorage.removeItem(ACTIVITY_KEY);
    // Remove administrator data that was already displayed in this tab.
    if (wasAuthenticated && document.getElementById('loginCard')) {
      setTimeout(() => location.reload(), 0);
    }
  } else if (event === 'SIGNED_IN' && session && !authenticated) {
    authenticated = true;
    lastWrite = Date.now();
    localStorage.setItem(ACTIVITY_KEY, String(lastWrite));
    schedule();
  }
});
async function start() {
  const { data: { session }, error } = await db.auth.getSession();
  if (error) throw error;
  authenticated = Boolean(session);
  initialized = true;
  if (!authenticated) return;
  if (!readActivity()) localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  checkIdle();
}
start().catch(error => console.error('Controllo inattività non disponibile:', error));
