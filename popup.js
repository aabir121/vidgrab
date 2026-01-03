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







  // Get current tab URL and pre-fill input
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      urlInput.value = tabs[0].url;
    }
  });

  scanButton.addEventListener('click', () => {
    const url = urlInput.value;
    if (!url) {
      displayError('Please enter a URL.');
      return;
    }

    clearResults();
    showLoading();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.scripting.executeScript(
          {
            target: { tabId: tabs[0].id },
            files: ['content.js'],
          },
          () => {
            if (chrome.runtime.lastError) {
              displayError('Error injecting content script: ' + chrome.runtime.lastError.message);
              hideLoading();
            } else {
              // Send a message to the content script to start scanning
              chrome.tabs.sendMessage(tabs[0].id, { action: 'scanPage' });
            }
          }
        );
      }
    });
  });

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'displayVideos') {
      hideLoading();
      if (message.videos && message.videos.length > 0) {
        allVideos = message.videos.map((video, index) => ({ ...video, id: `video-${index}` }));
        displayVideos(allVideos);
        filtersDiv.classList.remove('hidden');
        videoListContainer.classList.remove('hidden');
        autoDownloadGroup.classList.remove('hidden');
        downloadButton.classList.remove('hidden');
        footer.classList.remove('hidden');
        downloadButton.disabled = true;
      } else {
        displayError('No downloadable video files found on this page.');
        footer.classList.add('hidden');
      }
    } else if (message.action === 'error') {
      hideLoading();
      displayError(message.message);
    }
  });

  selectAllCheckbox.addEventListener('change', (event) => {
    const isChecked = event.target.checked;
    document.querySelectorAll('#video-list input[type="checkbox"]').forEach(checkbox => {
      checkbox.checked = isChecked;
    });
    updateDownloadButtonState();
  });

  filenameFilter.addEventListener('input', applyFilters);
  extensionFilter.addEventListener('change', applyFilters);

  downloadButton.addEventListener('click', async () => {
    const checkedBoxes = Array.from(videoList.querySelectorAll('input[type="checkbox"]:checked'));
    const selectedItems = checkedBoxes.map(checkbox => {
      const id = checkbox.dataset.id;
      // find video by id in displayedVideos
      const video = displayedVideos.find(v => v.id === id) || {};
      return { url: video.url, fileName: video.fileName };
    });

    if (selectedItems.length === 0) {
      displayError('Please select at least one video to download.');
      return;
    }

    const saveAs = !autoDownloadCheckbox.checked; // checked = auto-download; unchecked = prompt for location
    chrome.runtime.sendMessage({ action: 'downloadVideos', items: selectedItems, saveAs });
  });

  function displayVideos(videos) {
    videoList.innerHTML = '';
    if (videos.length === 0) {
      videoList.innerHTML = '<li>No videos match your filter criteria.</li>';
      autoDownloadGroup.classList.add('hidden');
      downloadButton.disabled = true;
      footer.classList.add('hidden');
      return;
    }
    displayedVideos = videos;
    videos.forEach(video => {
      const decodedName = safeDecodeName(video.fileName || (new URL(video.url).pathname.split('/').pop() || 'download'));
      const li = document.createElement('li');
      const extBadge = video.extension ? `<span class="extension">.${escapeHtml(video.extension)}</span>` : '';
      li.innerHTML = `
        <input type="checkbox" data-id="${video.id}" data-url="${video.url}" id="${video.id}">
        <label for="${video.id}"><span class="filename">${escapeHtml(decodedName)}</span> ${extBadge} <span class="file-size" data-id="${video.id}">loading...</span></label>
      `;
      videoList.appendChild(li);

      // Kick off size fetch (async). If not available, will show 'Unknown'.
      fetchSizeForVideo(video).then(size => {
        const sizeSpan = videoList.querySelector(`.file-size[data-id="${video.id}"]`);
        if (sizeSpan) sizeSpan.textContent = formatBytes(size);
      });
    });
    updateSelectAllCheckbox();
    updateDownloadButtonState();
  }

  function applyFilters() {
    const filenameQuery = filenameFilter.value.toLowerCase();
    const extensionQuery = extensionFilter.value;

    const filtered = allVideos.filter(video => {
      const filenameMatch = video.fileName.toLowerCase().includes(filenameQuery);
      const extensionMatch = extensionQuery === 'all' || video.extension === extensionQuery;
      return filenameMatch && extensionMatch;
    });
    displayVideos(filtered);
  }

  function updateSelectAllCheckbox() {
    const allCheckboxes = videoList.querySelectorAll('input[type="checkbox"]');
    const checkedCheckboxes = videoList.querySelectorAll('input[type="checkbox"]:checked');

    if (allCheckboxes.length === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.disabled = true;
    } else {
      selectAllCheckbox.disabled = false;
      selectAllCheckbox.checked = allCheckboxes.length === checkedCheckboxes.length;
    }
  }

  function updateDownloadButtonState() {
    const hasSelection = videoList.querySelectorAll('input[type="checkbox"]:checked').length > 0;
    downloadButton.disabled = !hasSelection;
  }

  // Helpers: decode filename, format sizes, and fetch size via HEAD/Range
  function safeDecodeName(name) {
    if (!name) return '';
    try {
      // Replace + with space (sometimes used) then decode percent-escapes
      return decodeURIComponent(name.replace(/\+/g, ' '));
    } catch (e) {
      return name.replace(/\+/g, ' ');
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }

  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined) return 'Unknown';
    if (bytes === 0) return '0 B';
    const thresh = 1024;
    const units = ['B','KB','MB','GB','TB'];
    let u = 0;
    let value = bytes;
    while (value >= thresh && u < units.length - 1) {
      value /= thresh;
      u++;
    }
    return (u === 0 ? value : value.toFixed(1).replace('.0', '')) + ' ' + units[u];
  }

  async function fetchSizeForVideo(video) {
    try {
      // First try HEAD
      const headResp = await fetch(video.url, { method: 'HEAD' });
      if (headResp && headResp.ok) {
        const cl = headResp.headers.get('content-length');
        if (cl) return parseInt(cl, 10);
        const cr = headResp.headers.get('content-range');
        if (cr) {
          const parts = cr.split('/');
          const total = parts[1] ? parseInt(parts[1], 10) : null;
          if (total) return total;
        }
      }

      // Fallback try range GET (should not download full file)
      const rangeResp = await fetch(video.url, { method: 'GET', headers: { 'Range': 'bytes=0-0' } });
      if (rangeResp && (rangeResp.status === 206 || rangeResp.ok)) {
        const cr2 = rangeResp.headers.get('content-range');
        if (cr2) {
          const parts = cr2.split('/');
          const total = parts[1] ? parseInt(parts[1], 10) : null;
          if (total) return total;
        }
        const cl2 = rangeResp.headers.get('content-length');
        if (cl2) return parseInt(cl2, 10);
      }
    } catch (e) {
      // Ignore failures (CORS or network), we'll show Unknown
    }
    return null;
  }

  // Event listener for individual video checkboxes
  videoList.addEventListener('change', (event) => {
    if (event.target.type === 'checkbox') {
      updateSelectAllCheckbox();
      updateDownloadButtonState();
    }
  });

  function showLoading() {
    loadingIndicator.classList.remove('hidden');
    errorMessage.classList.add('hidden');
    filtersDiv.classList.add('hidden');
    videoListContainer.classList.add('hidden');
    downloadButton.classList.add('hidden');
    footer.classList.add('hidden');
  }

  function hideLoading() {
    loadingIndicator.classList.add('hidden');
  }

  function displayError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
  }

  function clearResults() {
    allVideos = [];
    displayedVideos = [];
    videoList.innerHTML = '';
    errorMessage.classList.add('hidden');
    filtersDiv.classList.add('hidden');
    videoListContainer.classList.add('hidden');
    downloadButton.classList.add('hidden');
    downloadButton.disabled = true;
    autoDownloadGroup.classList.add('hidden');
    footer.classList.add('hidden');
    selectAllCheckbox.checked = false;
    filenameFilter.value = '';
    extensionFilter.value = 'all';
  }
});