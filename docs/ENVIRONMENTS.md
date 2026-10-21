# ReplayKit — Supported Environments & System Matrix

ReplayKit is tested and supported across modern developer platforms and CI environments.

---

## 1. Operating System Support

| Operating System | Support Level | Shell Requirements | Notes |
| :--- | :--- | :--- | :--- |
| **Linux (Ubuntu 22.04 / 24.04, Debian 12)** | Tier 1 (Primary) | `bash`, `sh`, `zsh` | Native Docker performance; best suited for CI and server deployments. |
| **Windows 10 / 11 (x64)** | Tier 1 (Supported) | PowerShell 7+, Windows PowerShell 5.1 | Fully supported via Docker Desktop (WSL 2 backend). |
| **macOS (Sonoma, Sequoia) (arm64 / x86_64)** | Tier 1 (Supported) | `zsh`, `bash` | Supported via Docker Desktop or OrbStack. |

---

## 2. Platform Nuances & Best Practices

### Windows PowerShell
- **Script Files over Inline Strings**: On Windows PowerShell, complex inline CLI arguments with carets (`^`), template literals, or escaped quotes can cause stdin lockups. The ReplayKit CLI provides dedicated flags (`--config <file>`, `--output <file>`, `--test <file>`) to allow file-based execution.
- **Docker Volume Mounting**: ReplayKit uses private Docker named volumes and `docker cp` for staging payload files. This completely bypasses Windows/WSL host-mount permission issues and path format translation bugs (`/c/Users` vs `C:\Users`).

### Apple Silicon (macOS arm64)
- **Container Emulation**: ReplayKit pins standard Bookworm containers (`node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392`). On Apple Silicon, Docker Desktop executes under Rosetta 2 or native arm64 emulation cleanly.

---

## 3. Node.js & Tooling Matrix

| Tool | Version Requirement | Purpose |
| :--- | :--- | :--- |
| **Node.js** | `>=22.13.0 <25` | Host runtime and container runtime |
| **pnpm** | `10.20.0` | Workspace package management and script execution |
| **Docker** | Engine `>=20.10.0` | Ephemeral containerized evaluation |
| **Ollama** | `>=0.3.0` | Local offline AI inference service |
| **TypeScript** | `~5.9.3` | Type system and static AST test validation |
| **Vitest** | `~3.2.7` | Unit and integration test runner |

---

## 4. Container Base Images

ReplayKit pins all base images by immutable cryptographic SHA-256 digests:
- Pinned Node Image: `node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392`
