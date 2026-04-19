# Release Notes

Version v0.1.9 — April 18, 2026

## Fix for Windows Parse Failures

If the EI CLI couldn't start because .NET 8.0 wasn't installed, you'd see a cryptic error code instead of anything useful. Now it tells you what's wrong and links you directly to the .NET 8.0 download page. The previous fix (v0.1.8) only caught one specific error code — this one covers the full range of Windows startup failures so it should fire reliably.
