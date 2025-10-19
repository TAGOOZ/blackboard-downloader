console.log('Content script loaded');

// Broader set of common extensions and archive types
const fileExtensions = [
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', 
  '.txt', '.zip', '.rar', '.7z', '.csv', '.mp3', '.mp4',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.html',
  '.htm', '.rtf', '.odt', '.ods', '.odp'
];

function isLikelyFileUrl(url) {
  try {
    const u = new URL(url, location.href);
    const path = u.pathname.toLowerCase();
    const href = u.href.toLowerCase();
    console.debug('Checking URL:', href);
    
    // Explicit navigation patterns to exclude
    const navPatterns = [
      '/ultra/institution-page', '/ultra/profile', '/ultra/stream', '/ultra/calendar', 
      '/ultra/messages', '/ultra/grades', '/ultra/tools', '/ultra/logout',
      '/groups/enrollments', '/achievements'
    ];
    
    // Hard exclude navigation patterns
    if (navPatterns.some(p => path.includes(p))) {
      console.debug('Excluded navigation URL:', href);
      return false;
    }

    // Include any URL with file extension
    const hasExt = fileExtensions.some(ext => path.endsWith(ext));
    if (hasExt) {
      console.debug('Included file with extension:', href);
      return true;
    }
    
    // Include BlackboardCDN links that contain "attachment" or "inline"
    const isBlackboardCdn = href.includes('blackboardcdn.com') && 
      ((u.searchParams.get('response-content-disposition') || '').toLowerCase().includes('attachment') || 
       (u.searchParams.get('response-content-disposition') || '').toLowerCase().includes('inline'));
    if (isBlackboardCdn) {
      console.debug('Included BlackboardCDN URL:', href);
      return true;
    }
    
    // Include any outline file URLs (common pattern for embedded files)
    const isOutlineFile = /\/outline\/file\//.test(path);
    if (isOutlineFile) {
      console.debug('Included outline file URL:', href);
      return true;
    }
    
    // Include BBLearn specific file access URLs
    const isBbLearnFile = path.includes('/bbcswebdav/') || 
                          path.includes('/xid-') ||
                          path.includes('/courses/') && path.includes('/file/') ||
                          href.includes('fileCacheDownload');
    if (isBbLearnFile) {
      console.debug('Included BBLearn file URL:', href);
      return true;
    }

    // For course URLs, only exclude specific navigation patterns
    if (path.includes('/ultra/course')) {
      // Allow content URLs but exclude specific navigation patterns
      const excludePatterns = ['/outline', '/roster', '/description', '/attendancegrade', 
                              '/booksandtools', '/announcements', '/engagement'];
      
      // Only exclude if the URL pattern is specifically navigation-related
      const isNavUrl = excludePatterns.some(p => path.includes(p));
      if (!isNavUrl) {
        // This might be a content URL with downloads
        console.debug('Included potential course content URL:', href);
        return true;
      }
      console.debug('Excluded course navigation URL:', href);
      return false;
    }
    
    // Default exclusion
    console.debug('URL didn\'t match any inclusion patterns:', href);
    return false;
  } catch (e) {
    console.debug('Error parsing URL:', url, e);
    const lower = String(url).toLowerCase();
    
    if (lower.includes('blackboardcdn.com')) return true;
    if (lower.includes('/outline/file/')) return true;
    if (lower.includes('/bbcswebdav/')) return true;
    if (lower.includes('/xid-')) return true;
    if (lower.includes('fileCacheDownload')) return true;
    
    return fileExtensions.some(ext => lower.endsWith(ext));
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function getMainContainer() {
  return (
    document.querySelector('main') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('#content') ||
    document.body
  );
}

function getExpanders(scope = document) {
  // Avoid brittle class-based chevrons; target semantic expanders
  const selectors = [
    'details:not([open]) > summary',
    '[aria-expanded="false"][role="button"]',
    '[aria-controls][aria-expanded="false"]',
    '[data-test*="expand" i]',
    '[aria-label*="expand" i]'
  ];
  const list = Array.from(scope.querySelectorAll(selectors.join(',')));
  const seen = new Set();
  return list.filter(el => {
    if (!isVisible(el)) return false;
    const key = el.tagName + '#' + (el.id || '') + '.' + el.className + '|' + el.getAttribute('aria-controls') + '|' + el.getAttribute('aria-label');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getClickable(el) {
  if (!el) return null;
  if (el.matches('summary, button, [role="button"], [aria-expanded]')) return el;
  const child = el.querySelector('summary, button, [role="button"], [aria-expanded]');
  return child || el;
}

async function expandAll(maxPasses = 5) {
  const scope = getMainContainer();
  // First run: click visible expanders in a few passes
  for (let pass = 0; pass < maxPasses; pass++) {
    const expanders = getExpanders(scope);
    if (expanders.length === 0) break;
    expanders.forEach(el => {
      const clickable = getClickable(el);
      if (clickable && isVisible(clickable)) clickable.click();
    });
    // Wait briefly for DOM to render newly revealed nodes
    await sleep(300);
  }

  // If there are still collapsed sections added lazily, observe mutations until idle
  return new Promise((resolve) => {
    let timeout;
    const observer = new MutationObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        const more = getExpanders(scope);
        if (more.length > 0) {
          more.forEach(el => {
            const clickable = getClickable(el);
            if (clickable && isVisible(clickable)) clickable.click();
          });
          // keep observing
          timeout = setTimeout(() => resolve(), 500);
        } else {
          observer.disconnect();
          resolve();
        }
      }, 500);
    });
    observer.observe(scope, { childList: true, subtree: true, attributes: true });
    // fallback: resolve after a reasonable time
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, 3000);
  });
}

