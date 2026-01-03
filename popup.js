document.addEventListener('DOMContentLoaded', () => {
  // ======== DOM ELEMENTS ========
  const urlInput = document.getElementById('url-input');
  const scanButton = document.getElementById('scan-button');
  const loadingIndicator = document.getElementById('loading-indicator');
  const errorMessage = document.getElementById('error-message');
  const filtersDiv = document.getElementById('filters');
  const videoListContainer = document.getElementById('video-list-container');
  const videoList = document.getElementById('video-list');
  const downloadButton = document.getElementById('download-button');
  const selectAllCheckbox = document.getElementById('select-all');
  const filenameFilter = document.getElementById('filename-filter');
  const extensionFilter = document.getElementById('extension-filter');
  const autoDownloadCheckbox = document.getElementById('auto-download');
  const autoDownloadGroup = document.getElementById('auto-download-group');
  const footer = document.querySelector('.footer');

  // ======== STATE ========
  let allVideos = [];
  let displayedVideos = [];

  // ======== UTILITY HELPERS ========
  const show = el => el && el.classList.remove('d-none');
  const hide = el => el && el.classList.add('d-none');

  const safeDecodeName = name => {
    if (!name) return '';
    try { return decodeURIComponent(name.replace(/\+/g, ' ')); } 
    catch { return name.replace(/\+/g, ' '); }
  };

  const escapeHtml = str => {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[c]);
  };

  const formatBytes = bytes => {
    if (bytes == null) return 'Unknown';
    if (bytes === 0) return '0 B';
    const units = ['B','KB','MB','GB','TB'];
    let u = 0, val = bytes;
    while (val >= 1024 && u < units.length - 1) { val /= 1024; u++; }
    return (u === 0 ? val : val.toFixed(1).replace('.0','')) + ' ' + units[u];
  };

  // ======== INITIAL TAB URL ========
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]?.url) urlInput.value = tabs[0].url;
  });

  // ======== SCAN BUTTON ========
  scanButton.addEventListener('click', () => {
    const url = urlInput.value;
    if (!url) return displayError('Please enter a URL.');

    clearResults();
    showLoading();
    scanButton.disabled = true;

    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tabId = tabs[0]?.id;
      if (!tabId) return displayError('No active tab found.');

      chrome.scripting.executeScript(
        { target: { tabId }, files: ['content.js'] },
        () => {
          if (chrome.runtime.lastError) displayError('Error injecting content script: ' + chrome.runtime.lastError.message);
          else chrome.tabs.sendMessage(tabId, { action: 'scanPage' });
        }
      );
    });
  });

  // ======== RECEIVE CONTENT SCRIPT ========
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'displayVideos') {
      hideLoading();
      scanButton.disabled = false;

      if (!message.videos?.length) {
        displayError('No downloadable video files found on this page.');
        hide(footer);
        return;
      }

      allVideos = message.videos.map((v, idx) => ({ ...v, id: `video-${idx}` }));
      const extensions = Array.from(new Set(allVideos.filter(v => v.extension).map(v => v.extension))).sort();
      populateExtensionFilter(extensions);

      displayVideos(allVideos);
      show(filtersDiv);
      show(videoListContainer);
      show(autoDownloadGroup);
      show(downloadButton);
      show(footer);
      downloadButton.disabled = true;
    }

    if (message.action === 'error') {
      hideLoading();
      scanButton.disabled = false;
      displayError(message.message);
    }
  });

  // ======== SELECT ALL ========
  selectAllCheckbox.addEventListener('change', e => {
    const checked = e.target.checked;
    displayedVideos.forEach(video => {
      const cb = document.getElementById(video.id);
      if (cb) cb.checked = checked;
    });
    updateDownloadButtonState();
  });

  // ======== FILTERS ========
  filenameFilter.addEventListener('input', applyFilters);
  extensionFilter.addEventListener('change', applyFilters);

  function applyFilters() {
    const fnameQuery = filenameFilter.value.toLowerCase();
    const extQuery = extensionFilter.value;

    const filtered = allVideos.filter(v => {
      const name = (v.fileName || '').toLowerCase();
      return name.includes(fnameQuery) && (extQuery === 'all' || v.extension === extQuery);
    });

    displayVideos(filtered);
    selectAllCheckbox.checked = false;
  }

  function populateExtensionFilter(extensions) {
    if (!extensionFilter) return;
    extensionFilter.innerHTML = '<option value="all">All</option>';

    const group = extensionFilter.closest('.filter-group');
    if (!group) return;

    if (extensions.length <= 1) {
      group.classList.add('d-none');
      return;
    }

    extensions.forEach(ext => {
      const option = document.createElement('option');
      option.value = ext;
      option.textContent = `.${ext}`;
      extensionFilter.appendChild(option);
    });

    group.classList.remove('d-none');
  }

  // ======== DISPLAY VIDEOS ========
  function displayVideos(videos) {
    if (!videoList) return;
    videoList.innerHTML = '';
    displayedVideos = videos;

    if (!videos.length) {
      const li = document.createElement('li');
      li.className = 'list-group-item text-center text-muted small';
      li.textContent = 'No videos match your filter criteria.';
      videoList.appendChild(li);
      hide(autoDownloadGroup);
      downloadButton.disabled = true;
      hide(footer);
      return;
    }

    const fragment = document.createDocumentFragment();
    videos.forEach(video => {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex align-items-center gap-2';

      const decodedName = safeDecodeName(video.fileName || (new URL(video.url).pathname.split('/').pop() || 'download'));
      const extBadge = video.extension ? `<span class="extension">.${escapeHtml(video.extension)}</span>` : '';

      li.innerHTML = `
        <input type="checkbox" data-id="${video.id}" id="${video.id}">
        <label for="${video.id}" class="flex-grow-1 d-flex align-items-center gap-2">
          <span class="filename">${escapeHtml(decodedName)}</span>
          ${extBadge}
          <span class="file-size" data-id="${video.id}">loading...</span>
        </label>
      `;

      fragment.appendChild(li);

      // async size fetch
      fetchSizeForVideo(video).then(size => {
        const sizeSpan = li.querySelector(`.file-size[data-id="${video.id}"]`);
        if (sizeSpan) sizeSpan.textContent = formatBytes(size);
      });
    });
    videoList.appendChild(fragment);

    updateSelectAllCheckbox();
    updateDownloadButtonState();
  }

  // ======== SELECT STATE ========
  videoList.addEventListener('change', e => {
    if (e.target.type === 'checkbox') {
      updateSelectAllCheckbox();
      updateDownloadButtonState();
    }
  });

  function updateSelectAllCheckbox() {
    if (!selectAllCheckbox) return;
    const all = displayedVideos.map(v => document.getElementById(v.id)).filter(Boolean);
    const checked = all.filter(cb => cb.checked);
    selectAllCheckbox.disabled = !all.length;
    selectAllCheckbox.checked = all.length > 0 && checked.length === all.length;
  }

  function updateDownloadButtonState() {
    if (!downloadButton) return;
    const hasSelection = displayedVideos.some(v => document.getElementById(v.id)?.checked);
    downloadButton.disabled = !hasSelection;
  }

  // ======== DOWNLOAD ========
  downloadButton?.addEventListener('click', () => {
    const selected = displayedVideos.filter(v => document.getElementById(v.id)?.checked)
      .map(v => ({ url: v.url, fileName: v.fileName }));

    if (!selected.length) return displayError('Please select at least one video to download.');

    const saveAs = !autoDownloadCheckbox?.checked;
    chrome.runtime.sendMessage({ action: 'downloadVideos', items: selected, saveAs });
  });

  // ======== FETCH VIDEO SIZE ========
  async function fetchSizeForVideo(video) {
    try {
      const headResp = await fetch(video.url, { method: 'HEAD' });
      if (headResp.ok) {
        const cl = headResp.headers.get('content-length');
        if (cl) return parseInt(cl, 10);
        const cr = headResp.headers.get('content-range');
        if (cr) return parseInt(cr.split('/')[1] || '0', 10);
      }

      const rangeResp = await fetch(video.url, { method: 'GET', headers: { 'Range': 'bytes=0-0' } });
      if (rangeResp.ok || rangeResp.status === 206) {
        const cr2 = rangeResp.headers.get('content-range');
        if (cr2) return parseInt(cr2.split('/')[1] || '0', 10);
        const cl2 = rangeResp.headers.get('content-length');
        if (cl2) return parseInt(cl2, 10);
      }
    } catch {}
    return null;
  }

  // ======== ERROR & LOADING ========
  function showLoading() {
    show(loadingIndicator);
    hide(errorMessage);
    hide(filtersDiv);
    hide(videoListContainer);
    hide(footer);
  }

  function hideLoading() { hide(loadingIndicator); }

  function displayError(msg) {
    if (!errorMessage) return;
    errorMessage.textContent = msg;
    show(errorMessage);
  }

  function clearResults() {
    allVideos = [];
    displayedVideos = [];
    if (videoList) videoList.innerHTML = '';

    hide(errorMessage);
    hide(filtersDiv);
    hide(videoListContainer);
    hide(autoDownloadGroup);
    hide(footer);

    if (downloadButton) downloadButton.disabled = true;
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
    if (filenameFilter) filenameFilter.value = '';
    if (extensionFilter) extensionFilter.value = 'all';
  }
});
