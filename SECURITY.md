# Security policy

## Supported versions

Mentionish is preparing its first public release. Security fixes are applied to the current `main` branch. After versioned releases begin, only the latest release line and `main` will receive security fixes unless a release note says otherwise.

## Reporting a vulnerability

Please do not disclose a suspected vulnerability in a public issue, discussion, screenshot, scan export, or pull request.

Use GitHub's **Report a vulnerability** private security-advisory form for this repository when it is available. Include:

- the affected version or commit;
- the operating system and Node.js version;
- minimal reproduction steps;
- expected and observed behavior;
- the likely impact;
- a redacted proof of concept.

Never send real API keys, browser cookies, installation tokens, local databases, backups, or identifiable source conversations. Replace sensitive values with clearly marked placeholders. If private vulnerability reporting is unavailable, open a minimal public issue asking the maintainer to enable a private reporting channel; do not include exploit details.

You should receive an acknowledgement within seven days. Validation and remediation timing depends on severity and reproducibility. Please allow a reasonable remediation period before coordinated disclosure.

## Security boundaries

Mentionish is a single-user local application. Its API is loopback-bound and protected by exact-origin bootstrap plus a random installation token. AI credentials are stored in an encrypted local file vault and are never returned to the dashboard after saving.

Experimental platform connectors use upstream local tools and may stop working or expose the platform account to enforcement. Mentionish provides supervised reads and manual reply assistance only. It has no platform posting, commenting, voting, liking, following, messaging, editor-insertion, account-rotation, or enforcement-bypass operation.

Reports about a vulnerability in Mentionish's integration boundary are in scope. Vulnerabilities solely inside an upstream tool or platform should also be reported to that upstream maintainer or platform through its own security process.
