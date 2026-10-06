/**
 * WebBridge MCP — Modern Control Plane Dashboard Application
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────
  const state = {
    authRequired: false,
    authenticated: false,
    activeTab: 'overview',
    overview: null,
    tabs: [],
    settings: [],
    settingsMeta: null,
    pendingSettings: {},
    env: { custom: [], runtime: [] },
    pendingEnv: {},
    storage: null,
    tools: [],
    logs: {
      source: null,
      entries: [],
      paused: false,
      autoScroll: true,
      filterLevel: 'all',
      filterCat: 'all',
      search: '',
      files: [],
      activeFile: null,
    },
    autoRefreshTimer: null,
    autoRefreshInterval: 5000,
  };

  // ── Helpers ────────────────────────────────────────────────
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatDuration(seconds) {
    if (seconds < 0) return 'Unknown';
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <div style="flex:1;">${escapeHtml(message)}</div>
      <button class="btn btn-sm btn-secondary" style="padding:2px 6px;" aria-label="Close">&times;</button>
    `;
    el.querySelector('button').onclick = () => el.remove();
    container.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 4000);
  }

  async function api(path, options = {}) {
    const url = `/dashboard/api${path}`;
    const opts = {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    };
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      opts.body = JSON.stringify(opts.body);
    }
    // Fastify throws FST_ERR_CTP_EMPTY_JSON_BODY if Content-Type is application/json but body is empty
    if (!opts.body) {
      delete opts.headers['Content-Type'];
    }
    try {
      const res = await fetch(url, opts);
      if (res.status === 401) {
        state.authenticated = false;
        showLogin();
        throw new Error('Unauthorized');
      }
      const data = await res.json();
      if (!res.ok || (data.ok === false)) {
        throw new Error(data.error || 'Request failed');
      }
      return data;
    } catch (err) {
      if (err.message !== 'Unauthorized') {
        console.error(`API [${path}] error:`, err);
      }
      throw err;
    }
  }

  // ── Modal Helper with Light-Dismiss Fallback ───────────────
  function openModal(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    // Modern web guidance fallback for <dialog closedby="any">
    if (!dialog._dismissSetup) {
      dialog._dismissSetup = true;
      dialog.addEventListener('click', (e) => {
        if (e.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isInDialog = (
          rect.top <= e.clientY &&
          e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX &&
          e.clientX <= rect.left + rect.width
        );
        if (!isInDialog) dialog.close();
      });
    }
  }

  function closeModal(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  window.openModal = openModal;
  window.closeModal = closeModal;

  // ── Authentication ─────────────────────────────────────────
  async function checkSession() {
    try {
      const data = await api('/session');
      state.authRequired = data.authRequired;
      state.authenticated = data.authenticated;
      if (data.authRequired && !data.authenticated) {
        showLogin();
      } else {
        hideLogin();
        initApp();
      }
    } catch (e) {
      showLogin();
    }
  }

  function showLogin() {
    const el = document.getElementById('loginOverlay');
    if (el) el.style.display = 'flex';
  }

  function hideLogin() {
    const el = document.getElementById('loginOverlay');
    if (el) el.style.display = 'none';
  }

  async function handleLogin(e) {
    e.preventDefault();
    const input = document.getElementById('loginPassword');
    const errEl = document.getElementById('loginError');
    const btn = document.getElementById('loginSubmitBtn');
    errEl.textContent = '';
    btn.disabled = true;
    try {
      await api('/login', { method: 'POST', body: { password: input.value } });
      input.value = '';
      state.authenticated = true;
      hideLogin();
      toast('Logged in successfully', 'success');
      initApp();
    } catch (err) {
      errEl.textContent = err.message || 'Login failed';
    } finally {
      btn.disabled = false;
    }
  }

  async function handleLogout() {
    try {
      await api('/logout', { method: 'POST' });
    } catch {}
    state.authenticated = false;
    showLogin();
  }

  // ── Navigation ─────────────────────────────────────────────
  function setupNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.target;
        switchView(target);
      });
    });

    // Hash sync
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && document.getElementById(`view-${hash}`)) {
        switchView(hash, false);
      }
    });

    const initial = window.location.hash.replace('#', '') || 'overview';
    if (document.getElementById(`view-${initial}`)) {
      switchView(initial, false);
    }
  }

  function switchView(viewName, updateHash = true) {
    state.activeTab = viewName;
    if (updateHash) window.location.hash = viewName;

    document.querySelectorAll('.nav-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.target === viewName);
    });

    document.querySelectorAll('.view-section').forEach((sec) => {
      sec.classList.toggle('active', sec.id === `view-${viewName}`);
    });

    // Refresh view specific data
    refreshCurrentView();
  }

  function refreshCurrentView() {
    loadOverview();
    switch (state.activeTab) {
      case 'overview':
        break;
      case 'tabs':
        loadTabs();
        break;
      case 'logs':
        loadLogFiles();
        break;
      case 'settings':
        loadSettings();
        break;
      case 'env':
        loadEnv();
        break;
      case 'tools':
        loadTools();
        break;
      case 'storage':
        loadStorage();
        break;
    }
  }

  // ── Overview View ──────────────────────────────────────────
  async function loadOverview() {
    try {
      const data = await api('/overview');
      state.overview = data;
      renderOverview(data);
      updateHeaderStrip(data);
    } catch (e) {}
  }

  function updateHeaderStrip(data) {
    const { browser, system, storage, connections } = data;
    
    // Header pills
    const dot = document.getElementById('headerStatusDot');
    const browserText = document.getElementById('headerBrowserText');
    if (browser.connected) {
      dot.className = 'status-dot active';
      browserText.textContent = `Browser Online · ${browser.tabCount} tab${browser.tabCount === 1 ? '' : 's'}`;
    } else {
      dot.className = 'status-dot';
      browserText.textContent = 'Browser Idle';
    }

    const cpuMem = document.getElementById('headerCpuMem');
    if (cpuMem) {
      const memRss = formatBytes(system.memory.rss);
      cpuMem.textContent = `CPU ${system.cpuPercent}% · RSS ${memRss}`;
    }

    const storagePill = document.getElementById('headerStorage');
    if (storagePill) {
      storagePill.textContent = `Data: ${formatBytes(storage.totalBytes)}`;
    }

    // Nav badges
    const tabsBadge = document.getElementById('navTabsBadge');
    if (tabsBadge) tabsBadge.textContent = browser.tabCount;
  }

  function renderOverview(data) {
    const { system, browser, metrics, storage, warnings } = data;

    // Warnings Banner
    const warnContainer = document.getElementById('overviewWarnings');
    if (warnContainer) {
      if (warnings && warnings.length > 0) {
        warnContainer.innerHTML = warnings.map(w => `
          <div class="alert-banner ${w.level}">
            <div><strong>${w.level.toUpperCase()}:</strong> ${escapeHtml(w.message)}</div>
          </div>
        `).join('');
      } else {
        warnContainer.innerHTML = '';
      }
    }

    // Top Stat Cards
    document.getElementById('statCalls').textContent = metrics.session.calls.toLocaleString();
    document.getElementById('statErrors').textContent = metrics.session.errors.toLocaleString();
    document.getElementById('statCpu').textContent = `${system.cpuPercent}%`;
    document.getElementById('statMemRss').textContent = formatBytes(system.memory.rss);
    document.getElementById('statTabCount').textContent = browser.tabCount;
    document.getElementById('statStorageUsed').textContent = formatBytes(storage.totalBytes);

    // Browser Status Card
    const browserCard = document.getElementById('overviewBrowserDetails');
    if (browserCard) {
      browserCard.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:0.6rem;">
          <div style="display:flex; justify-content:space-between;">
            <span class="text-muted">Status:</span>
            <span class="badge ${browser.connected ? 'badge-success' : 'badge-info'}">
              ${browser.connected ? 'Connected' : 'Idle (Launches on demand)'}
            </span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span class="text-muted">Chromium Version:</span>
            <span>${escapeHtml(browser.version || 'Chromium bundled')}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span class="text-muted">Active Tabs:</span>
            <strong>${browser.tabCount}</strong>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span class="text-muted">Restarts:</span>
            <span>${browser.restarts}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span class="text-muted">Idle Tab Cleanup:</span>
            <span class="badge ${browser.idleCleanup ? 'badge-success' : 'badge-warning'}">
              ${browser.idleCleanup ? 'Active' : 'Disabled'}
            </span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span class="text-muted">Stored Cookies:</span>
            <span>${browser.storedCookies} in memory</span>
          </div>
        </div>
      `;
    }

    // System Environment Card
    const sysCard = document.getElementById('overviewSystemDetails');
    if (sysCard) {
      sysCard.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:0.6rem;">
          <div style="display:flex; justify-content:space-between;">
            <span class="text-muted">Data Volume (/app/data):</span>
            <span class="badge ${storage.persistentMount ? 'badge-success' : 'badge-warning'}">
              ${storage.persistentMount ? 'Persistent Volume Mounted' : 'Local / Ephemeral Directory'}
            </span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span class="text-muted">Storage Path:</span>
            <code style="font-size:0.78rem;">${escapeHtml(storage.dataDir)}</code>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span class="text-muted">Platform:</span>
            <span>${escapeHtml(system.platform)}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span class="text-muted">Node.js Runtime:</span>
            <span>${escapeHtml(system.node)}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span class="text-muted">Containerized:</span>
            <span>${system.containerized ? 'Yes (Docker / Coolify)' : 'No (Host)'}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span class="text-muted">Uptime:</span>
            <span>${formatDuration(Math.floor(system.uptime))}</span>
          </div>
        </div>
      `;
    }

    // Top Tools Table
    const toolsTbody = document.getElementById('overviewTopTools');
    if (toolsTbody) {
      if (metrics.topTools && metrics.topTools.length > 0) {
        toolsTbody.innerHTML = metrics.topTools.map(t => `
          <tr>
            <td><code>${escapeHtml(t.name)}</code></td>
            <td><strong>${t.calls}</strong></td>
            <td><span class="${t.errors > 0 ? 'text-danger' : 'text-muted'}">${t.errors}</span></td>
            <td>${t.avgMs}ms</td>
            <td>${t.maxMs}ms</td>
          </tr>
        `).join('');
      } else {
        toolsTbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;">No tool calls recorded yet</td></tr>`;
      }
    }

    // Recent Activity Table
    const recentTbody = document.getElementById('overviewRecentCalls');
    if (recentTbody) {
      if (metrics.recent && metrics.recent.length > 0) {
        recentTbody.innerHTML = metrics.recent.map(r => `
          <tr>
            <td><span class="badge ${r.ok ? 'badge-success' : 'badge-danger'}">${r.ok ? 'OK' : 'ERR'}</span></td>
            <td><code>${escapeHtml(r.tool)}</code></td>
            <td><span class="badge badge-info">${escapeHtml(r.source)}</span></td>
            <td>${r.ms}ms</td>
            <td class="text-muted">${new Date(r.ts).toLocaleTimeString()}</td>
          </tr>
        `).join('');
      } else {
        recentTbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;">No recent activity</td></tr>`;
      }
    }
  }

  // ── Browser Tabs View ──────────────────────────────────────
  async function loadTabs() {
    try {
      const data = await api('/tabs');
      state.tabs = data.tabs || [];
      renderTabs(data);
      updatePlaygroundTabSelect();
    } catch (e) {
      toast('Failed to load browser tabs: ' + e.message, 'error');
    }
  }

  function renderTabs(data) {
    const grid = document.getElementById('tabsGrid');
    const countEl = document.getElementById('tabsTotalCount');
    if (countEl) countEl.textContent = `${data.tabs.length} Tab${data.tabs.length === 1 ? '' : 's'}`;

    if (!data.tabs || data.tabs.length === 0) {
      grid.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem;">
          <h3 style="color:var(--text-muted); margin-bottom: 0.5rem;">No Browser Tabs Open</h3>
          <p class="text-muted" style="font-size:0.85rem; margin-bottom: 1.25rem;">The browser will automatically launch and open a tab when an automation request arrives.</p>
          <div style="display:flex; justify-content:center; gap:0.75rem;">
            <button class="btn btn-primary" onclick="openNewTabDialog()">Open New Tab</button>
            <button class="btn btn-secondary" onclick="launchBrowser()">Launch Chromium</button>
          </div>
        </div>
      `;
      return;
    }

    grid.innerHTML = data.tabs.map(t => `
      <div class="tab-card ${t.active ? 'active-tab' : ''}" id="tabCard-${t.index}">
        <div class="tab-card-header">
          <div style="display:flex; align-items:center; gap:0.5rem; overflow:hidden;">
            <span class="tab-index-badge">#${t.index}</span>
            ${t.name ? `<span class="badge badge-purple" title="Friendly tab alias">${escapeHtml(t.name)}</span>` : ''}
            ${t.active ? '<span class="badge badge-success">Active</span>' : ''}
          </div>
          <button class="btn btn-sm btn-danger" onclick="closeTab(${t.index})" title="Close Tab">&times;</button>
        </div>

        <div class="tab-card-body">
          <div class="tab-title-text" title="${escapeHtml(t.title || '(Untitled)')}">
            ${escapeHtml(t.title || '(Untitled Page)')}
          </div>
          <div class="tab-url-text" title="${escapeHtml(t.url)}">
            ${escapeHtml(t.url)}
          </div>
          <div class="tab-meta-row">
            <span>Idle: ${t.idleSeconds >= 0 ? formatDuration(t.idleSeconds) : 'Active'}</span>
            <span>·</span>
            <span>Host: ${escapeHtml(t.host || 'local')}</span>
          </div>
        </div>

        <div class="tab-card-actions">
          <div style="display:flex; gap:0.4rem;">
            ${!t.active ? `<button class="btn btn-sm btn-primary" onclick="activateTab(${t.index})">Switch To</button>` : ''}
            <button class="btn btn-sm btn-secondary" onclick="previewTabScreenshot(${t.index})">Preview</button>
            <button class="btn btn-sm btn-secondary" onclick="reloadTab(${t.index})">Reload</button>
          </div>
          <div style="display:flex; gap:0.4rem;">
            <button class="btn btn-sm btn-secondary" onclick="targetTabInPlayground(${t.index}, '${escapeHtml(t.name || '')}')" title="Target this tab in Tools Playground">In Tools</button>
            <button class="btn btn-sm btn-secondary" onclick="renameTabDialog(${t.index}, '${escapeHtml(t.name || '')}')">Alias</button>
            <button class="btn btn-sm btn-secondary" onclick="navigateTabDialog(${t.index}, '${escapeHtml(t.url)}')">Go</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  window.activateTab = async function (index) {
    try {
      await api(`/tabs/${index}/activate`, { method: 'POST' });
      toast(`Tab #${index} is now active`, 'success');
      loadTabs();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  window.closeTab = async function (index) {
    try {
      await api(`/tabs/${index}`, { method: 'DELETE' });
      toast(`Tab #${index} closed`, 'info');
      loadTabs();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  window.closeOtherTabs = async function () {
    if (!confirm('Close all tabs except the currently active tab?')) return;
    try {
      const res = await api('/tabs/close-others', { method: 'POST' });
      toast(`Closed ${res.closed} background tabs`, 'success');
      loadTabs();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  window.reloadTab = async function (index) {
    try {
      await api(`/tabs/${index}/reload`, { method: 'POST' });
      toast(`Tab #${index} reloaded`, 'success');
      loadTabs();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  window.launchBrowser = async function () {
    try {
      toast('Launching Chromium...', 'info');
      await api('/browser/launch', { method: 'POST' });
      toast('Browser launched', 'success');
      loadTabs();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  window.restartBrowser = async function () {
    if (!confirm('Restart browser engine? All open tabs will be closed and Chromium will cleanly relaunch with fresh settings.')) return;
    try {
      await api('/browser/restart', { method: 'POST' });
      toast('Browser engine restarted successfully', 'success');
      loadTabs();
      loadOverview();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  window.previewTabScreenshot = function (index) {
    const img = document.getElementById('screenshotPreviewImg');
    const modal = document.getElementById('screenshotModal');
    const caption = document.getElementById('screenshotCaption');
    if (!img || !modal) return;
    img.src = '';
    caption.textContent = `Tab #${index} — Capturing live screenshot...`;
    openModal('screenshotModal');
    img.src = `/dashboard/api/tabs/${index}/screenshot?t=${Date.now()}`;
    img.onload = () => {
      caption.textContent = `Tab #${index} — Live Screenshot Preview`;
    };
    img.onerror = () => {
      caption.textContent = `Tab #${index} — Failed to capture screenshot (tab closed or navigating)`;
    };
  };

  window.openNewTabDialog = function () {
    document.getElementById('newTabUrl').value = 'https://example.com';
    document.getElementById('newTabName').value = '';
    openModal('newTabModal');
  };

  window.submitNewTab = async function (e) {
    e.preventDefault();
    const url = document.getElementById('newTabUrl').value.trim();
    const name = document.getElementById('newTabName').value.trim();
    try {
      await api('/tabs', { method: 'POST', body: { url, name } });
      closeModal('newTabModal');
      toast('New tab opened', 'success');
      loadTabs();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  window.renameTabDialog = function (index, currentName) {
    document.getElementById('renameTabIndex').value = index;
    document.getElementById('renameTabName').value = currentName || '';
    openModal('renameTabModal');
  };

  window.submitRenameTab = async function (e) {
    e.preventDefault();
    const index = document.getElementById('renameTabIndex').value;
    const name = document.getElementById('renameTabName').value.trim();
    try {
      await api(`/tabs/${index}/rename`, { method: 'POST', body: { name: name || null } });
      closeModal('renameTabModal');
      toast(`Tab #${index} alias updated`, 'success');
      loadTabs();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  window.navigateTabDialog = function (index, currentUrl) {
    document.getElementById('navigateTabIndex').value = index;
    document.getElementById('navigateTabUrl').value = currentUrl || 'https://';
    openModal('navigateTabModal');
  };

  window.submitNavigateTab = async function (e) {
    e.preventDefault();
    const index = document.getElementById('navigateTabIndex').value;
    const url = document.getElementById('navigateTabUrl').value.trim();
    try {
      await api(`/tabs/${index}/navigate`, { method: 'POST', body: { url } });
      closeModal('navigateTabModal');
      toast(`Navigating Tab #${index}...`, 'info');
      loadTabs();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  // ── Live Logs & Storage Viewer ─────────────────────────────
  function setupLogsStream() {
    if (state.logs.source) {
      state.logs.source.close();
    }
    const source = new EventSource('/dashboard/api/logs/stream');
    state.logs.source = source;

    source.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data);
        state.logs.entries.push(entry);
        if (state.logs.entries.length > 2000) {
          state.logs.entries.shift();
        }
        if (!state.logs.paused && !state.logs.activeFile) {
          appendLogEntry(entry);
        }
      } catch (e) {}
    };

    source.onerror = () => {
      // Reconnect automatically handled by browser
    };
  }

  async function loadLogFiles() {
    try {
      const data = await api('/logs/files');
      state.logs.files = data.files || [];
      renderLogFiles(data);
      
      // Also fetch initial recent logs if terminal is empty
      if (state.logs.entries.length === 0) {
        const recent = await api('/logs?limit=300');
        state.logs.entries = recent.entries || [];
        renderAllLogs();
      }
    } catch (e) {}
  }

  function renderLogFiles(data) {
    const listEl = document.getElementById('logFilesList');
    const totalEl = document.getElementById('logFilesTotalSize');
    if (totalEl) totalEl.textContent = formatBytes(data.totalBytes);

    if (!listEl) return;
    if (!data.files || data.files.length === 0) {
      listEl.innerHTML = `<div class="text-muted" style="font-size:0.8rem; padding:0.5rem 0;">No log files on disk</div>`;
      return;
    }

    listEl.innerHTML = data.files.map(f => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:0.4rem 0; border-bottom:1px solid rgba(255,255,255,0.03);">
        <div>
          <a href="javascript:void(0)" onclick="viewLogFile('${escapeHtml(f.name)}')">
            <code style="font-size:0.8rem;">${escapeHtml(f.name)}</code>
          </a>
          <div style="font-size:0.72rem; color:var(--text-dim);">${formatBytes(f.size)} ${f.active ? '· <span style="color:var(--accent-emerald);">Writing Active</span>' : ''}</div>
        </div>
        <div style="display:flex; gap:0.3rem;">
          <a class="btn btn-sm btn-secondary" href="/dashboard/api/logs/files/${encodeURIComponent(f.name)}?download=1" download title="Download JSONL">DL</a>
          <button class="btn btn-sm btn-danger" onclick="deleteLogFile('${escapeHtml(f.name)}')">&times;</button>
        </div>
      </div>
    `).join('');
  }

  window.viewLogFile = async function (name) {
    state.logs.activeFile = name;
    document.getElementById('logsStreamIndicator').textContent = `File: ${name}`;
    try {
      const res = await api(`/logs/files/${encodeURIComponent(name)}?limit=1000`);
      const terminal = document.getElementById('logsTerminal');
      terminal.innerHTML = '';
      (res.entries || []).forEach(appendLogEntry);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  window.returnToLiveLogs = function () {
    state.logs.activeFile = null;
    document.getElementById('logsStreamIndicator').textContent = 'Live Stream';
    renderAllLogs();
  };

  window.deleteLogFile = async function (name) {
    if (!confirm(`Delete log file ${name} to free storage?`)) return;
    try {
      await api(`/logs/files/${encodeURIComponent(name)}`, { method: 'DELETE' });
      toast(`Deleted log file ${name}`, 'success');
      loadLogFiles();
      loadStorage();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  window.deleteAllLogs = async function () {
    if (!confirm('DELETE ALL LOG FILES from storage? This cannot be undone and will immediately reclaim disk space.')) return;
    try {
      const res = await api('/logs', { method: 'DELETE' });
      toast(`Deleted ${res.deleted} log file(s). Storage optimized.`, 'success');
      state.logs.entries = [];
      document.getElementById('logsTerminal').innerHTML = '';
      loadLogFiles();
      loadStorage();
      loadOverview();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  window.pruneLogs = async function () {
    try {
      const res = await api('/logs/prune', { method: 'POST' });
      toast(`Pruning complete. Deleted: ${res.deleted.length} expired file(s)`, 'info');
      loadLogFiles();
      loadStorage();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  window.clearLogsTerminal = function () {
    state.logs.entries = [];
    document.getElementById('logsTerminal').innerHTML = '';
    api('/logs/clear-memory', { method: 'POST' }).catch(() => {});
  };

  window.togglePauseLogs = function () {
    state.logs.paused = !state.logs.paused;
    const btn = document.getElementById('btnPauseLogs');
    if (btn) btn.textContent = state.logs.paused ? 'Resume' : 'Pause';
  };

  window.toggleAutoScroll = function () {
    state.logs.autoScroll = !state.logs.autoScroll;
    const btn = document.getElementById('btnAutoScroll');
    if (btn) btn.classList.toggle('btn-primary', state.logs.autoScroll);
  };

  function appendLogEntry(entry) {
    // Check filters
    if (state.logs.filterLevel !== 'all' && entry.level.toLowerCase() !== state.logs.filterLevel.toLowerCase()) return;
    if (state.logs.filterCat !== 'all' && entry.cat !== state.logs.filterCat) return;
    if (state.logs.search) {
      const q = state.logs.search.toLowerCase();
      const match = entry.msg.toLowerCase().includes(q) || (entry.meta && JSON.stringify(entry.meta).toLowerCase().includes(q));
      if (!match) return;
    }

    const terminal = document.getElementById('logsTerminal');
    if (!terminal) return;

    const row = document.createElement('div');
    row.className = 'log-entry-row';
    const time = new Date(entry.ts).toLocaleTimeString();
    const lvl = (entry.level || 'info').toUpperCase();
    const metaStr = entry.meta ? escapeHtml(JSON.stringify(entry.meta)) : '';

    row.innerHTML = `
      <span class="log-time">${time}</span>
      <span class="log-level ${lvl}">${lvl}</span>
      <span class="log-cat">[${escapeHtml(entry.cat)}]</span>
      <span class="log-msg">${escapeHtml(entry.msg)}</span>
      ${metaStr ? `<span class="log-meta">${metaStr}</span>` : ''}
    `;

    terminal.appendChild(row);

    if (state.logs.autoScroll) {
      terminal.scrollTop = terminal.scrollHeight;
    }
  }

  function renderAllLogs() {
    const terminal = document.getElementById('logsTerminal');
    if (!terminal) return;
    terminal.innerHTML = '';
    state.logs.entries.forEach(appendLogEntry);
  }

  function setupLogFilters() {
    const levelSelect = document.getElementById('logLevelFilter');
    if (levelSelect) {
      levelSelect.onchange = () => {
        state.logs.filterLevel = levelSelect.value;
        renderAllLogs();
      };
    }
    const searchInput = document.getElementById('logSearchInput');
    if (searchInput) {
      searchInput.oninput = () => {
        state.logs.search = searchInput.value.trim();
        renderAllLogs();
      };
    }
  }

  // ── Settings View ──────────────────────────────────────────
  async function loadSettings() {
    try {
      const data = await api('/settings');
      state.settings = data.settings || [];
      state.settingsMeta = data.meta;
      renderSettings(data.settings);
      checkPendingSettings();
    } catch (e) {
      toast('Failed to load settings: ' + e.message, 'error');
    }
  }

  function renderSettings(settings) {
    const container = document.getElementById('settingsContainer');
    if (!container) return;

    const groups = {
      server: { title: 'Server & Network', items: [] },
      security: { title: 'Security & Access', items: [] },
      browser: { title: 'Browser & Anti-Detection', items: [] },
      performance: { title: 'Performance & Concurrency', items: [] },
      logging: { title: 'Logging & Retention Policies', items: [] },
    };

    settings.forEach((s) => {
      if (groups[s.group]) groups[s.group].items.push(s);
    });

    container.innerHTML = Object.entries(groups).map(([groupId, group]) => `
      <div class="settings-group">
        <div class="settings-group-header">
          <span>${group.title}</span>
          <span class="badge badge-info">${group.items.length} items</span>
        </div>
        ${group.items.map(s => renderSettingRow(s)).join('')}
      </div>
    `).join('');
  }

  function renderSettingRow(s) {
    const isPending = s.key in state.pendingSettings;
    const curVal = isPending ? state.pendingSettings[s.key] : s.value;
    
    let inputHtml = '';
    if (s.readOnly) {
      inputHtml = `<input type="text" class="input input-code" value="${escapeHtml(curVal)}" readonly disabled />`;
    } else if (s.type === 'select') {
      inputHtml = `
        <select class="select" onchange="onSettingChange('${s.key}', this.value)">
          ${(s.options || []).map(opt => `
            <option value="${opt}" ${curVal === opt ? 'selected' : ''}>${opt}</option>
          `).join('')}
        </select>
      `;
    } else if (s.type === 'boolean') {
      inputHtml = `
        <select class="select" onchange="onSettingChange('${s.key}', this.value)">
          <option value="true" ${curVal === 'true' ? 'selected' : ''}>Enabled (true)</option>
          <option value="false" ${curVal === 'false' ? 'selected' : ''}>Disabled (false)</option>
        </select>
      `;
    } else if (s.type === 'number') {
      inputHtml = `
        <input type="number" class="input" value="${escapeHtml(curVal)}" min="${s.min ?? ''}" max="${s.max ?? ''}" oninput="onSettingChange('${s.key}', this.value)" />
      `;
    } else if (s.type === 'secret') {
      inputHtml = `
        <input type="password" class="input" value="${escapeHtml(curVal)}" placeholder="(secret)" oninput="onSettingChange('${s.key}', this.value)" autocomplete="off" />
      `;
    } else {
      inputHtml = `
        <input type="text" class="input" value="${escapeHtml(curVal)}" oninput="onSettingChange('${s.key}', this.value)" />
      `;
    }

    const sourceBadge = s.source === 'dashboard' 
      ? '<span class="badge badge-purple" title="Persisted override in /app/data/settings.json">Dashboard</span>'
      : s.source === 'environment'
      ? '<span class="badge badge-info" title="Configured via container env var">Env</span>'
      : '<span class="badge badge-warning" title="Default built-in value">Default</span>';

    const applyBadge = s.apply === 'live'
      ? '<span class="badge badge-success" title="Applies immediately without restart">Live</span>'
      : s.apply === 'browser'
      ? '<span class="badge badge-warning" title="Takes effect upon next browser launch/restart">Browser Restart</span>'
      : '<span class="badge badge-danger" title="Requires server/container restart">Server Restart</span>';

    return `
      <div class="setting-row" id="settingRow-${s.key}">
        <div>
          <div class="setting-label">
            ${escapeHtml(s.label)}
            ${s.readOnly ? '<span class="badge badge-info">Locked</span>' : ''}
          </div>
          <div class="setting-desc">${escapeHtml(s.description)}</div>
          <code style="font-size:0.75rem; color:var(--text-dim);">${escapeHtml(s.key)}</code>
        </div>
        <div class="setting-field">
          ${inputHtml}
          ${isPending ? `<div style="font-size:0.75rem; color:var(--accent-sky);">Pending change: "${escapeHtml(curVal)}"</div>` : ''}
        </div>
        <div class="setting-meta">
          ${sourceBadge}
          ${applyBadge}
          ${!s.readOnly && s.source === 'dashboard' ? `
            <button class="btn btn-sm btn-secondary" onclick="revertSetting('${s.key}')" title="Revert to environment/default" style="margin-top:0.25rem;">Revert</button>
          ` : ''}
        </div>
      </div>
    `;
  }

  window.onSettingChange = function (key, value) {
    const s = state.settings.find(x => x.key === key);
    if (!s) return;
    if (s.value === value) {
      delete state.pendingSettings[key];
    } else {
      state.pendingSettings[key] = value;
    }
    checkPendingSettings();
  };

  window.revertSetting = function (key) {
    state.pendingSettings[key] = null;
    checkPendingSettings();
  };

  function checkPendingSettings() {
    const bar = document.getElementById('saveChangesBar');
    const count = Object.keys(state.pendingSettings).length;
    if (!bar) return;
    if (count > 0) {
      bar.classList.add('visible');
      document.getElementById('pendingChangesCount').textContent = `${count} setting${count === 1 ? '' : 's'} modified`;
    } else {
      bar.classList.remove('visible');
    }
  }

  window.savePendingSettings = async function () {
    const keys = Object.keys(state.pendingSettings);
    if (keys.length === 0) return;
    try {
      const payload = { changes: { ...state.pendingSettings } };
      const res = await api('/settings', { method: 'PUT', body: payload });
      toast(`Saved ${res.changed.length} settings to /app/data/settings.json`, 'success');
      state.pendingSettings = {};
      checkPendingSettings();
      loadSettings();
      loadOverview();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  window.discardPendingSettings = function () {
    state.pendingSettings = {};
    checkPendingSettings();
    renderSettings(state.settings);
  };

  window.exportSettingsBackup = function () {
    window.location.href = '/dashboard/api/settings/export';
  };

  window.importSettingsBackup = async function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        const res = await api('/settings/import', { method: 'POST', body: json });
        toast(`Imported settings (${res.changed.length} updated)`, 'success');
        loadSettings();
      } catch (err) {
        toast('Failed to import: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };

  // ── Environment Variables View ─────────────────────────────
  async function loadEnv() {
    try {
      const data = await api('/env');
      state.env = data;
      renderEnv(data);
    } catch (e) {
      toast('Failed to load environment variables: ' + e.message, 'error');
    }
  }

  function renderEnv(data) {
    // Custom env overrides
    const customTbody = document.getElementById('customEnvTableBody');
    if (customTbody) {
      if (data.custom && data.custom.length > 0) {
        customTbody.innerHTML = data.custom.map(c => `
          <tr>
            <td><code>${escapeHtml(c.key)}</code></td>
            <td><code>${escapeHtml(c.value)}</code></td>
            <td><button class="btn btn-sm btn-danger" onclick="deleteCustomEnv('${escapeHtml(c.key)}')">&times;</button></td>
          </tr>
        `).join('');
      } else {
        customTbody.innerHTML = `<tr><td colspan="3" class="text-muted" style="text-align:center;">No custom environment overrides in /app/data/settings.json</td></tr>`;
      }
    }

    // Full runtime env table
    const runtimeTbody = document.getElementById('runtimeEnvTableBody');
    if (runtimeTbody) {
      runtimeTbody.innerHTML = (data.runtime || []).map(r => `
        <tr>
          <td><code>${escapeHtml(r.key)}</code></td>
          <td><code style="word-break:break-all;">${escapeHtml(r.value)}</code></td>
          <td>
            ${r.managed ? '<span class="badge badge-info">Managed Setting</span>' : ''}
            ${r.protected ? '<span class="badge badge-danger">Protected</span>' : ''}
          </td>
        </tr>
      `).join('');
    }
  }

  window.openAddEnvModal = function () {
    document.getElementById('addEnvKey').value = '';
    document.getElementById('addEnvValue').value = '';
    openModal('addEnvModal');
  };

  window.submitAddEnv = async function (e) {
    e.preventDefault();
    const key = document.getElementById('addEnvKey').value.trim();
    const value = document.getElementById('addEnvValue').value.trim();
    if (!key) return;
    try {
      await api('/env', { method: 'PUT', body: { changes: { [key]: value } } });
      closeModal('addEnvModal');
      toast(`Variable ${key} saved to /app/data`, 'success');
      loadEnv();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  window.deleteCustomEnv = async function (key) {
    if (!confirm(`Delete custom variable ${key}?`)) return;
    try {
      await api('/env', { method: 'PUT', body: { changes: { [key]: null } } });
      toast(`Variable ${key} removed`, 'info');
      loadEnv();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  // ── Storage & Maintenance View ─────────────────────────────
  async function loadStorage(refresh = false) {
    try {
      const data = await api(`/storage${refresh ? '?refresh=1' : ''}`);
      state.storage = data;
      renderStorage(data);
    } catch (e) {
      toast('Failed to load storage: ' + e.message, 'error');
    }
  }

  function renderStorage(data) {
    const { totalBytes, items, volume, persistentMount, dataDir } = data;

    document.getElementById('storageDataDir').textContent = dataDir;
    document.getElementById('storageMountStatus').innerHTML = persistentMount 
      ? '<span class="badge badge-success">Mounted Volume (Persistent across Coolify redeploys)</span>'
      : '<span class="badge badge-warning">Ephemeral Directory (Mount /app/data in Coolify)</span>';

    // Progress Bar Segments
    const bar = document.getElementById('storageProgressBar');
    if (bar && totalBytes > 0) {
      bar.innerHTML = items.filter(i => i.bytes > 0).map(i => {
        const pct = ((i.bytes / totalBytes) * 100).toFixed(1);
        return `<div class="storage-bar-seg seg-${i.id}" style="width: ${pct}%;" title="${escapeHtml(i.label)}: ${formatBytes(i.bytes)} (${pct}%)"></div>`;
      }).join('');
    }

    // Storage breakdown table
    const tbody = document.getElementById('storageItemsTbody');
    if (tbody) {
      tbody.innerHTML = items.map(item => `
        <tr>
          <td>
            <strong>${escapeHtml(item.label)}</strong>
            <div style="font-size:0.75rem; color:var(--text-dim);">${escapeHtml(item.description)}</div>
          </td>
          <td><code>${escapeHtml(item.path)}</code></td>
          <td><strong>${formatBytes(item.bytes)}</strong></td>
          <td>${item.files || '-'}</td>
          <td>
            ${item.clearable ? `
              <button class="btn btn-sm btn-danger" onclick="clearStorageTarget('${item.id}', '${escapeHtml(item.label)}')">Clear</button>
            ` : '<span class="badge badge-info">System</span>'}
          </td>
        </tr>
      `).join('');
    }

    // Volume disk usage
    if (volume) {
      const usedVol = volume.total - volume.free;
      document.getElementById('storageVolumeTotal').textContent = formatBytes(volume.total);
      document.getElementById('storageVolumeFree').textContent = formatBytes(volume.free);
      document.getElementById('storageVolumeUsed').textContent = formatBytes(usedVol);
    }
  }

  window.clearStorageTarget = async function (targetId, label) {
    if (!confirm(`Clear ${label}? This will remove associated files from /app/data to optimize storage.`)) return;
    try {
      await api('/storage/clear', { method: 'POST', body: { target: targetId } });
      toast(`${label} cleared successfully`, 'success');
      loadStorage(true);
      loadOverview();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  window.restartServer = async function () {
    if (!confirm('Restart WebBridge MCP Server? In Docker/Coolify, the container will cleanly restart.')) return;
    try {
      await api('/server/restart', { method: 'POST' });
      toast('Server restarting... Refresh in a few seconds.', 'warning');
      setTimeout(() => window.location.reload(), 3000);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // ── Tools Playground View ──────────────────────────────────
  async function loadTools() {
    try {
      const data = await api('/tools');
      state.tools = data.tools || [];
      renderTools(data.tools);
      if (!state.tabs || !state.tabs.length) {
        api('/tabs').then(t => { state.tabs = t.tabs || []; updatePlaygroundTabSelect(); }).catch(() => {});
      } else {
        updatePlaygroundTabSelect();
      }
    } catch (e) {
      toast('Failed to load tools: ' + e.message, 'error');
    }
  }

  function updatePlaygroundTabSelect() {
    const sel = document.getElementById('playgroundTabSelect');
    if (!sel) return;
    const currentVal = sel.value;
    const tabs = state.tabs || [];
    let opts = '<option value="">(Active Tab)</option>';
    for (const t of tabs) {
      const namePart = t.name ? ` "${t.name}"` : '';
      const activePart = t.active ? ' [Active]' : '';
      const label = `#${t.index}${namePart}${activePart} - ${t.host || 'tab'}`;
      const val = t.name ? t.name : `index:${t.index}`;
      opts += `<option value="${escapeHtml(val)}">${escapeHtml(label)}</option>`;
    }
    sel.innerHTML = opts;
    if (currentVal && Array.from(sel.options).some(o => o.value === currentVal)) {
      sel.value = currentVal;
    }
  }

  window.onPlaygroundTabChange = function (val) {
    const input = document.getElementById('toolArgsInput');
    if (!input) return;
    let args = {};
    try {
      args = JSON.parse(input.value || '{}');
    } catch {
      args = {};
    }
    delete args.tabName;
    delete args.tabIndex;
    if (val) {
      if (val.startsWith('index:')) {
        args.tabIndex = parseInt(val.slice(6), 10);
      } else {
        args.tabName = val;
      }
    }
    input.value = JSON.stringify(args, null, 2);
  };

  window.targetTabInPlayground = function (index, name) {
    switchView('tools');
    const sel = document.getElementById('playgroundTabSelect');
    if (sel) {
      sel.value = name || `index:${index}`;
      onPlaygroundTabChange(sel.value);
    }
    toast(`Targeting tab ${name ? `"${name}"` : `#${index}`} in playground`, 'info');
  };

  function renderTools(tools) {
    const list = document.getElementById('toolsList');
    if (!list) return;
    list.innerHTML = tools.map((t, idx) => `
      <div class="card" style="padding:1rem; cursor:pointer;" onclick="selectTool('${escapeHtml(t.name)}')">
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <code style="font-weight:700; color:var(--accent-sky);">${escapeHtml(t.name)}</code>
          ${t.stats ? `<span class="badge badge-info">${t.stats.calls} calls</span>` : ''}
        </div>
        <p class="text-muted" style="font-size:0.8rem; margin-top:0.3rem;">${escapeHtml(t.description)}</p>
      </div>
    `).join('');
  }

  window.selectTool = function (toolName) {
    const t = state.tools.find(x => x.name === toolName);
    if (!t) return;
    document.getElementById('selectedToolName').textContent = t.name;
    document.getElementById('selectedToolDesc').textContent = t.description;
    
    // Construct clean, minimal sample arguments
    const sample = {};
    if (toolName === 'browser_navigate') {
      sample.url = 'https://google.com';
      sample.tabName = 'google';
    } else if (toolName === 'browser_click') {
      sample.selector = 'button';
    } else if (toolName === 'browser_type') {
      sample.selector = 'input';
      sample.text = 'Hello World';
    } else if (toolName === 'browser_screenshot') {
      sample.fullPage = false;
    } else if (toolName === 'browser_new_tab') {
      sample.url = 'https://google.com';
      sample.tabName = 'google';
    } else if (toolName === 'browser_switch_tab') {
      sample.name = 'google';
    } else if (toolName === 'browser_set_tab_name') {
      sample.name = 'google';
    } else if (toolName === 'browser_evaluate') {
      sample.script = 'document.title';
    } else if (t.inputSchema && t.inputSchema.properties) {
      const required = new Set(t.inputSchema.required || []);
      for (const [k, p] of Object.entries(t.inputSchema.properties)) {
        if (required.size > 0 && !required.has(k)) continue;
        if (p.default !== undefined) sample[k] = p.default;
        else if (p.enum && p.enum.length) sample[k] = p.enum[0];
        else if (p.type === 'string') sample[k] = '';
        else if (p.type === 'number') sample[k] = 0;
        else if (p.type === 'boolean') sample[k] = false;
        else sample[k] = null;
      }
    }

    // Apply active playground tab selection if tool supports tab targeting
    const tabSel = document.getElementById('playgroundTabSelect');
    if (tabSel && tabSel.value && toolName !== 'browser_navigate' && toolName !== 'browser_new_tab') {
      if (tabSel.value.startsWith('index:')) {
        sample.tabIndex = parseInt(tabSel.value.slice(6), 10);
      } else {
        sample.tabName = tabSel.value;
      }
    }

    document.getElementById('toolArgsInput').value = JSON.stringify(sample, null, 2);
    document.getElementById('toolOutputPre').textContent = '// Output will appear here';
  };

  window.executeSelectedTool = async function () {
    const name = document.getElementById('selectedToolName').textContent;
    if (!name || name === 'Select a tool') {
      toast('Please select a tool first', 'warning');
      return;
    }
    const rawArgs = document.getElementById('toolArgsInput').value;
    let args = {};
    try {
      args = JSON.parse(rawArgs);
    } catch (e) {
      toast('Invalid JSON arguments: ' + e.message, 'error');
      return;
    }
    const pre = document.getElementById('toolOutputPre');
    pre.textContent = 'Executing...';
    try {
      const res = await api(`/tools/${encodeURIComponent(name)}/run`, { method: 'POST', body: args });
      pre.textContent = JSON.stringify(res.result || res, null, 2);
      if (res.success === false || res.result?.isError) {
        toast(res.error || 'Tool reported an error', 'warning');
      } else {
        toast(`Tool executed in ${res.ms}ms`, 'success');
      }
      loadOverview();
      api('/tabs').then(t => { state.tabs = t.tabs || []; updatePlaygroundTabSelect(); }).catch(() => {});
    } catch (e) {
      pre.textContent = `Error: ${e.message}`;
      toast(e.message, 'error');
    }
  };

  // ── Initialization ─────────────────────────────────────────
  function initApp() {
    setupNavigation();
    setupLogsStream();
    setupLogFilters();
    loadOverview();

    // Auto-refresh timer
    if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = setInterval(() => {
      refreshCurrentView();
    }, state.autoRefreshInterval);
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Login form binding
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    
    // Check initial authentication
    checkSession();
  });

  // Expose missing functions to window for inline onclick handlers
  window.handleLogout = handleLogout;
  window.switchView = switchView;
  window.loadTabs = loadTabs;

})();
