// ============================================
// CONFIGURATION
// ============================================
const API_URL = 'https://api.jdeestore.in/api';
const TRACKER_DURATION = 5 * 60;
const MAX_LOGS = 50;

// ============================================
// STATE VARIABLES
// ============================================
let sessionString = '';
let sessionId = '';
let apiKey = '';
// Using var so these are accessible via window[arrName] in toggleDice
var selectedDiceManual = [];
var selectedDiceTracker = [];
var selectedDiceDm = [];
var selectedDiceDmTracker = [];
let trackerRunning = false;
let dmTrackerRunning = false;
let trackerTimeRemaining = TRACKER_DURATION;
let trackerTimerInterval = null;
let activeTrackerType = null;
let trackerStatusInterval = null;
let activityLogs = [];
let dmActivityLogs = [];

// ============================================
// INITIALIZATION
// ============================================
function init() {
    sessionString = localStorage.getItem('telegram_session') || '';
    apiKey = localStorage.getItem('api_key') || '';
    if (apiKey) document.getElementById('apiKey').value = apiKey;
    if (sessionString && apiKey) {
        verifyStoredKey().then(valid => {
            if (valid) { showPage('dashboardPage'); loadSavedData(); checkTrackerStatus(); }
            else logout();
        });
    } else showPage('loginPage');
}

async function verifyStoredKey() {
    try {
        const r = await fetch(`${API_URL}/verify-key`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey } });
        return (await r.json()).success;
    } catch (e) { return false; }
}

function loadSavedData() {
    const fields = [
        ['chatId', 'chat_id'], ['maxDeletions', 'max_deletions'], ['trackerChatIdInput', 'tracker_chat_id'],
        ['trackerDeletionLimitInput', 'tracker_limit'], ['dmUserId', 'dm_user_id'], ['dmMaxDeletions', 'dm_max_deletions'],
        ['dmTotalDice', 'dm_total_dice', '6'], ['dmTrackerUserIdInput', 'dm_tracker_user_id'], ['dmTrackerDeletionLimitInput', 'dm_tracker_limit']
    ];
    fields.forEach(([id, key, def]) => { const v = localStorage.getItem(key) || def || ''; if (v) document.getElementById(id).value = v; });
    document.getElementById('replaceUntilGoodSwitch').checked = localStorage.getItem('replace_until_good') === 'true';
    document.getElementById('dmReplaceUntilGoodSwitch').checked = localStorage.getItem('dm_replace_until_good') === 'true';
    
    // Load saved dice selections
    try {
        const savedManual = JSON.parse(localStorage.getItem('selected_dice') || '[]');
        savedManual.forEach(n => {
            selectedDiceManual.push(n);
            const b = document.querySelector(`#manualDiceGrid [data-value="${n}"]`);
            if (b) b.classList.add('selected');
        });
    } catch (e) { selectedDiceManual = []; }
    
    try {
        const savedTracker = JSON.parse(localStorage.getItem('tracker_dice') || '[]');
        savedTracker.forEach(n => {
            selectedDiceTracker.push(n);
            const b = document.querySelector(`#trackerDiceGrid [data-value="${n}"]`);
            if (b) b.classList.add('selected');
        });
    } catch (e) { selectedDiceTracker = []; }
    
    try {
        const savedDm = JSON.parse(localStorage.getItem('dm_dice') || '[]');
        savedDm.forEach(n => {
            selectedDiceDm.push(n);
            const b = document.querySelector(`#dmDiceGrid [data-value="${n}"]`);
            if (b) b.classList.add('selected-purple');
        });
    } catch (e) { selectedDiceDm = []; }
    
    try {
        const savedDmTracker = JSON.parse(localStorage.getItem('dm_tracker_dice') || '[]');
        savedDmTracker.forEach(n => {
            selectedDiceDmTracker.push(n);
            const b = document.querySelector(`#dmTrackerDiceGrid [data-value="${n}"]`);
            if (b) b.classList.add('selected-purple');
        });
    } catch (e) { selectedDiceDmTracker = []; }
}

