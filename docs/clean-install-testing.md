# Clean installation testing

Mentionish has one automated release smoke path for every supported desktop operating system:

    npm run smoke:clean-install

The command starts the same API and dashboard used by `npm start`, but it:

- disables browser opening;
- reserves unused loopback ports;
- creates a unique temporary data directory;
- disables experimental Reddit discovery;
- verifies the dashboard responds;
- verifies the origin-restricted local token bootstrap;
- verifies the authenticated local-data endpoint and current schema;
- confirms the database stays inside the temporary directory;
- creates and downloads an integrity-checked backup;
- validates both database and backup SQLite signatures;
- stops both development processes and removes its temporary data.

It never reads, resets, or writes the user's normal Mentionish workspace. It does not call an AI provider, Hacker News, Reddit, OpenCLI, or any platform write surface.

## Continuous integration

GitHub Actions runs the following matrix on `ubuntu-latest`, `macos-latest`, and `windows-latest` with Node.js 22 and npm 11.9.0:

1. `npm ci` from the committed lockfile;
2. `npm run check` for formatting, lint, types, tests, and production builds;
3. `npm run smoke:clean-install` for the real local startup path.

The matrix runs for pull requests, pushes to `main`, and manual workflow dispatches. A local Windows pass proves the Windows path on the current machine; macOS and Linux are considered verified only after their hosted jobs pass.

## Manual clean-clone acceptance

Before tagging a public release, also test from a new directory on each supported operating system:

    git clone <repository-url>
    cd Mentionish
    npm install
    npm start

Confirm that the browser opens without login, the first-run workspace appears, a product survives restart, and Settings can create a backup. Real AI-provider and experimental connector acceptance remains a separate opt-in test because CI never receives user credentials or browser sessions.

## Updating an existing installation

Create a backup from **Settings → Local data** before upgrading. Then stop Mentionish and update the checkout:

    git pull --ff-only
    npm install
    npm start

`npm start` applies pending embedded-database migrations before serving the workspace. Product data and encrypted provider settings remain in the local application-data directory rather than the Git checkout, so replacing or updating repository files does not replace the workspace. Review release notes before upgrading across multiple versions.
