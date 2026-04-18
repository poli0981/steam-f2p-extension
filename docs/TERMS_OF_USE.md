# Terms of Use

**Last updated:** April 2026  
**Applies to:** Steam F2P Tracker Extension (Chrome/Chromium) — v1.5.1

---

## Acceptance of Terms

By installing, copying, or otherwise using the Steam F2P Tracker Extension ("the Extension"), you agree to be bound by
these Terms of Use. If you do not agree to these terms, do not install or use the Extension.

---

## License

The Extension is licensed under the **GNU General Public License v3.0 (GPL-3.0-only)**. The full license text is
available in the [LICENSE](LICENSE) file.

Under GPL-3.0, you are free to:

- **Use** the Extension for any purpose
- **Study** how the Extension works and modify it
- **Distribute** copies of the Extension
- **Distribute** copies of your modified versions

Subject to the condition that:

- Any distributed copies or modified versions must also be licensed under GPL-3.0
- You must make the source code available when distributing the Extension
- You must retain all copyright and license notices

### Third-Party Components

| Component  | License  | Notes                                              |
|------------|----------|----------------------------------------------------|
| openpgp.js | LGPL-3.0 | Located in `lib/openpgp.min.mjs`. Used unmodified. |

The LGPL-3.0 license of `openpgp.js` is compatible with GPL-3.0. The `openpgp.js` library retains its own license terms.

---

## Permitted Use

You may use the Extension to:

- Detect free-to-play games on Steam store pages
- Queue detected games for submission to a GitHub repository
- Push game metadata to a GitHub repository you own or have write access to
- Sign commits with your own GPG key

---

## Prohibited Use

You agree **not** to use the Extension to:

- Violate Steam's [Terms of Service](https://store.steampowered.com/subscriber_agreement/)
  or [API Terms of Use](https://steamcommunity.com/dev/apiterms)
- Violate GitHub's [Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)
  or [API Terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features)
- Scrape Steam store pages at a rate that constitutes abuse or denial of service
- Push malicious, misleading, or illegal content to any repository
- Impersonate other users or organizations in commit signatures
- Distribute modified versions that remove or obscure these terms or the GPL-3.0 license
- Use the Extension as part of any commercial service without complying with GPL-3.0

---

## Your Responsibilities

By using the Extension, you acknowledge and agree that:

1. **Token Security:** You are solely responsible for the security of your GitHub Personal Access Token. Do not share
   your token or use tokens with excessive permissions.

2. **Repository Content:** You are responsible for all content pushed to your repository by the Extension. Review queued
   entries before pushing.

3. **GPG Key Security:** If you use GPG signing, you are responsible for the security of your private key. The Extension
   stores key material in browser local storage.

4. **Compliance:** You are responsible for ensuring your use of the Extension complies with all applicable laws, Steam's
   terms, and GitHub's terms.

5. **Data Accuracy:** You understand that game metadata extracted by the Extension may not be 100% accurate and should
   not be relied upon as a definitive source.

---

## Disclaimer of Warranties

THE EXTENSION IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. THE DEVELOPER MAKES NO WARRANTIES
REGARDING THE EXTENSION'S FUNCTIONALITY, RELIABILITY, AVAILABILITY, OR SUITABILITY FOR ANY PURPOSE.

See the full [Disclaimer](DISCLAIMER.md) for detailed warranty disclaimers.

---

## Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE DEVELOPER BE LIABLE FOR ANY INDIRECT,
INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY
OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM:

- Your use of or inability to use the Extension
- Any unauthorized access to or alteration of your data or repositories
- Any bugs, errors, or inaccuracies in the Extension
- Any third-party conduct or content
- Any other matter relating to the Extension

---

## Modifications to the Extension

The developer reserves the right to modify, update, or discontinue the Extension at any time without prior notice.
Continued use after modifications constitutes acceptance of any changes.

---

## Termination

These terms are effective until terminated. Your rights under these terms will terminate automatically if you fail to
comply with any of its provisions. Upon termination, you must cease all use and destroy all copies of the Extension.

---

## Severability

If any provision of these terms is found to be unenforceable or invalid, that provision shall be limited or eliminated
to the minimum extent necessary so that these terms shall otherwise remain in full force and effect.

---

## Governing Law

These terms shall be governed by and construed in accordance with applicable open-source software conventions and the
laws of the jurisdiction in which the developer resides, without regard to conflict of law principles.

---

## Contact

For questions regarding these terms, please [open an issue](https://github.com/poli0981/steam-f2p-extension/issues)
on the repository.