// ============================================
// PAGE & TAB NAVIGATION
// ============================================
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    hideAllMessages();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active', 'active-purple'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const tabs = document.querySelectorAll('.tab');
    const idx = { manualTab: 0, dmTab: 1, trackerTab: 2, dmTrackerTab: 3 }[tabId];
    tabs[idx].classList.add(tabId === 'dmTrackerTab' ? 'active-purple' : 'active');
    document.getElementById(tabId).classList.add('active');
    hideAllMessages();
}

// ============================================
// TIMER FUNCTIONS
// ============================================
function startTrackerTimer(type) {
    trackerTimeRemaining = TRACKER_DURATION;
    activeTrackerType = type;
    showTimer(type);
    updateTimerDisplay(type);
    if (trackerTimerInterval) clearInterval(trackerTimerInterval);
    trackerTimerInterval = setInterval(() => {
        trackerTimeRemaining--;
        updateTimerDisplay(activeTrackerType);
        if (trackerTimeRemaining <= 0) handleTrackerExpiry(activeTrackerType);
    }, 1000);
}

function updateTimerDisplay(type) {
    const minutes = Math.floor(trackerTimeRemaining / 60);
    const seconds = trackerTimeRemaining % 60;
    const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('timerDisplay').textContent = display;
    document.getElementById('trackerTimerDisplay').textContent = display;
    document.getElementById('dmTrackerTimerDisplay').textContent = display;
    document.getElementById('timerLabel').textContent = type === 'dm' ? 'DM Tracker Auto-Stop In' : 'Group Tracker Auto-Stop In';
    const progressPercent = (trackerTimeRemaining / TRACKER_DURATION) * 100;
    const bar = document.getElementById('timerProgressBar');
    bar.style.width = `${progressPercent}%`;
    const timerEl = document.getElementById('timerDisplay');
    timerEl.classList.remove('warning', 'critical');
    bar.classList.remove('warning', 'critical');
    const icon = document.getElementById('timerIcon');
    const badge = document.getElementById('timerStatusBadge');
    if (trackerTimeRemaining <= 60) {
        timerEl.classList.add('critical'); bar.classList.add('critical');
        icon.textContent = '🚨'; badge.textContent = '⚠️ Stopping Soon'; badge.className = 'timer-status-badge expired';
    } else if (trackerTimeRemaining <= 120) {
        timerEl.classList.add('warning'); bar.classList.add('warning');
        icon.textContent = '⚠️'; badge.textContent = '⏳ Low Time'; badge.className = 'timer-status-badge inactive';
    } else {
        icon.textContent = '⏱️';
        badge.textContent = type === 'dm' ? '● DM Tracker Active' : '● Group Tracker Active';
        badge.className = 'timer-status-badge active';
    }
}

function showTimer(type) {
    document.getElementById('globalTimer').classList.add('show');
    document.getElementById('timerProgressContainer').classList.add('show');
    document.getElementById('trackerTimerInfo').classList.toggle('show', type === 'group');
    document.getElementById('dmTrackerTimerInfo').classList.toggle('show', type === 'dm');
}

function hideTimer() {
    document.getElementById('globalTimer').classList.remove('show');
    document.getElementById('timerProgressContainer').classList.remove('show');
    document.getElementById('trackerTimerInfo').classList.remove('show');
    document.getElementById('dmTrackerTimerInfo').classList.remove('show');
}

function stopTrackerTimer() {
    if (trackerTimerInterval) { clearInterval(trackerTimerInterval); trackerTimerInterval = null; }
    activeTrackerType = null;
    hideTimer();
}

