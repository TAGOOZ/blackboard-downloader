chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadFile') {
    console.log('Downloading file:', request.url);
    (async () => {
      try {
        let filename = '';

        // Helper: map common content-types to extensions
        const mimeMap = {
          'application/pdf': '.pdf',
          'application/msword': '.doc',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
          'application/vnd.ms-powerpoint': '.ppt',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
          'application/vnd.ms-excel': '.xls',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
          'text/plain': '.txt',
          'application/zip': '.zip',
          'application/x-rar-compressed': '.rar',
          'application/x-7z-compressed': '.7z',
          'text/csv': '.csv',
          'audio/mpeg': '.mp3',
          'video/mp4': '.mp4',
          'image/jpeg': '.jpg',
          'image/png': '.png',
          'image/gif': '.gif',
          'application/octet-stream': ''
        };

        // Try to infer filename from HEAD response headers first
        try {
          const resp = await fetch(request.url, { method: 'HEAD', credentials: 'include' });
          // Note: this may be blocked by CORS in some setups; gracefully fallback below
          if (resp && resp.ok) {
            const disp = resp.headers.get('content-disposition');
            const ctype = resp.headers.get('content-type');
            if (disp && /filename=/i.test(disp)) {
              const m = disp.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
              if (m && m[1]) {
                filename = decodeURIComponent(m[1].trim()).replace(/^["']|["']$/g, '').replace(/[+]/g, ' ');
              }
            }
            if (!filename && ctype) {
              const ct = ctype.split(';')[0].trim().toLowerCase();
              const ext = mimeMap[ct] || '';
              if (ext) {
                // derive name from the URL path and append extension if missing
                try {
                  const u = new URL(request.url);
                  let base = decodeURIComponent(u.pathname.split('/').pop().split('?')[0]) || 'download';
                  if (!/\.[a-z0-9]+$/i.test(base)) base += ext;
                  filename = base.replace(/[+]/g, ' ');
                } catch (e) {
                  filename = 'download' + ext;
                }
              }
            }
          }
        } catch (headErr) {
          // HEAD fetch failed (CORS or other). We'll fallback to URL-based heuristics below.
          console.debug('HEAD request failed or blocked, falling back to URL parsing:', headErr && headErr.message);
        }

        // If we still don't have a filename, fall back to URL parsing
        if (!filename) {
          try {
            const url = new URL(request.url);
            const disp = url.searchParams.get('response-content-disposition');
            if (disp && /filename=/i.test(disp)) {
              const match = disp.match(/filename=["']?([^"']+)/i);
              if (match && match[1]) filename = decodeURIComponent(match[1]);
            }
            if (!filename) {
              filename = decodeURIComponent(url.pathname.split('/').pop().split('?')[0]) || '';
            }
          } catch (e) {
            filename = request.url.split('/').pop().split('?')[0];
          }
        }

        // Final safety: if filename has no extension, try to append one from known URL patterns
        if (filename && !/\.[a-z0-9]+$/i.test(filename)) {
          // try to glean extension from query param or known patterns
          try {
            const u2 = new URL(request.url);
            const maybe = (u2.searchParams.get('filename') || u2.searchParams.get('file') || u2.searchParams.get('name') || '').trim();
            if (maybe && /\.[a-z0-9]+$/i.test(maybe)) {
              filename = filename + (maybe.startsWith('.') ? '' : '.') + maybe.split('.').pop();
            }
          } catch (e) {
            // ignore
          }
        }

        // Trigger the download; let the browser choose a name if empty
        chrome.downloads.download(
          {
            url: request.url,
            saveAs: false,
            filename: filename || ''
          },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              console.error('Download failed for:', request.url, chrome.runtime.lastError.message);
              return;
            }
            console.log('Download initiated for:', request.url, 'id:', downloadId, 'filename:', filename);
          }
        );
      } catch (e) {
        console.error('Unexpected error invoking downloads API for:', request.url, e);
      }
    })();
  }
});

// Show action icon only on Blackboard pages
function updateActionVisibility(tabId, changeInfo, tab) {
  if (!tab.url) return;
  
  const url = tab.url.toLowerCase();
  const isBlackboardUrl = 
    url.includes('blackboard.com') || 
    url.includes('blackboard.edu') || 
    url.includes('blackboard.org') || 
    url.includes('blackboard.net') || 
    url.includes('/webapps/blackboard/') || 
    url.includes('/ultra/') || 
    url.includes('/learn/') || 
    url.includes('blackboardcdn.com');
    
  if (isBlackboardUrl) {
    chrome.action.show(tabId);
  } else {
    chrome.action.hide(tabId);
  }
}

chrome.tabs.onUpdated.addListener(updateActionVisibility);
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    updateActionVisibility(activeInfo.tabId, null, tab);
  });
});
