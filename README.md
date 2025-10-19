# Blackboard Files Downloader

A Chrome extension that automatically downloads files from Blackboard Learning Management System.

## Features

- Automatically detects files in Blackboard pages
- Downloads files with a single click
- Works with various Blackboard domains and installations
- Simple and intuitive user interface

## Installation

### Chrome Web Store (Recommended)

1. Visit the [Chrome Web Store page](https://chrome.google.com/webstore/detail/[extension-id])
2. Click "Add to Chrome"
3. Confirm the installation

### Manual Installation (Developer Mode)

1. Download the latest release zip from [Releases](https://github.com/your-username/blackboard-downloader/releases) or clone this repository
2. Unzip the file
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" at the top right
5. Click "Load unpacked" and select the unzipped folder

## Usage

1. Navigate to any Blackboard page containing downloadable files
2. Click the extension icon in your browser toolbar
3. The extension will scan for available files
4. Click on files to download them

## Development

### Prerequisites

- Google Chrome or compatible browser
- Basic knowledge of HTML, CSS, and JavaScript

### Rebuilding Icons

If you need to regenerate the icons, you can use these commands:

```bash
cd /path/to/extension
convert icons/icon.png -resize 16x16 icons/icon_16.png
convert icons/icon.png -resize 48x48 icons/icon_48.png
convert icons/icon.png -resize 128x128 icons/icon_128.png
```

## License

[Specify your license here]

## Author

[Your Name] - Initial work

## Acknowledgments

- [Anyone you want to acknowledge]