# MultiFormat Data Converter

A modern, fast, and privacy-first data conversion tool that runs entirely in the browser. Convert between JSON, CSV, TSV, XML, YAML and plain text — no data leaves your device.

✨ Features

- Core Formats: JSON, CSV, TSV, XML, YAML, Plain Text.
- Automatic detection: Heuristic detection of common text formats on paste/upload.
- Privacy-first: 100% client-side — no backend, no upload.
- Large file handling: Optimized parsing and streaming-friendly approaches for large datasets.
- Drag & Drop: Quick file import with file preview and detection.
- Responsive UI: Tailwind CSS-based dark UI with responsive access (logo-only fallback on very small screens).
- One-click actions: Convert, copy to clipboard, and download output.
- Accessible & usable: Native select controls, keyboard-friendly, and compact layout for small screens.
- Lightweight XML handling: Browser-safe XML → JS and JS → XML helpers (no Node-only deps).

🛠 Tech Stack

- React + Vite
- Tailwind CSS for styling
- Icons: Lucide React
- Parsers & utils: papaparse, js-yaml, file-saver
- Browser-safe XML helpers (DOMParser based) to avoid Node-only dependencies

Getting started

1. Clone
   git clone https://github.com/harsh98trivedi/multiformat-data-converter.git
   cd multiformat-data-converter

2. Install
   npm install

3. Run dev
   npm run dev

4. Build
   npm run build

Deployment (GitHub Pages)

- Set `vite.config.js` base to your repo name, e.g.:
  ````export default defineConfig({
  plugins: [react()],
  base: '/multiformat-data-converter/',
  })```
  ````
- Build and deploy via gh-pages or your preferred workflow.

Notes & contributions

- For more examples and previous projects, see my GitHub: https://github.com/harsh98trivedi

Made with ❤️ by Harsh Trivedi