async function handleTrackerExpiry(type) {
    stopTrackerTimer();
    document.getElementById('expiredOverlayText').textContent = `Your ${type === 'dm' ? 'DM' : 'group'} tracker session has ended after 5 minutes.`;
    document.getElementById('sessionExpiredOverlay').classList.add('show');
    if ((type === 'group' && trackerRunning) || (type === 'dm' && dmTrackerRunning)) {
        try { await fetch(`${API_URL}/tracker/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify({ session: sessionString }) }); } catch (e) {}
    }
    if (type === 'group') {
        trackerRunning = false;
        document.getElementById('trackerSwitch').checked = false;
        updateTrackerUI(false, 'group');
        document.getElementById('trackerConfig').style.display = 'block';
    } else {
        dmTrackerRunning = false;
        document.getElementById('dmTrackerSwitch').checked = false;
        updateTrackerUI(false, 'dm');
        document.getElementById('dmTrackerConfig').style.display = 'block';
    }
    stopTrackerStatusUpdates();
}

function closeExpiredOverlay() { document.getElementById('sessionExpiredOverlay').classList.remove('show'); }

// ============================================
// AUTHENTICATION
// ============================================
async function sendOTP() {
    let phone = document.getElementById('phoneNumber').value.trim();
    apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) { showError('loginError', 'Please enter your API key'); return; }
    if (!phone) { showError('loginError', 'Please enter a valid phone number'); return; }
    if (!phone.startsWith('+')) phone = '+' + phone;
    setButtonLoading('loginBtn', true);
    try {
        const r = await fetch(`${API_URL}/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify({ phone }) });
        const d = await r.json();
        if (d.success) { sessionId = d.session_id; localStorage.setItem('api_key', apiKey); showPage('otpPage'); }
        else showError('loginError', r.status === 401 ? 'Invalid API key.' : d.error || 'Failed to send OTP');
    } catch (e) { showError('loginError', 'Failed to connect'); } finally { setButtonLoading('loginBtn', false); }
}

