# Release Notes

Version v0.1.8 — April 18, 2026

## Fix for Windows Parse Failures

If the EI CLI failed to run because .NET 8.0 wasn't installed, you'd just see a cryptic "EI CLI exited with code 2147516547" error. Now it tells you what's actually wrong and points you directly to the .NET 8.0 download page so you can fix it.
