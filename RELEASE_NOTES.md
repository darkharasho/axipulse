# Release Notes

Version v0.1.4 — April 17, 2026

## Fixes

Fixed the taskbar icon on Windows light theme. The black icon wasn't loading in packaged builds because the icon files live in `dist-react/img/` after the Vite build, not `public/img/` — so Electron was silently falling back to the white exe icon. Light-theme users would see an invisible icon on their taskbar.