async function verifyOTP() {
    const code = document.getElementById('otpCode').value.trim();
    if (!code || code.length < 5) { showError('otpError', 'Please enter a valid OTP'); return; }
    setButtonLoading('verifyBtn', true);
    try {
        const r = await fetch(`${API_URL}/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify({ session_id: sessionId, code }) });
        const d = await r.json();
        if (d.success) { sessionString = d.session_string; localStorage.setItem('telegram_session', sessionString); showPage('dashboardPage'); loadSavedData(); checkTrackerStatus(); }
        else if (d.error === '2FA_REQUIRED') showPage('passwordPage');
        else showError('otpError', d.message || 'Invalid OTP');
    } catch (e) { showError('otpError', 'Failed to verify'); } finally { setButtonLoading('verifyBtn', false); }
}

async function verify2FA() {
    const pw = document.getElementById('password2FA').value;
    if (!pw) { showError('passwordError', 'Please enter password'); return; }
    setButtonLoading('passwordBtn', true);
    try {
        const r = await fetch(`${API_URL}/verify-2fa`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify({ session_id: sessionId, password: pw }) });
        const d = await r.json();
        if (d.success) { sessionString = d.session_string; localStorage.setItem('telegram_session', sessionString); showPage('dashboardPage'); loadSavedData(); checkTrackerStatus(); }
        else showError('passwordError', d.message || 'Invalid password');
    } catch (e) { showError('passwordError', 'Failed'); } finally { setButtonLoading('passwordBtn', false); }
}

function backToLogin() { sessionId = ''; showPage('loginPage'); }

function logout() {
    if (trackerRunning || dmTrackerRunning) { if (!confirm(`${trackerRunning ? 'Group' : 'DM'} tracker running. Stop before logout?`)) return; stopTracker(trackerRunning ? 'group' : 'dm'); }
    stopTrackerStatusUpdates(); stopTrackerTimer();
    ['telegram_session', 'api_key', 'chat_id', 'selected_dice', 'max_deletions', 'tracker_chat_id', 'tracker_dice', 'tracker_limit', 'replace_until_good', 'dm_user_id', 'dm_dice', 'dm_max_deletions', 'dm_total_dice', 'dm_tracker_user_id', 'dm_tracker_dice', 'dm_tracker_limit', 'dm_replace_until_good'].forEach(k => localStorage.removeItem(k));
    sessionString = ''; sessionId = ''; apiKey = ''; selectedDiceManual = []; selectedDiceTracker = []; selectedDiceDm = []; selectedDiceDmTracker = []; trackerRunning = false; dmTrackerRunning = false; activeTrackerType = null;
    ['phoneNumber', 'apiKey', 'otpCode', 'chatId', 'password2FA', 'maxDeletions', 'trackerChatIdInput', 'trackerDeletionLimitInput', 'dmUserId', 'dmMaxDeletions', 'dmTrackerUserIdInput', 'dmTrackerDeletionLimitInput'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('dmTotalDice').value = '6';
    ['trackerSwitch', 'replaceUntilGoodSwitch', 'dmTrackerSwitch', 'dmReplaceUntilGoodSwitch'].forEach(id => document.getElementById(id).checked = false);
    document.querySelectorAll('.dice-box').forEach(b => b.classList.remove('selected', 'selected-purple'));
    showPage('loginPage');
}

// ============================================
// DICE SELECTION
// ============================================
function toggleDice(number, type) {
    let arr, grid, storageKey, cls;
    
    if (type === 'manual') {
        arr = selectedDiceManual;
        grid = 'manualDiceGrid';
        storageKey = 'selected_dice';
        cls = 'selected';
    } else if (type === 'dm') {
        arr = selectedDiceDm;
        grid = 'dmDiceGrid';
        storageKey = 'dm_dice';
        cls = 'selected-purple';
    } else if (type === 'tracker') {
        arr = selectedDiceTracker;
        grid = 'trackerDiceGrid';
        storageKey = 'tracker_dice';
        cls = 'selected';
    } else if (type === 'dmTracker') {
        arr = selectedDiceDmTracker;
        grid = 'dmTrackerDiceGrid';
        storageKey = 'dm_tracker_dice';
        cls = 'selected-purple';
    }
    
    const box = document.querySelector(`#${grid} [data-value="${number}"]`);
    if (!box) return;
    
    const idx = arr.indexOf(number);
    if (idx > -1) {
        arr.splice(idx, 1);
        box.classList.remove(cls);
    } else {
        arr.push(number);
        box.classList.add(cls);
    }
    localStorage.setItem(storageKey, JSON.stringify(arr));
}

// ============================================
// GROUP DICE SEND (Manual)
// ============================================
async function sendDice() {
    const chatId = document.getElementById('chatId').value.trim();
    const maxDel = document.getElementById('maxDeletions').value.trim();
    if (!chatId) { showError('errorMsg', 'Please enter a chat ID'); return; }
    if (selectedDiceManual.length === 0) { showError('errorMsg', 'Please select dice'); return; }
    let maxDeletions = null;
    if (maxDel !== '') { maxDeletions = parseInt(maxDel); if (isNaN(maxDeletions) || maxDeletions < 0) { showError('errorMsg', 'Invalid limit'); return; } }
    localStorage.setItem('chat_id', chatId); localStorage.setItem('max_deletions', maxDel);
    setButtonLoading('sendDiceBtn', true);
    try {
        const body = { session: sessionString, chat_id: chatId, dice_numbers: selectedDiceManual };
        if (maxDeletions !== null) body.max_deletions = maxDeletions;
        const r = await fetch(`${API_URL}/send-dice`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify(body) });
        const d = await r.json();
        if (d.success) showSuccess(`Success! ${d.message}`); else showError('errorMsg', d.error || 'Failed');
    } catch (e) { showError('errorMsg', 'Failed'); } finally { setButtonLoading('sendDiceBtn', false); }
}

// ============================================
// DM DICE SEND (Using same /send-dice API as Group)
// ============================================
async function sendDmDice() {
    const userId = document.getElementById('dmUserId').value.trim();
    const maxDel = document.getElementById('dmMaxDeletions').value.trim();
    const totalDiceInput = document.getElementById('dmTotalDice').value.trim();
    if (!userId) { showError('errorMsg', 'Please enter user ID'); return; }
    if (selectedDiceDm.length === 0) { showError('errorMsg', 'Please select dice'); return; }
    let maxDeletions = null, totalDice = 6;
    if (maxDel !== '') { maxDeletions = parseInt(maxDel); if (isNaN(maxDeletions) || maxDeletions < 0) { showError('errorMsg', 'Invalid limit'); return; } }
    if (totalDiceInput !== '') { totalDice = parseInt(totalDiceInput); if (isNaN(totalDice) || totalDice < 1 || totalDice > 20) { showError('errorMsg', 'Total dice 1-20'); return; } }
    localStorage.setItem('dm_user_id', userId); localStorage.setItem('dm_max_deletions', maxDel); localStorage.setItem('dm_total_dice', totalDiceInput || '6');
    setButtonLoading('sendDmDiceBtn', true);
    try {
        const body = { session: sessionString, chat_id: userId, dice_numbers: selectedDiceDm, total_dice: totalDice };
        if (maxDeletions !== null) body.max_deletions = maxDeletions;
        const r = await fetch(`${API_URL}/send-dice`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify(body) });
        const d = await r.json();
        if (d.success) showSuccess(`Success! ${d.message}`); else showError('errorMsg', d.error || 'Failed');
    } catch (e) { showError('errorMsg', 'Failed'); } finally { setButtonLoading('sendDmDiceBtn', false); }
}

