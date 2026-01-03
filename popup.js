document.addEventListener('DOMContentLoaded', () => {
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

  let allVideos = [];
  let displayedVideos = [];

  // Pre-fill URL input
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.url) urlInput.value = tabs[0].url;
  });

  // Scan button
  scanButton.addEventListener('click', () => {
    const url = urlInput.value;
    if (!url) {
      showError('Please enter a URL.');
      return;
    }
    clearResults();
    showLoading();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return showError('No active tab found.');

      chrome.scripting.executeScript(
        { target: { tabId }, files: ['content.js'] },
        () => {
          if (chrome.runtime.lastError) {
            showError('Error injecting content script: ' + chrome.runtime.lastError.message);
            hideLoading();
          } else {
            chrome.tabs.sendMessage(tabId, { action: 'scanPage' });
          }
        }
      );
    });
  });

  // Listen to messages from content.js
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'displayVideos') {
      hideLoading();
      if (message.videos?.length > 0) {
        allVideos = message.videos.map((v, i) => ({ ...v, id: `video-${i}` }));
        populateExtensionFilter(getUniqueExtensions(allVideos));
        displayVideos(allVideos);
        filtersDiv.classList.remove('d-none');
        videoListContainer.classList.remove('d-none');
        autoDownloadGroup.classList.remove('d-none');
        downloadButton.classList.remove('d-none');
        footer.classList.remove('d-none');
        downloadButton.disabled = true;
      } else {
        showError('No downloadable video files found.');
        footer.classList.add('d-none');
      }
    } else if (message.action === 'error') {
      hideLoading();
      showError(message.message);
    }
  });

  // Filters
  filenameFilter.addEventListener('input', applyFilters);
  extensionFilter.addEventListener('change', applyFilters);

  // Select All
  selectAllCheckbox.addEventListener('change', (e) => {
    const checked = e.target.checked;
    videoList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = checked);
    updateDownloadButton();
  });

  // Download button
  downloadButton.addEventListener('click', () => {
    const selectedVideos = Array.from(videoList.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => displayedVideos.find(v => v.id === cb.dataset.id))
      .filter(Boolean)
      .map(v => ({ url: v.url, fileName: v.fileName }));

    if (!selectedVideos.length) return showError('Select at least one video.');

    const saveAs = !autoDownloadCheckbox.checked;
    chrome.runtime.sendMessage({ action: 'downloadVideos', items: selectedVideos, saveAs });
  });

  // Video list checkbox listener
  videoList.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') {
      updateSelectAllCheckbox();
      updateDownloadButton();
    }
  });

  /* =======================
       Helper Functions
  ======================= */

  function displayVideos(videos) {
    videoList.innerHTML = '';
    if (!videos.length) {
      videoList.innerHTML = '<li class="text-muted small">No videos match your filter.</li>';
      autoDownloadGroup.classList.add('d-none');
      downloadButton.disabled = true;
      footer.classList.add('d-none');
      return;
    }

    displayedVideos = videos;

    // Efficient rendering using DocumentFragment
    const frag = document.createDocumentFragment();
    videos.forEach(video => {
      const li = document.createElement('li');
      li.className = 'd-flex align-items-center gap-2 mb-1';
      const decodedName = safeDecode(video.fileName || new URL(video.url).pathname.split('/').pop() || 'download');
      li.innerHTML = `
        <input type="checkbox" data-id="${video.id}" id="${video.id}">
        <label for="${video.id}" class="flex-grow-1 mb-0">
          <span class="filename">${escapeHtml(decodedName)}</span>
          ${video.extension ? `<span class="extension">.${escapeHtml(video.extension)}</span>` : ''}
          <span class="file-size text-muted small" data-id="${video.id}">loading...</span>
        </label>
      `;
      frag.appendChild(li);
      // async file size fetch
      fetchSize(video).then(size => {
        const sizeEl = videoList.querySelector(`.file-size[data-id="${video.id}"]`);
        if (sizeEl) sizeEl.textContent = formatBytes(size);
      });
    });

    videoList.appendChild(frag);
    updateSelectAllCheckbox();
    updateDownloadButton();
  }

  function populateExtensionFilter(extensions) {
    extensionFilter.innerHTML = '<option value="all">All</option>';
    const wrapper = extensionFilter.parentElement;

    if (extensions.length > 1) {
      extensions.forEach(ext => {
        const option = document.createElement('option');
        option.value = ext;
        option.textContent = `.${ext}`;
        extensionFilter.appendChild(option);
      });
      wrapper.classList.remove('d-none');
    } else {
      wrapper.classList.add('d-none');
    }
  }

  function applyFilters() {
    const fQuery = filenameFilter.value.toLowerCase();
    const eQuery = extensionFilter.value;

    displayVideos(allVideos.filter(v => 
      v.fileName.toLowerCase().includes(fQuery) &&
      (eQuery === 'all' || v.extension === eQuery)
    ));
  }

  function updateSelectAllCheckbox() {
    const all = videoList.querySelectorAll('input[type="checkbox"]');
    const checked = videoList.querySelectorAll('input[type="checkbox"]:checked');
    selectAllCheckbox.checked = all.length && all.length === checked.length;
    selectAllCheckbox.disabled = !all.length;
  }

  function updateDownloadButton() {
    downloadButton.disabled = !videoList.querySelector('input[type="checkbox"]:checked');
  }

  function getUniqueExtensions(videos) {
    return [...new Set(videos.filter(v => v.extension).map(v => v.extension))].sort();
  }

  function showLoading() {
    loadingIndicator.classList.remove('d-none');
    errorMessage.classList.add('d-none');
    filtersDiv.classList.add('d-none');
    videoListContainer.classList.add('d-none');
    downloadButton.classList.add('d-none');
    footer.classList.add('d-none');
  }

  function hideLoading() { loadingIndicator.classList.add('d-none'); }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorMessage.classList.remove('d-none');
  }

  function clearResults() {
    allVideos = [];
    displayedVideos = [];
    videoList.innerHTML = '';
    errorMessage.classList.add('d-none');
    filtersDiv.classList.add('d-none');
    videoListContainer.classList.add('d-none');
    downloadButton.classList.add('d-none');
    downloadButton.disabled = true;
    autoDownloadGroup.classList.add('d-none');
    footer.classList.add('d-none');
    selectAllCheckbox.checked = false;
    filenameFilter.value = '';
    extensionFilter.value = 'all';
  }

  function safeDecode(name) {
    if (!name) return '';
    try { return decodeURIComponent(name.replace(/\+/g, ' ')); }
    catch { return name.replace(/\+/g, ' '); }
  }

  function escapeHtml(str) {
    return str ? String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]) : '';
  }

  function formatBytes(bytes) {
    if (!bytes) return 'Unknown';
    const units = ['B','KB','MB','GB','TB']; let u=0, val=bytes;
    while(val>=1024 && u<units.length-1){ val/=1024; u++; }
    return (u===0 ? val : val.toFixed(1).replace('.0','')) + ' ' + units[u];
  }

  async function fetchSize(video){
    try {
      const head = await fetch(video.url,{method:'HEAD'});
      if(head.ok){ 
        const cl = head.headers.get('content-length'); 
        if(cl) return parseInt(cl,10);
      }
    } catch{}
    return null;
  }

});