function collectFiles() {
  const files = new Set();
  const rejectedUrls = [];
  let totalAnchorCount = 0;
  let totalDownloadButtons = 0;
  
  console.log('Scanning for file links...');

  // Anchors with href that look like files
  document.querySelectorAll('a[href]').forEach(a => {
    totalAnchorCount++;
    const href = a.href;
    if (!href) return;
    
    if (isLikelyFileUrl(href)) {
      files.add(href);
      console.log('Found file URL:', href);
    } else {
      rejectedUrls.push(href);
    }
  });

  // Explicit download anchors
  document.querySelectorAll('a[download]').forEach(a => {
    const href = a.href;
    if (href) {
      files.add(href);
      console.log('Found download attribute URL:', href);
    }
  });

  // Look for file links in iframes
  try {
    document.querySelectorAll('iframe').forEach(iframe => {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.querySelectorAll('a[href]').forEach(a => {
            totalAnchorCount++;
            const href = a.href;
            if (href && isLikelyFileUrl(href)) {
              files.add(href);
              console.log('Found file URL in iframe:', href);
            }
          });
        }
      } catch (e) {
        // Cross-origin iframe access will fail - that's expected
      }
    });
  } catch (e) {
    console.log('Error accessing iframes:', e);
  }

  // Note presence of download buttons so UI can ask to click them
  document.querySelectorAll('button, [role="button"], span').forEach(el => {
    const text = (el.textContent || '').trim().toLowerCase();
    if (!text) return;
    if (text.includes('download')) {
      totalDownloadButtons++;
      files.add('Download button (click to download)');
    }
  });

  console.log(`Collection summary: ${files.size} file URLs found out of ${totalAnchorCount} total anchors`);
  console.log(`Found ${totalDownloadButtons} download buttons`);
  if (files.size === 0) {
    console.log('No files found. First 20 rejected URLs:', rejectedUrls.slice(0, 20));
  }

  return Array.from(files);
}

function getVisibleMenus() {
  const menus = Array.from(document.querySelectorAll('[role="menu"], ul[role="menu"], div[role="menu"]'));
  return menus.filter(isVisible);
}

function findMenuForTrigger(trigger) {
  const ctrlId = trigger.getAttribute('aria-controls') || trigger.getAttribute('aria-owns');
  if (ctrlId) {
    const el = document.getElementById(ctrlId);
    if (el && isVisible(el)) return el;
  }
  // Fallback: nearest visible menu by geometry
  const menus = getVisibleMenus();
  if (menus.length === 0) return null;
  const tRect = trigger.getBoundingClientRect();
  const tx = tRect.left + tRect.width / 2;
  const ty = tRect.top + tRect.height / 2;
  let best = null;
  let bestDist = Infinity;
  menus.forEach(menu => {
    const r = menu.getBoundingClientRect();
    const mx = r.left + r.width / 2;
    const my = r.top + r.height / 2;
    const dx = mx - tx;
    const dy = my - ty;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = menu;
    }
  });
  return best;
}

