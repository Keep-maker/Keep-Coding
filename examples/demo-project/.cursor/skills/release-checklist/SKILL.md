---
name: release-checklist
description: Steps to cut a release of this project, including changelog, version bump, and tagging.
---

# Release checklist

Use this whenever the user asks to release, publish, or bump a version.

1. Update `package.json` `version` following semver.
2. Add an entry to `CHANGELOG.md` with the date and a bullet list of user-visible changes.
3. Run the full test suite (`npm test`) and the type check (`npm run typecheck`).
4. Commit with the message `chore(release): vX.Y.Z`.
5. Tag the commit `vX.Y.Z` and push the tag.

Never skip step 3. If tests fail, stop and report the failure instead of tagging.
