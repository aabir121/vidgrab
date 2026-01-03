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
        downloadButton.classList.remove('hidden');
      } else {
        displayError('No downloadable video files found on this page.');
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

    chrome.runtime.sendMessage({ action: 'downloadVideos', items: selectedItems });
  });

  function displayVideos(videos) {
    videoList.innerHTML = '';
    if (videos.length === 0) {
      videoList.innerHTML = '<li>No videos match your filter criteria.</li>';
      return;
    }
    displayedVideos = videos;
    videos.forEach(video => {
      const li = document.createElement('li');
      li.innerHTML = `
        <input type="checkbox" data-id="${video.id}" data-url="${video.url}" id="${video.id}">
        <label for="${video.id}">${video.fileName} (.${video.extension})</label>
        <span class="source-url">${video.url}</span>
      `;
      videoList.appendChild(li);
    });
    updateSelectAllCheckbox();
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

  // Event listener for individual video checkboxes
  videoList.addEventListener('change', (event) => {
    if (event.target.type === 'checkbox') {
      updateSelectAllCheckbox();
    }
  });

  function showLoading() {
    loadingIndicator.classList.remove('hidden');
    errorMessage.classList.add('hidden');
    filtersDiv.classList.add('hidden');
    videoListContainer.classList.add('hidden');
    downloadButton.classList.add('hidden');
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
    selectAllCheckbox.checked = false;
    filenameFilter.value = '';
    extensionFilter.value = 'all';
  }
});