// Configuration
const PING_URL = 'https://xedryk.top/health-ping';
const HOME_URL = 'https://xedryk.top';
const CHECK_INTERVAL = 1000; // 1 second

// Failsafe inline images (used only if offline.png / online.png are missing)
const FALLBACK_IMG = {
  online: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<circle cx="50" cy="50" r="46" fill="#16a34a"/>' +
    '<path d="M30 52 L44 66 L72 36" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>'),
  offline: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<circle cx="50" cy="50" r="46" fill="#dc2626"/>' +
    '<path d="M34 34 L66 66 M66 34 L34 66" stroke="#fff" stroke-width="10" stroke-linecap="round"/>' +
    '</svg>')
};

// DOM Elements
const statusImg = document.getElementById('status-image');
const statusBadge = document.getElementById('status-badge');
const statusTitle = document.getElementById('status-title');
const statusText = document.getElementById('status-text');
const timerLabel = document.getElementById('timer-label');
const timerDisplay = document.getElementById('timer-display');
const restoreButtons = document.getElementById('restore-buttons');
const returnBtn = document.getElementById('return-btn');
const homeBtn = document.getElementById('home-btn');
const pingUrlLabel = document.getElementById('ping-url-label');

// Expose for onclick from index.html
window.statusImg = statusImg;

// State Management
let currentState = localStorage.getItem('server_state') || 'offline';
let stateStartTime = parseInt(localStorage.getItem('state_start_time')) || Date.now();
let checkInFlight = false;

// Capture the page the user was trying to visit (set by the Cloudflare Worker
// redirect as ?from=<encoded url>), so "Restore Access" can take them back.
(function captureReturnUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');
    if (from) {
      const url = new URL(from);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        localStorage.setItem('return_url', url.href);
      }
    }
  } catch (e) { /* ignore malformed params */ }
})();

function getReturnUrl() {
  try {
    const saved = localStorage.getItem('return_url');
    if (saved) {
      const url = new URL(saved);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    }
  } catch (e) { /* ignore */ }
  return HOME_URL;
}

function updateUI(isOnline) {
  if (isOnline) {
    statusImg.src = 'online.webp';
    statusImg.onerror = () => { statusImg.src = FALLBACK_IMG.online; };
    statusBadge.textContent = 'ONLINE';
    statusBadge.className = 'status-badge online';
    statusTitle.textContent = 'Server is Online';
    statusText.textContent = 'All systems are currently operational.';
    timerLabel.textContent = 'Uptime:';
    returnBtn.href = getReturnUrl();
    homeBtn.href = HOME_URL;
    restoreButtons.classList.remove('hidden');
  } else {
    statusImg.src = 'offline.webp';
    statusImg.onerror = () => { statusImg.src = FALLBACK_IMG.offline; };
    statusBadge.textContent = 'OFFLINE';
    statusBadge.className = 'status-badge offline';
    statusTitle.textContent = 'Server is on Maintenance';
    statusText.textContent = 'We are currently experiencing an outage or performing maintenance.';
    timerLabel.textContent = 'Time Offline:';
    restoreButtons.classList.add('hidden');
  }
}

function updateTimer() {
  const now = Date.now();
  const elapsedSeconds = Math.floor((now - stateStartTime) / 1000);

  const h = String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(elapsedSeconds % 60).padStart(2, '0');

  timerDisplay.textContent = `${h}:${m}:${s}`;
}

async function checkServer() {
  if (checkInFlight) return; // avoid overlapping requests
  checkInFlight = true;
  try {
    // Cache bust to prevent the browser from caching a previous state
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${PING_URL}?t=${Date.now()}`, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    handleStateChange(res.ok); // ok means 200-299
  } catch (error) {
    // Network error / CORS failure / timeout = offline
    handleStateChange(false);
  } finally {
    checkInFlight = false;
  }
}

function handleStateChange(isNowOnline) {
  const newStateStr = isNowOnline ? 'online' : 'offline';

  if (currentState !== newStateStr) {
    // The server just flipped states! Reset the timer.
    currentState = newStateStr;
    stateStartTime = Date.now();
    localStorage.setItem('server_state', currentState);
    localStorage.setItem('state_start_time', stateStartTime);
  }

  updateUI(isNowOnline);
}

function handleImageError(img) {
  // Failsafe: if a pushed PNG is missing, fall back to the inline icon
  img.src = currentState === 'online' ? FALLBACK_IMG.online : FALLBACK_IMG.offline;
}

// Initialization
pingUrlLabel.textContent = PING_URL;
updateUI(currentState === 'online');
setInterval(updateTimer, 1000);
setInterval(checkServer, CHECK_INTERVAL);
checkServer(); // run the first check immediately
