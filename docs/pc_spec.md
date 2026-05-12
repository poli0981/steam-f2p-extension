# Developer PC Specification

> **Note:** This is the maintainer's personal development machine. It is shared
> across every project the developer ([poli0981](https://github.com/poli0981))
> works on — it is **not** the minimum requirement to run or contribute to
> this extension. End users only need a Chromium-based browser (see
> [REQUIREMENTS.md](../REQUIREMENTS.md)).

Vietnamese mirror: [docs/i18n/vi/pc_spec.md](i18n/vi/pc_spec.md).

## Primary developer machine

| Component | Details |
|-----------|---------|
| **OS** | Windows 11 Pro 25H2 Insider Preview (Dev Channel) |
| **Build** | 26300.8376 |
| **CPU** | Intel Core i7-14700KF |
| **GPU** | NVIDIA GeForce RTX 5080 (16 GB VRAM) |
| **RAM** | 32 GB DDR5 |
| **Storage** | 1 TB SSD |
| **IDE** | JetBrains IDEs (paid lineup) 2026.x + VS Code |

## Mobile test devices (web checks)

- iPhone 14 Pro — iOS 26.x — Chrome, Brave
- iPhone 13 Pro Max — iOS 26.x — Chrome, Brave

## Toolchain on the dev machine

Only toolchains actively used across the developer's projects are listed.
If a project does not pull a given runtime/SDK, it is not relevant to that
project — see [dev_env.md](dev_env.md) for what this extension specifically
needs.

- Python 3.12.x, 3.14.x
- Node.js >= 25.8.1
- Rust stable (via rustup)
- Git (recent) with GPG signing on (`commit.gpgsign=true`)
- .NET 8.x, 9.x, 10.x, 11.x (preview)

New runtime/SDK versions will be listed here as they are adopted by an
active project.

## Companion documents in this repo

| Document | Purpose |
|----------|---------|
| [dev_env.md](dev_env.md) | IDE + language toolchain + dev workflow for this extension specifically |
| [i18n/vi/pc_spec.md](i18n/vi/pc_spec.md) | Vietnamese mirror of this file |
| [i18n/vi/dev_env.md](i18n/vi/dev_env.md) | Vietnamese mirror of dev_env |
| [../REQUIREMENTS.md](../REQUIREMENTS.md) | End-user runtime requirements |
