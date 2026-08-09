// Configuration
const PING_URL = 'https://xedryk.top/health-ping';
const HOME_URL = 'https://xedryk.top';
const CHECK_INTERVAL = 1000; // 1 second

// Failsafe inline images (used only if the .webp files are missing)
const FALLBACK_IMG = {
  online: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<circle cx="50" cy="50" r="46" fill="#16a34a"/>' +
    '<path d="M30 52 L44 66 L72 36" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>'),
  maintenance: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<circle cx="50" cy="50" r="46" fill="#d97706"/>' +
    '<path d="M50 32 L50 54 M50 66 L50 68" stroke="#fff" stroke-width="9" stroke-linecap="round"/>' +
    '</svg>'),
  offline: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<circle cx="50" cy="50" r="46" fill="#dc2626"/>' +
    '<path d="M34 34 L66 66 M66 34 L34 66" stroke="#fff" stroke-width="10" stroke-linecap="round"/>' +
    '</svg>')
};

// Time-based outage messages — jokes escalate as downtime grows
const OUTAGE_MESSAGES = [
  { min: 0,     text: "We hit a small server issue — will be back soon!" },
  { min: 5,     text: "The server is in the hard time, be patient." },
  { min: 30,    text: "The server needs a new host to triple itself :3" },
  { min: 120,   text: "Okay this is getting a bit awkward... the server is napping." },
  { min: 360,   text: "The hamster powering the server wheels is on a long coffee break." },
  { min: 720,   text: "Our server has gone to explore the void. It left a note saying it'll be back." },
  { min: 1440,  text: "The server is on vacation. Wait — it didn't even pack." },
  { min: 4320,  text: "We're starting to worry. The server ghosted us." },
];

// XOR-encrypted contact email — only decrypted when downtime exceeds 7 days
const CONTACT_EMAIL_KEY = "Xedryk7d!";
const CONTACT_EMAIL_CIPHER = [53,28,9,29,23,14,78,11,73,24,2,9,19,16,7,25,7,78,53];
const DEAD_THRESHOLD_MIN = 10080; // 7 days

function decryptEmail() {
  let out = "";
  for (let i = 0; i < CONTACT_EMAIL_CIPHER.length; i++) {
    out += String.fromCharCode(CONTACT_EMAIL_CIPHER[i] ^ CONTACT_EMAIL_KEY.charCodeAt(i % CONTACT_EMAIL_KEY.length));
  }
  return out;
}

function outageMessageFor(elapsedSeconds) {
  const minutes = elapsedSeconds / 60;

  // > 7 days: the server is dead — reveal the encrypted contact email
  if (minutes >= DEAD_THRESHOLD_MIN) {
    const email = decryptEmail();
    return `This server is dead. Please contact the manager's friend to update the status. Send an email to ${email} (the manager's young brother).`;
  }

  let msg = OUTAGE_MESSAGES[0].text;
  for (const tier of OUTAGE_MESSAGES) {
    if (minutes >= tier.min) msg = tier.text;
  }
  return msg;
}

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

// Server-reported Linux uptime (seconds) + when we captured it. When present,
// the ONLINE timer shows the server's real uptime, identical on every device,
// instead of a per-browser localStorage counter.
let serverUptimeSeconds = null;
let serverUptimeAt = 0;

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

function updateUI(state) {
  if (state === 'online') {
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
  } else if (state === 'maintenance') {
    statusImg.src = FALLBACK_IMG.maintenance;
    statusImg.onerror = null;
    statusBadge.textContent = 'MAINTENANCE';
    statusBadge.className = 'status-badge maintenance';
    statusTitle.textContent = 'Server is on Maintenance';
    statusText.textContent = 'The website is being worked on. The server itself is running fine.';
    timerLabel.textContent = 'Maintenance Time:';
    restoreButtons.classList.add('hidden');
  } else {
    statusImg.src = 'offline.webp';
    statusImg.onerror = () => { statusImg.src = FALLBACK_IMG.offline; };
    statusBadge.textContent = 'OFFLINE';
    statusBadge.className = 'status-badge offline';
    statusTitle.textContent = 'Server is Offline';
    statusText.textContent = outageMessageFor(0);
    timerLabel.textContent = 'Time Offline:';
    restoreButtons.classList.add('hidden');
  }
}

function formatElapsed(elapsedSeconds) {
  const h = String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(elapsedSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function updateTimer() {
  const now = Date.now();
  let elapsedSeconds;

  if (currentState === 'online' && serverUptimeSeconds !== null) {
    // Real Linux uptime from the server, ticking locally between polls and
    // re-synced every second — same value on every device.
    elapsedSeconds = serverUptimeSeconds + (now - serverUptimeAt) / 1000;
  } else {
    // Maintenance or offline: count from when this state started (per-browser).
    elapsedSeconds = (now - stateStartTime) / 1000;
  }

  timerDisplay.textContent = formatElapsed(Math.floor(elapsedSeconds));

  // Keep the outage joke in sync with elapsed time (and reveal the encrypted
  // contact email once downtime exceeds 7 days)
  if (currentState === 'offline') {
    statusText.textContent = outageMessageFor(Math.floor(elapsedSeconds));
  }
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

    // The worker now returns JSON: { status: "UP"|"MAINTENANCE"|"DOWN", uptime_seconds: number|null }
    let status = res.ok ? 'UP' : 'DOWN';
    let uptimeSeconds = null;
    try {
      const body = await res.json();
      if (body && typeof body.status === 'string') status = body.status;
      if (body && typeof body.uptime_seconds === 'number') uptimeSeconds = body.uptime_seconds;
    } catch (e) {
      // Older worker still returns plain "UP"/"DOWN" text — fall back to status code.
    }

    handleStateChange(status, uptimeSeconds);
  } catch (error) {
    // Network error / CORS failure / timeout = offline
    handleStateChange('DOWN', null);
  } finally {
    checkInFlight = false;
  }
}

function handleStateChange(status, uptimeSeconds) {
  const newStateStr = status === 'UP' ? 'online' : (status === 'MAINTENANCE' ? 'maintenance' : 'offline');

  if (currentState !== newStateStr) {
    // The server just flipped states! Reset the timer.
    currentState = newStateStr;
    stateStartTime = Date.now();
    localStorage.setItem('server_state', currentState);
    localStorage.setItem('state_start_time', stateStartTime);
  }

  // Fresh server uptime whenever the worker reports it (every poll while online).
  if (typeof uptimeSeconds === 'number' && uptimeSeconds >= 0) {
    serverUptimeSeconds = uptimeSeconds;
    serverUptimeAt = Date.now();
  }

  updateUI(currentState);
}

function handleImageError(img) {
  // Failsafe: if a pushed image is missing, fall back to the inline icon
  img.src = currentState === 'online' ? FALLBACK_IMG.online
    : (currentState === 'maintenance' ? FALLBACK_IMG.maintenance : FALLBACK_IMG.offline);
}

// Initialization
pingUrlLabel.textContent = PING_URL;
updateUI(currentState);
setInterval(updateTimer, 1000);
setInterval(checkServer, CHECK_INTERVAL);
checkServer(); // run the first check immediately
