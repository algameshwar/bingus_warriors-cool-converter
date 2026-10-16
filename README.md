# bingus_warriors cool converter

Still is a private file toolbox that runs directly in your browser. The Windows and Android apps remain available for larger jobs and full document support.

**Website:** https://algameshwar.github.io/bingus_warriors-cool-converter/

## Browser tools

- Video compression with 10, 20, 30 MB or custom targets; finished-size verification, two-pass H.264, optional trimming and resolution limits.
- Video conversion to MP4, WebM, MKV and short GIFs, plus audio extraction.
- MP3, M4A, WAV, OGG/Vorbis and FLAC conversion, trimming and optional peak-volume normalization.
- JPG, PNG and WebP conversion/resizing, plus images to PDF.
- PDF merge, page split/extraction, rotation, structure optimization and selectable-text extraction.
- Basic text conversion between modern Word (DOCX), PDF and plain text; PowerPoint (PPTX) text extraction and simple text PDFs.
- ZIP creation/extraction, JSON formatting/minification, JSON/CSV conversion, CSV/XLSX value conversion, Base64 and SHA-256.

Files are read with browser file APIs and processed locally. There is no upload endpoint, account, analytics service or conversion server.

The video/audio WebAssembly engine downloads on first use (about 32 MB) from a pinned public CDN URL. Processing uses a single worker, which works on ordinary GitHub Pages without cross-origin-isolation headers. Other tools load separately and do not wait for the video engine.

## Limits

- Media jobs accept up to 256 MB of input; other jobs accept up to 100 MB total. Device/browser memory can impose a lower practical limit. The apps are better for long or large files.
- Document conversion preserves basic text, not original artwork, images or complex page layouts. Browser PDF export supports the standard PDF font character set; unsupported characters produce an explicit error rather than silently corrupting text. Use the Windows app for full Office fidelity or broader fonts.
- PDF-to-text/Word requires selectable text; OCR and password handling are not included.
- Spreadsheet conversion exports first-worksheet values and saved formula results. It does not recalculate formulas or preserve formatting.
- ZIP extraction is limited to 200 entries and 100 MB expanded data. Unsafe paths are rejected.
- YouTube URL downloading requires the installed app. This site converts files selected from the device.
- Physical-phone performance has not been tested.

## Development

Node.js 20.19+ or 22.12+ is required by Vite.

    npm ci
    npm run dev
    npm run build

Editable code is in src/ and index.html. The build produces the complete static site in docs/. Commit both the source and docs/ when updating the public site. node_modules/ is excluded.

GitHub Pages uses **Deploy from a branch → main → /docs**. The relative build base supports the repository subpath.

## Downloads

The site retains links to these assets in the latest GitHub Release:

- Still-Toolbox-Windows-v3.zip
- Still-Android.apk

Download packages are release assets, not part of this site's Git history.

## Verification

Local checks used synthetic fixtures, exercised real browser conversion/download flows and reopened the outputs. See VERIFICATION.md for evidence and limits.

## License

Application source is GPL-3.0-or-later; see LICENSE. Third-party components retain their own licenses. See public/THIRD-PARTY-NOTICES.txt.

Do not commit personal media, conversion history, application data, credentials, Android signing keys or build caches.