function findDownloadItemInMenu(menu) {
  const candidates = Array.from(menu.querySelectorAll('[role="menuitem"], li, button, a'));
  for (const el of candidates) {
    if (!isVisible(el)) continue;
    const text = (el.textContent || '').trim().toLowerCase();
    const analytics = (el.getAttribute('data-analytics-id') || '').toLowerCase();
    const isDownload = text === 'download' || text.includes('download') || analytics.includes('download');
    if (isDownload) {
      // Prefer anchors with href to extract direct URL
      if (el.tagName === 'A' && el.href) {
        return { element: el, href: el.href };
      }
      const a = el.querySelector('a[href]');
      if (a && a.href) return { element: el, href: a.href };
      return { element: el, href: null };
    }
  }
  return null;
}

function closeOpenMenus() {
  const open = getVisibleMenus();
  if (open.length === 0) return;
  // Try Esc key to close any open menu
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
}

// Safely click an element, falling back to synthesizing a MouseEvent when .click() fails
function safeClick(el) {
  if (!el) return;
  // Prefer native click
  try {
    el.click();
    return;
  } catch (e) {
    // fallthrough to synthetic events
  }

  try {
    // Try a pointer/mouse sequence which many UI libs listen for
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
    const events = ['pointerover', 'pointerenter', 'pointermove', 'pointerdown', 'mousedown', 'mouseup', 'click'];
    for (const name of events) {
      let ev;
      if (name.startsWith('pointer')) {
        ev = new PointerEvent(name, Object.assign({}, opts, { pointerId: 1, pointerType: 'mouse' }));
      } else {
        ev = new MouseEvent(name, opts);
      }
      el.dispatchEvent(ev);
    }
    return;
  } catch (err) {
    // final fallback: keyboard activation
    try {
      el.focus();
      const ev2 = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
      el.dispatchEvent(ev2);
    } catch (ignored) {}
  }
}

// Find a reasonable container element for a menu trigger (used to avoid processing the same item twice)
function findItemContainer(trigger) {
  if (!trigger) return null;
  let el = trigger;
  // Walk up the tree looking for semantic wrappers
  for (let i = 0; i < 8; i++) {
    el = el.parentElement;
    if (!el) break;
    if (el.matches && el.matches('article, li, [role="article"], [role="listitem"], .content, .item, .course-item, [data-test*="item" i]')) {
      return el;
    }
  }
  // Fallback: nearest ancestor that contains an anchor or a filename-like text
  el = trigger;
  for (let i = 0; i < 8; i++) {
    el = el.parentElement;
    if (!el) break;
    try {
      if (el.querySelector && el.querySelector('a[href]')) return el;
    } catch (e) {
      // ignore cross-origin issues
    }
  }
  return null;
}

// Heuristic to decide whether a menu trigger likely belongs to a file/download item
function isLikelyFileItem(trigger) {
  try {
    if (!trigger) return false;
    const container = findItemContainer(trigger) || trigger;

    // Look for anchors with likely file URLs inside the container
    if (container.querySelector) {
      const anchors = Array.from(container.querySelectorAll('a[href]'));
      if (anchors.length > 0) {
        for (const a of anchors) {
          try {
            if (isLikelyFileUrl(a.href)) return true;
            const hrefLower = (a.href || '').toLowerCase();
            if (/\.(pdf|docx?|pptx?|xlsx?|zip|rar|7z|mp4|mp3|csv)$/i.test(hrefLower)) return true;
          } catch (e) {
            // ignore
          }
        }
      }
    }

    // Check nearby visible text for keywords
    const text = (container.textContent || '').toLowerCase();
    if (text.includes('download') || text.includes('attachment') || text.includes('file')) return true;

    return false;
  } catch (e) {
    return false;
  }
}

