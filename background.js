chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadVideos') {
    const items = message.items || [];

    if (Array.isArray(items) && items.length > 0) {
      items.forEach(item => {
        // Use provided fileName if present; otherwise derive from URL
        let fileName = item.fileName || '';
        if (!fileName) {
          try {
            fileName = item.url ? (new URL(item.url).pathname.split('/').pop() || 'download') : 'download';
          } catch (e) {
            console.error('Error deriving filename from URL', e);
            fileName = 'download';
          }
        }

        const downloadFilename = fileName;

        chrome.downloads.download({
          url: item.url,
          filename: downloadFilename,
          saveAs: false // Do not prompt user for save location
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error('Download failed:', chrome.runtime.lastError.message, 'for URL:', item.url);
            chrome.runtime.sendMessage({ action: 'error', message: `Download failed for ${item.url}: ${chrome.runtime.lastError.message}` });
          } else {
            console.log('Download started with ID:', downloadId, 'for URL:', item.url, 'filename:', downloadFilename);
          }
        });
      });
    }
  }
});