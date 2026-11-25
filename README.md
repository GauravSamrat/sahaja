# SAHAJA v1.0.0

A lightweight personal task, focus, activity and finance workspace. The recommendation engine runs locally and explains its suggestions. The app uses plain HTML, CSS and JavaScript and has no runtime packages, accounts or backend.

From the extracted directory on Windows, run `powershell -File .\setup.ps1` with Node.js 22 or newer available. Open [Installation](INSTALL.md) for PWA installation, migration and HTTPS hosting.

- [User guide](USER_GUIDE.md)
- [Architecture and backup behavior](ARCHITECTURE.md)
- [AI interchange](AI_FORMAT.md) and [sample plan](sample-ai-plan.json)
- [Test report](TEST_REPORT.md) and [changelog](CHANGELOG.md)

Run `powershell -File .\test.ps1 -Browser` for the Node and Chromium suites. Run `powershell -File .\build.ps1` to rebuild and verify the release ZIP.