async function startOverflowDownloads(limit = 100) {
  // Identify overflow triggers within visible content items
  const allTriggers = Array.from(document.querySelectorAll('button[aria-haspopup="menu"], [aria-haspopup="menu"][role="button"]'))
    .filter(isVisible);

  let success = 0;
  for (const trigger of allTriggers.slice(0, limit)) {
    try {
      closeOpenMenus();
      trigger.scrollIntoView({ block: 'center', inline: 'nearest' });
      trigger.click();
      
      // Wait for menu to appear
      let menu = null;
      const start = Date.now();
      while (Date.now() - start < 1500) {
        menu = findMenuForTrigger(trigger);
        if (menu) break;
        await sleep(100);
      }
      
      if (menu) {
        const found = findDownloadItemInMenu(menu);
        if (found) {
          safeClick(found.element);
          success++;
        }
      }
    } catch (e) {
      // continue
    }
    await sleep(200);
  }
  return { total: allTriggers.length, started: success };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request);

  if (request.action === 'getFiles') {
    // Expand iteratively, then collect by opening overflow menus and extracting download URLs
    (async () => {
      console.log('Starting file collection process...');
      
      // First collect any directly accessible file URLs before expanding
      const initialFiles = collectFiles();
      console.log('Initial files found before expanding:', initialFiles);
      
      // Expand all content sections
      console.log('Expanding all content sections...');
      await expandAll();
      console.log('Content sections expanded');
      
      // Collect files again after expansion
      const postExpandFiles = collectFiles();
      console.log('Files found after expansion:', postExpandFiles);
      
      // Identify and process overflow menus
      console.log('Processing overflow menus...');
      const allTriggers = Array.from(document.querySelectorAll('button[aria-haspopup="menu"], [aria-haspopup="menu"][role="button"], [aria-expanded="false"][aria-haspopup="true"]')).filter(isVisible);
      console.log(`Found ${allTriggers.length} potential overflow menu triggers`);
      
      const triggers = allTriggers.filter(isLikelyFileItem);
      console.log(`Filtered to ${triggers.length} likely file-related menu triggers`);
      
      const processedContainers = new Set();
      const foundUrls = [];
      
      for (const trigger of triggers) {
        const container = findItemContainer(trigger);
        if (container && processedContainers.has(container)) {
          console.log('Skipping already processed container');
          continue;
        }
        
        console.log('Processing menu trigger:', trigger.outerHTML.substring(0, 100));
        closeOpenMenus();
        
        try { 
          trigger.scrollIntoView({ block: 'center', inline: 'nearest' });
          console.log('Scrolled to trigger');
        } catch (e) {
          console.log('Error scrolling to trigger:', e);
        }
        
        // Click the trigger to open menu
        console.log('Clicking trigger to open menu');
        safeClick(trigger);
        
        // Wait for the menu to appear
        let menu = null;
        const start = Date.now();
        while (Date.now() - start < 1500) {
          menu = findMenuForTrigger(trigger);
          if (menu) {
            console.log('Menu found:', menu.outerHTML.substring(0, 100));
            break;
          }
          await sleep(100);
        }
        
        if (menu) {
          // Look for direct file links first in the menu
          const menuAnchors = Array.from(menu.querySelectorAll('a[href]'));
          for (const a of menuAnchors) {
            if (isLikelyFileUrl(a.href)) {
              console.log('Found direct file link in menu:', a.href);
              foundUrls.push(a.href);
            }
          }
          
          // Then check for download menu items
          const found = findDownloadItemInMenu(menu);
          if (found) {
            if (found.href && isLikelyFileUrl(found.href)) {
              console.log('Found download item with href in menu:', found.href);
              foundUrls.push(found.href);
            } else if (found.element) {
              console.log('Found download item without direct href, will click later');
              // attempt to click the download menu item so background download can capture
              safeClick(found.element);
              foundUrls.push('Download button in menu (click to download)');
            }
          }
        } else {
          console.log('No menu appeared after clicking trigger');
        }
        
        if (container) processedContainers.add(container);
        
        // Wait for menu to close
        const closeStart = Date.now();
        while (Date.now() - closeStart < 1500) {
          const anyMenus = getVisibleMenus();
          if (anyMenus.length === 0) break;
          await sleep(100);
        }
        await sleep(200);
      }
      
      // Combine all found URLs
      const combinedUrls = [...new Set([...initialFiles, ...postExpandFiles, ...foundUrls])];
      const filteredUrls = combinedUrls.filter(url => url && url !== 'Download button (click to download)' && url !== 'Download button in menu (click to download)');
      
      console.log('Combined unique files found:', filteredUrls.length);
      console.log('File URLs:', filteredUrls);
      
      sendResponse({ files: filteredUrls });
    })();
    return true; // keep the message channel open for async sendResponse
  }

  if (request.action === 'clickDownloads') {
    console.log('clickDownloads requested');
    (async () => {
      const result = await startOverflowDownloads();
      let anchorStarted = 0;
      const files = collectFiles().filter(f => f && !f.startsWith('Download button'));
      if (files.length > 0) {
        const unique = Array.from(new Set(files));
        unique.forEach(url => chrome.runtime.sendMessage({ action: 'downloadFile', url }));
        anchorStarted = unique.length;
      }
      sendResponse({ clicked: true, menu: result, anchorStarted });
    })();
    return true;
  }
});