// ============================================
// AUTO TRACKER (Group & DM)
// ============================================
async function toggleTracker(type) {
    const sw = document.getElementById(type === 'group' ? 'trackerSwitch' : 'dmTrackerSwitch');
    if (sw.checked) await startTracker(type); else await stopTracker(type);
}

async function startTracker(type) {
    const isGroup = type === 'group';
    if ((isGroup && dmTrackerRunning) || (!isGroup && trackerRunning)) { showError('errorMsg', `Stop ${isGroup ? 'DM' : 'Group'} tracker first`); document.getElementById(isGroup ? 'trackerSwitch' : 'dmTrackerSwitch').checked = false; return; }
    const chatIdInput = document.getElementById(isGroup ? 'trackerChatIdInput' : 'dmTrackerUserIdInput');
    const limitInput = document.getElementById(isGroup ? 'trackerDeletionLimitInput' : 'dmTrackerDeletionLimitInput');
    const replaceSwitch = document.getElementById(isGroup ? 'replaceUntilGoodSwitch' : 'dmReplaceUntilGoodSwitch');
    const selectedDice = isGroup ? selectedDiceTracker : selectedDiceDmTracker;
    const switchEl = document.getElementById(isGroup ? 'trackerSwitch' : 'dmTrackerSwitch');
    const chatId = chatIdInput.value.trim();
    const limitVal = limitInput.value.trim();
    const replaceUntilGood = replaceSwitch.checked;
    if (!chatId) { showError('errorMsg', `Enter ${isGroup ? 'chat' : 'user'} ID`); switchEl.checked = false; return; }
    if (selectedDice.length === 0) { showError('errorMsg', 'Select bad dice'); switchEl.checked = false; return; }
    let deletionLimit = null;
    if (limitVal !== '') { deletionLimit = parseInt(limitVal); if (isNaN(deletionLimit) || deletionLimit < 0) { showError('errorMsg', 'Invalid limit'); switchEl.checked = false; return; } }
    localStorage.setItem(isGroup ? 'tracker_chat_id' : 'dm_tracker_user_id', chatId);
    localStorage.setItem(isGroup ? 'tracker_limit' : 'dm_tracker_limit', limitVal);
    localStorage.setItem(isGroup ? 'replace_until_good' : 'dm_replace_until_good', replaceUntilGood);
    switchEl.disabled = true;
    try {
        const r = await fetch(`${API_URL}/tracker/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify({ session: sessionString, chat_id: chatId, bad_values: selectedDice, deletion_limit: deletionLimit, replace_until_good: replaceUntilGood }) });
        const d = await r.json();
        if (d.success) {
            if (isGroup) trackerRunning = true; else dmTrackerRunning = true;
            showSuccess(`${isGroup ? 'Group' : 'DM'} tracker started!`);
            updateTrackerUI(true, type);
            document.getElementById(isGroup ? 'trackerConfig' : 'dmTrackerConfig').style.display = 'none';
            const limitText = deletionLimit === null ? 'Keep first, delete rest' : deletionLimit === 0 ? 'Never delete' : `Delete ${deletionLimit}x`;
            if (isGroup) { document.getElementById('trackerChatId').textContent = chatId; document.getElementById('trackerBadValues').textContent = selectedDice.join(', '); document.getElementById('trackerDeletionLimit').textContent = limitText; document.getElementById('trackerReplaceUntilGood').textContent = replaceUntilGood ? 'Yes' : 'No'; }
            else { document.getElementById('dmTrackerUserId').textContent = chatId; document.getElementById('dmTrackerBadValues').textContent = selectedDice.join(', '); document.getElementById('dmTrackerDeletionLimit').textContent = limitText; document.getElementById('dmTrackerReplaceUntilGood').textContent = replaceUntilGood ? 'Yes' : 'No'; }
            startTrackerTimer(type);
            startTrackerStatusUpdates(type);
        } else if (d.error && d.error.includes('already active')) {
            if (isGroup) trackerRunning = true; else dmTrackerRunning = true;
            switchEl.checked = true; updateTrackerUI(true, type);
            document.getElementById(isGroup ? 'trackerConfig' : 'dmTrackerConfig').style.display = 'none';
            showTimer(type); showError('errorMsg', 'Tracker already active');
            startTrackerStatusUpdates(type);
        } else { showError('errorMsg', d.error || 'Failed'); switchEl.checked = false; }
    } catch (e) { showError('errorMsg', 'Failed'); switchEl.checked = false; } finally { switchEl.disabled = false; }
}

async function stopTracker(type) {
    const switchEl = document.getElementById(type === 'group' ? 'trackerSwitch' : 'dmTrackerSwitch');
    switchEl.disabled = true;
    try {
        const r = await fetch(`${API_URL}/tracker/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify({ session: sessionString }) });
        const d = await r.json();
        if (d.success) {
            if (type === 'group') trackerRunning = false; else dmTrackerRunning = false;
            showSuccess(`${type === 'group' ? 'Group' : 'DM'} tracker stopped. Total: ${d.stats.total_dice}, Deleted: ${d.stats.deleted}`);
            updateTrackerUI(false, type);
            document.getElementById(type === 'group' ? 'trackerConfig' : 'dmTrackerConfig').style.display = 'block';
            stopTrackerTimer();
            stopTrackerStatusUpdates();
        } else { showError('errorMsg', d.error || 'Failed'); switchEl.checked = true; }
    } catch (e) { showError('errorMsg', 'Failed'); switchEl.checked = true; } finally { switchEl.disabled = false; }
}

