// Function to show status message
function showStatus(message) {
  const statusElem = document.getElementById('status');
  statusElem.textContent = message;
  statusElem.style.display = 'block';
}

// Function to show file list
function showFiles(files) {
  const fileListElem = document.getElementById('fileList');
  fileListElem.innerHTML = '';
  fileListElem.style.display = 'block';
  
  if (files && files.length > 0) {
    const header = document.createElement('h3');
    header.textContent = `Found ${files.length} file(s)`;
    fileListElem.appendChild(header);
    
    files.forEach(file => {
      // Get filename from URL
      let filename = '';
      try {
        const url = new URL(file);
        filename = url.pathname.split('/').pop().split('?')[0];
        // Use query param filename if available
        const disposition = url.searchParams.get('response-content-disposition');
        if (disposition && disposition.includes('filename=')) {
          const match = disposition.match(/filename=["']?([^"']+)/i);
          if (match && match[1]) {
            filename = match[1];
          }
        }
      } catch (e) {
        filename = file.split('/').pop().split('?')[0] || file;
      }
      
      // Clean up filename
      filename = decodeURIComponent(filename).replace(/[+]/g, ' ');
      
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      fileItem.textContent = filename || 'Unnamed file';
      fileItem.title = file;
      fileListElem.appendChild(fileItem);
    });
  } else {
    fileListElem.innerHTML = '<p>No files found. Try refreshing the page or expanding content sections manually.</p>';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('downloadAll').addEventListener('click', function() {
  console.log('Download All clicked');
  const downloadBtn = document.getElementById('downloadAll');
  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Finding files...';
  showStatus('Expanding content sections and looking for files...');
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab) {
      console.log('No active tab');
      showStatus('Error: No active tab found');
      downloadBtn.disabled = false;
      downloadBtn.textContent = 'Download All';
      return;
    }
    
    // First, ask the content script to expand and collect
    chrome.tabs.sendMessage(tab.id, { action: 'getFiles' }, (response) => {
      console.log('GetFiles response:', response);
      
      if (chrome.runtime.lastError) {
        showStatus(`Error: ${chrome.runtime.lastError.message}`);
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download All';
        return;
      }
      
      if (!response || !response.files) {
        showStatus('Error: No response from page. Try refreshing the page.');
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download All';
        return;
      }
      
      const files = response.files;
      showFiles(files);
      
      if (files.length === 0) {
        showStatus('No files found. Try refreshing the page or expanding content sections manually.');
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download All';
        return;
      }
      
      // Show downloading status
      showStatus(`Starting download of ${files.length} files...`);
      downloadBtn.textContent = `Downloading ${files.length} files...`;
      
      // Trigger downloads
      chrome.tabs.sendMessage(tab.id, { action: 'clickDownloads' }, (downloadResponse) => {
        console.log('clickDownloads response:', downloadResponse);
        
        if (downloadResponse && downloadResponse.clicked) {
          const totalStarted = (downloadResponse.menu?.started || 0) + (downloadResponse.anchorStarted || 0);
          showStatus(`Downloads started: ${totalStarted} files`);
        } else {
          showStatus(`Downloads initiated. Check your download manager.`);
        }
        
        // Re-enable button
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download All';
      });
    });
  });
});
});
