---
name: release
description: Release a new version (major, minor, patch, or none for rebuild only)
---

# Release Skill

Bump type: $ARGUMENTS (must be one of: major, minor, patch, none)

You have exactly 2 jobs:

## Job 1: Generate Release Notes

1. Read `docs/release-notes-style.md` for the style guide.
2. Gather commit data:
   ```bash
   git tag --sort=-v:refname
   # Pick the first tag that is NOT v<current_version>
   git log <LAST_TAG>..HEAD --no-merges --pretty=format:"%s"
   git diff <LAST_TAG>..HEAD --stat
   git diff <LAST_TAG>..HEAD --unified=2 --no-color
   ```
3. Compute target version:
   - `none`: use current version from `package.json`
   - Otherwise: compute next (e.g. 0.1.0 + minor → 0.2.0)
4. Analyze commits/diffs and write release notes following the style guide.
5. Write to `RELEASE_NOTES.md`:
   ```
   # Release Notes

   Version v<VERSION> — <Month Day, Year>

   <notes>
   ```
6. Show notes to user. **Wait for approval before proceeding.**
7. After approval, **commit and push** `RELEASE_NOTES.md`:
   ```bash
   git add RELEASE_NOTES.md
   git commit -m "docs: update release notes for v<VERSION>"
   git push
   ```
   This MUST happen before the build pipeline runs.

## Job 2: Version Bump, Tag & Push

After release notes are committed and pushed, run these steps:

If bump type is `none`, skip versioning — just retag and push:
```bash
version=$(node -p "require('./package.json').version")
git tag -a "v$version" -m "v$version"
git push origin "v$version"
```

If bump type is `major`, `minor`, or `patch`:
```bash
npm version <BUMP_TYPE> -m "v%s"
git push
git push origin "v$(node -p "require('./package.json').version")"
```

After the tag is pushed, GitHub Actions will automatically build the release artifacts. Use `gh` to find the specific run IDs and report to the user:

```bash
tag=$(git describe --tags --abbrev=0)
gh run list --repo darkharasho/axipulse --limit 5 --json databaseId,name,event,headBranch,url \
  --jq ".[] | select(.headBranch == \"$tag\")"
```

Report to the user:
- The new version number
- Link to the release page: `https://github.com/darkharasho/axipulse/releases/tag/<TAG>`
- Link to each GitHub Actions run triggered by the tag (with run name + direct URL)
- That the release will be published with Linux AppImage and Windows installer once CI completes

Do NOT run npm run build, electron-builder, or any other build commands yourself. CI handles all of it.
