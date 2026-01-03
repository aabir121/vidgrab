(() => {
  const videoExtensions = [
    'mp4',
    'mkv',
    'webm',
    'mov',
    'avi',
    'flv'
  ];

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'scanPage') {
      const videos = extractVideoUrls();
      chrome.runtime.sendMessage({ action: 'displayVideos', videos: videos });
    }
  });

  function extractVideoUrls() {
    const detectedUrls = new Set();
    const videoFiles = [];

    const currentUrl = window.location.href;
    const baseUrl = new URL(currentUrl);

    // Helper to add URL if it's a video
    function addVideoUrl(url) {
      if (!url) return;

      try {
        const absoluteUrl = new URL(url, baseUrl).href;
        const normalizedUrl = new URL(absoluteUrl).href;

        if (!detectedUrls.has(normalizedUrl)) {
          const extensionMatch = normalizedUrl.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
          if (extensionMatch) {
            const extension = extensionMatch[1].toLowerCase();
            if (videoExtensions.includes(extension)) {
              detectedUrls.add(normalizedUrl);
              const fileName = normalizedUrl.substring(normalizedUrl.lastIndexOf('/') + 1).split('?')[0].split('#')[0];
              videoFiles.push({
                url: normalizedUrl,
                fileName: fileName,
                extension: extension,
              });
            }
          }
        }
      } catch (e) {
        console.error('Invalid URL encountered:', url, e);
      }
    }

    // 1. Detect video URLs from <a> tags
    document.querySelectorAll('a[href]').forEach(a => {
      addVideoUrl(a.href);
    });

    // 2. Detect video URLs from <video> tags
    document.querySelectorAll('video[src]').forEach(video => {
      addVideoUrl(video.src);
    });

    // 3. Detect video URLs from <source> tags
    document.querySelectorAll('source[src]').forEach(source => {
      addVideoUrl(source.src);
    });

    // 4. Detect video URLs from common data attributes
    const dataAttributes = [
      'data-src',
      'data-video',
      'data-video-src',
      'data-url',
      'data-file'
    ];

    dataAttributes.forEach(attr => {
      document.querySelectorAll(`[${attr}]`).forEach(element => {
        addVideoUrl(element.getAttribute(attr));
      });
    });

    return videoFiles;
  }
})();