async function checkTrackerStatus() {
    try {
        const r = await fetch(`${API_URL}/tracker/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify({ session: sessionString }) });
        const d = await r.json();
        if (d.success && d.running) {
            const chatId = d.chat_id || '';
            const savedDmTracker = localStorage.getItem('dm_tracker_user_id') || '';
            let type = (chatId === savedDmTracker) ? 'dm' : 'group';
            if (type === 'dm') {
                dmTrackerRunning = true;
                document.getElementById('dmTrackerSwitch').checked = true;
                updateTrackerUI(true, 'dm');
                document.getElementById('dmTrackerConfig').style.display = 'none';
            } else {
                trackerRunning = true;
                document.getElementById('trackerSwitch').checked = true;
                updateTrackerUI(true, 'group');
                document.getElementById('trackerConfig').style.display = 'none';
            }
            const limitText = d.deletion_limit === null ? 'Keep first, delete rest' : d.deletion_limit === 0 ? 'Never delete' : `Delete ${d.deletion_limit}x`;
            if (type === 'group') { document.getElementById('trackerChatId').textContent = d.chat_id || '-'; document.getElementById('trackerBadValues').textContent = d.bad_values ? d.bad_values.join(', ') : '-'; document.getElementById('trackerDeletionLimit').textContent = limitText; document.getElementById('trackerReplaceUntilGood').textContent = d.replace_until_good ? 'Yes' : 'No'; }
            else { document.getElementById('dmTrackerUserId').textContent = d.chat_id || '-'; document.getElementById('dmTrackerBadValues').textContent = d.bad_values ? d.bad_values.join(', ') : '-'; document.getElementById('dmTrackerDeletionLimit').textContent = limitText; document.getElementById('dmTrackerReplaceUntilGood').textContent = d.replace_until_good ? 'Yes' : 'No'; }
            if (d.stats) updateTrackerStats(d.stats, type);
            if (d.time_remaining !== undefined && d.time_remaining > 0) { trackerTimeRemaining = Math.floor(d.time_remaining); activeTrackerType = type; showTimer(type); updateTimerDisplay(type); if (!trackerTimerInterval) trackerTimerInterval = setInterval(() => { trackerTimeRemaining--; updateTimerDisplay(activeTrackerType); if (trackerTimeRemaining <= 0) handleTrackerExpiry(activeTrackerType); }, 1000); }
            else startTrackerTimer(type);
            startTrackerStatusUpdates(type);
        } else { trackerRunning = false; dmTrackerRunning = false; document.getElementById('trackerSwitch').checked = false; document.getElementById('dmTrackerSwitch').checked = false; updateTrackerUI(false, 'group'); updateTrackerUI(false, 'dm'); document.getElementById('trackerConfig').style.display = 'block'; document.getElementById('dmTrackerConfig').style.display = 'block'; hideTimer(); }
    } catch (e) { hideTimer(); }
}

function updateTrackerUI(running, type) {
    const isGroup = type === 'group';
    const statusBox = document.getElementById(isGroup ? 'trackerStatusBox' : 'dmTrackerStatusBox');
    const statsBox = document.getElementById(isGroup ? 'trackerStats' : 'dmTrackerStats');
    const statusText = document.getElementById(isGroup ? 'trackerStatusText' : 'dmTrackerStatusText');
    const logContainer = document.getElementById(isGroup ? 'activityLogContainer' : 'dmActivityLogContainer');
    if (running) { statusBox.style.display = 'block'; statsBox.style.display = 'grid'; logContainer.style.display = 'block'; statusText.textContent = 'Running'; statusText.style.color = isGroup ? '#10b981' : '#8b5cf6'; }
    else { statusBox.style.display = 'none'; statsBox.style.display = 'none'; logContainer.style.display = 'none'; updateTrackerStats({ total_dice: 0, deleted: 0, kept: 0, duration_seconds: 0 }, type); clearActivityLog(type); }
}

function updateTrackerStats(stats, type) {
    const prefix = type === 'group' ? 'stat' : 'dmStat';
    document.getElementById(prefix + 'TotalDice').textContent = stats.total_dice || 0;
    document.getElementById(prefix + 'Deleted').textContent = stats.deleted || 0;
    document.getElementById(prefix + 'Kept').textContent = stats.kept || 0;
    document.getElementById(prefix + 'Duration').textContent = `${stats.duration_seconds || 0}s`;
}

function startTrackerStatusUpdates(type) {
    if (trackerStatusInterval) clearInterval(trackerStatusInterval);
    trackerStatusInterval = setInterval(async () => {
        if (!trackerRunning && !dmTrackerRunning) { stopTrackerStatusUpdates(); return; }
        try {
            const r = await fetch(`${API_URL}/tracker/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify({ session: sessionString }) });
            const d = await r.json();
            if (d.success && d.running && d.stats) {
                updateTrackerStats(d.stats, activeTrackerType || type);
                if (d.time_remaining !== undefined && Math.abs(Math.floor(d.time_remaining) - trackerTimeRemaining) > 5) { trackerTimeRemaining = Math.floor(d.time_remaining); updateTimerDisplay(activeTrackerType || type); }
                if (d.activity_log && d.activity_log.length > 0) {
                    const logs = d.activity_log.map(l => ({ timestamp: new Date(l.timestamp * 1000).toLocaleTimeString(), dice: l.dice, action: l.action, reason: l.reason })).reverse();
                    if (activeTrackerType === 'group' || type === 'group') activityLogs = logs; else dmActivityLogs = logs;
                    renderActivityLog(activeTrackerType || type);
                }
            } else if (d.success && !d.running) {
                const t = activeTrackerType || type;
                if (t === 'group') { trackerRunning = false; document.getElementById('trackerSwitch').checked = false; document.getElementById('trackerConfig').style.display = 'block'; }
                else { dmTrackerRunning = false; document.getElementById('dmTrackerSwitch').checked = false; document.getElementById('dmTrackerConfig').style.display = 'block'; }
                updateTrackerUI(false, t); stopTrackerStatusUpdates(); stopTrackerTimer(); showSuccess('Tracker stopped.');
            }
        } catch (e) {}
    }, 5000);
}

