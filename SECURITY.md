# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅ Active |

Only the latest release receives security updates.

---

## Reporting a Vulnerability

If you discover a security vulnerability in this Extension, **please report it responsibly**.

### How to Report

1. **Do NOT open a public issue.** Security vulnerabilities should not be disclosed publicly until a fix is available.

2. **Use GitHub's private vulnerability reporting:**  
   Go to the repository's **Security** tab → **Advisories** → **Report a vulnerability**.

3. **Alternatively, contact the maintainer directly** via the email listed in the repository profile.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment:** Within 48 hours
- **Assessment:** Within 7 days
- **Fix (if applicable):** Best effort, typically within 30 days for critical issues

---

## Security Considerations

### Sensitive Data Handled by the Extension

| Data | Storage | Risk |
|------|---------|------|
| GitHub Personal Access Token | `chrome.storage.local` | If browser profile is compromised, token could be extracted |
| GPG Private Key | `chrome.storage.local` | Same as above; key material is stored re-armored but not additionally encrypted |
| Committer Name/Email | `chrome.storage.local` | Low risk; included in public Git commits |

### Known Limitations

1. **`chrome.storage.local` is not encrypted** beyond what the browser/OS provides. Any process or extension with access to the browser's profile directory could theoretically read stored data.

2. **The Extension does not implement additional encryption** for stored tokens or keys. This is a deliberate trade-off: additional encryption would require a master password on every browser restart, significantly degrading usability.

3. **Content script runs on Steam pages.** If a Steam store page is compromised (XSS), the content script could theoretically extract incorrect data. However, the content script only reads DOM data and sends it to the service worker — it has no access to extension storage or tokens.

4. **GPG passphrase is not persisted.** It is used only during key import to decrypt the key, then discarded. The decrypted key material is stored, not the passphrase.

### Mitigations

- Use a GitHub token with **minimum required scope** (`repo` or `public_repo` only).
- Regularly **rotate your GitHub token**.
- If using GPG signing, consider using a **dedicated signing subkey** rather than your primary key.
- Review the Extension's source code before installing — it is fully open-source under GPL-3.0.

---

## Scope

This security policy covers the Extension's source code and its direct interactions with `api.github.com` and `store.steampowered.com`. It does **not** cover:

- Vulnerabilities in Chrome/Chromium itself
- Vulnerabilities in the GitHub API or Steam platform
- Vulnerabilities in the openpgp.js library (report those to [openpgpjs/openpgpjs](https://github.com/openpgpjs/openpgpjs))
- Issues arising from user misconfiguration (e.g., using a token with excessive permissions)
