# Browser release verification — 2026-10-16

The production build was checked in a real Chromium browser using synthetic local files. Converted downloads were saved and reopened with native FFprobe, pdf-lib, ZIP and CSV parsers, or round-trip conversion.

Passed:

- An eight-second 1.75 MB H.264/AAC sample compressed to about 461 KB, below the custom 0.5 MB target. H.264 output was confirmed with FFprobe.
- MP4, WebM, MKV and GIF output, including one-second video trims.
- MP3, M4A, WAV and FLAC audio output; trimmed and peak-normalized OGG/Vorbis output.
- PNG-to-WebP conversion and proportional resizing to 160 pixels wide.
- PDF merge, rotation and selected-page split into a ZIP.
- DOCX to selectable PDF to editable DOCX, with the source text recovered.
- CSV quoted commas and multiline fields; CSV to XLSX to CSV value preservation.
- ZIP creation preserving binary image bytes, and extraction links.
- Binary Base64 encode/decode and a SHA-256 digest matching the native checksum.
- Remembered custom settings after reload and active conversion cancellation.
- No POST or upload requests during the checks.
- Desktop layout at 1536 × 1024 and a 390 × 844 phone viewport without horizontal overflow.

The in-app browser was used first to inspect the surface and choose a synthetic video. Its file picker returned very slowly, so repeatable file checks and saved captures used a local Playwright Chromium runner. The test browser needed permission outside the shell sandbox to save generated downloads.

## Scope and limits

These checks establish browser behavior on the development machine, not physical-phone performance or full compatibility with every browser.

Word/PDF and PowerPoint/PDF conversion is explicitly text based. Scanned PDF OCR, complex Office layout fidelity, password handling, full spreadsheet formula calculation and YouTube URL downloading remain app/other-tool tasks.

The browser encoder uses H.264 for MP4/MKV, VP8/Vorbis for WebM, and Vorbis for OGG. It avoids core-library codec paths that failed real output checks. Each media job releases its worker after completion; the downloaded core is reused within the session.

## Visual review

The generated concept and desktop/phone captures were viewed directly. The retained waveform mark, indigo accent, upload area, settings geometry, two-column desktop workspace, result panel, category row and secondary download area follow the concept.

Intentional functional differences: the requested product name is displayed above the workspace; the original vector logo is retained; empty results show an honest empty state; Documents is a sixth category; advanced settings, cancellation and remembered settings are functional additions; the phone view uses a native category selector above the form. No demonstration file or fake result ships in the initial state.