function stopTrackerStatusUpdates() { if (trackerStatusInterval) { clearInterval(trackerStatusInterval); trackerStatusInterval = null; } }

// ============================================
// ACTIVITY LOG
// ============================================
function renderActivityLog(type) {
    const logs = type === 'group' ? activityLogs : dmActivityLogs;
    const container = document.getElementById(type === 'group' ? 'activityLog' : 'dmActivityLog');
    if (logs.length === 0) { container.innerHTML = ''; return; }
    let html = '';
    logs.forEach(log => {
        let cls = log.action === 'kept' ? (type === 'group' ? 'kept' : 'dm-kept') : log.action === 'system' ? 'system' : (type === 'group' ? 'deleted' : 'dm-deleted');
        let icon = log.action === 'kept' ? '✓' : log.action === 'system' ? '⚙️' : '✗';
        let text = log.action === 'kept' ? 'Kept' : log.action === 'system' ? 'System' : 'Deleted';
        html += `<div class="log-entry ${cls}"><span class="time">${log.timestamp}</span><span class="dice-icon">${log.action === 'system' ? '' : '🎲'} ${log.dice}</span><strong>${icon} ${text}</strong><div class="reason">${log.reason}</div></div>`;
    });
    html += `<button class="log-clear-btn" onclick="clearActivityLog('${type}')">Clear Log</button>`;
    container.innerHTML = html;
}

function clearActivityLog(type) { if (type === 'group') activityLogs = []; else dmActivityLogs = []; renderActivityLog(type); }

// ============================================
// UI HELPERS
// ============================================
function hideAllMessages() { document.querySelectorAll('.error-msg, .success-msg').forEach(m => m.classList.remove('show')); }

function showSuccess(msg) { hideAllMessages(); const el = document.getElementById('successMsg'); el.textContent = msg; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 5000); }

function showError(id, msg) { hideAllMessages(); const el = document.getElementById(id); el.textContent = msg; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 5000); }

function setButtonLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    const txt = document.getElementById(btnId + 'Text');
    if (isLoading) { btn.disabled = true; txt.innerHTML = '<span class="loading"></span>Loading...'; }
    else { btn.disabled = false; const labels = { loginBtn: 'Login with Telegram', verifyBtn: 'Verify OTP', passwordBtn: 'Verify Password', sendDiceBtn: '🎲 Send Dice', sendDmDiceBtn: '💬 Send Dice to DM' }; txt.textContent = labels[btnId]; }
}

// ============================================
// INITIALIZE
// ============================================
init();
