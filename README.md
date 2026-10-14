# Backup Guard Extension

[中文](./README.zh.md)

> Automatically backup files before destructive operations (write/edit/dangerous bash commands).

## Install

```bash
pi install git:github.com/ZouZhao321/pi-backup-guard
```

To use a local checkout instead (development), install the directory itself:

```bash
pi install ./.pi/agent/extensions/backup-guard
```

Requires the Pi coding agent and Node.js 22+ (see `engines` in `package.json`).

## What it does

The extension is loaded from `index.ts` (declared in `package.json` → `pi.extensions`) and registers exactly two things:

- **A `tool_call` listener** (`pi.on("tool_call")`) that snapshots files before they are touched:
  - `write` and `edit` → the backup target is the tool's `input.path`.
  - `bash` → the command is stripped of `2>&1`, split on `;`, `&&`, `||`, `|` and `&`, and only the segments matching the dangerous-command pattern `\b(?:rm|rmdir|del|rd|truncate|mv|Remove-Item|Move-Item)\b` (case-insensitive) are kept. Path tokens are extracted from those segments (flags such as `-rf` / `/q` and operators are skipped), `~` is expanded via `USERPROFILE` or `HOME`, and relative paths are resolved against the working directory.
  - Paths that are outside the working directory, inside `.backups/`, the working directory itself, or missing on disk are skipped.
  - All paths of one operation share a single timestamp (`YYYYMMDD-HHMMSS-` plus a 4-character random suffix).
  - Snapshot layout: files → `.backups/<relative-path>/<basename>_<timestamp><ext>`, directories → `.backups/<relative-path>/<timestamp>/`.
  - When a backup fails, the tool call is blocked with the failure reason. When a dangerous command yields no resolvable path, a warning is shown and the tool call proceeds. Notifications go through the UI when it is available; otherwise the extension stays silent.
- **The `/backups` command** (`pi.registerCommand("backups")`), which walks `.backups/` recursively, collects entries whose name matches `\d{8}-\d{6}-[a-z0-9]{4}`, and prints the 10 newest ones (via the UI when available, otherwise `console.log`).

There is no build or network step: the extension runs inside the Pi process and reads only the local filesystem.

## Overview

Backup Guard is a Pi extension that implements "backup first, execute later". Before performing any operation with side effects, it copies the affected files to a backup directory, allowing you to recover from mistakes.

### Coverage

| Tool | Behavior |
|------|----------|
| **write** | Back up target file before overwriting (new files are skipped automatically) |
| **edit**  | Back up target file before modifying |
| **bash**  | Detect dangerous commands (`rm`, `rmdir`, `del`, `rd`, `truncate`, `mv`, `Remove-Item`, `Move-Item`, etc.) and back up the involved files |

## Backup Directory Structure

Inspired by the `.history` convention:

```
<project>/.backups/<relative-path>/<basename>_<timestamp>.<ext>   ← file snapshot (for both modify & delete)
<project>/.backups/<relative-path>/<timestamp>/                  ← directory snapshot (for `rm -rf` whole trees)
```

Both deletion and modification use the same "pre-operation snapshot" approach. To restore, simply copy the snapshot back to the original path. Operation context can be traced through Pi session history.

## Usage

### Automatic Backups

Backup Guard runs automatically when you use `write`, `edit`, or `bash` tools. No manual setup is required.

- **Backup succeeded** → notification displayed → operation proceeds
- **Target file doesn't exist** → skipped (e.g., `write` creating a new file) → operation proceeds
- **Target inside `.backups/`** → skipped (prevents recursive self-copying) → operation proceeds
- **Target outside working directory** → skipped → operation proceeds
- **Backup failed (permission/disk)** → operation is BLOCKED

### Viewing Backups

Run the `/backups` command in Pi to see the 10 most recent backup entries.

### Cleaning Up

Manually delete unwanted files/directories under `.backups/`.

## Configuration

The default backup directory is `.backups/` under the current working directory. Only files within the working directory are processed.

> **Tip:** If your project is a git repository, add `.backups/` to `.gitignore`.

## Configuration Reference

| Setting | Default | Description |
|---------|---------|-------------|
| `BACKUP_DIR_NAME` | `".backups"` | Backup root directory name |
| `BLOCK_ON_BACKUP_FAILURE` | `true` | Whether to block the original operation when backup fails |

Both are constants in `index.ts`; the extension reads no configuration file. `USERPROFILE` (falling back to `HOME`) is read only to expand a leading `~` in a path.

## How It Works

1. **Intercept**: Pi triggers a `tool_call` event when `write`, `edit`, or `bash` is invoked.
2. **Analyze**: For `bash`, the extension parses the command to extract path tokens from dangerous segments.
3. **Backup**: Each candidate path is backed up with a timestamp (all paths in one operation share the same timestamp — "backed up together").
4. **Decide**: On success, the original operation proceeds; on failure, it is blocked (configurable).

## Commands

| Command | Description |
|---------|-------------|
| `/backups` | View the 10 most recent backup records |

## Safety

- **Recursive copy prevention**: Files inside `.backups/` are never backed up again.
- **Working directory guard**: Only files under the current working directory are processed.
- **Permission awareness**: Permission errors block the operation to prevent data loss.
- **Timestamp isolation**: Each backup operation uses a unique timestamp with a random suffix to prevent concurrent conflicts.

## Development

Install the dev dependencies:

```bash
npm install
```

Scripts declared in `package.json`:

| Script | Command | Purpose |
|--------|---------|---------|
| `npm test` | `node scripts/smoke.mjs` | Contract smoke test without a Pi runtime: asserts the registration points present in `index.ts` (`pi.on("tool_call")`, `pi.registerCommand("backups")`), that `package.json` → `pi.extensions` points at an existing entry file, and that `LICENSE` starts with `MIT License` |

Package contents dry run (what `npm pack` would ship, per `files` in `package.json`):

```bash
npm pack --dry-run
```

There is no build step: `index.ts` is loaded as-is, and `tsconfig.json` (`noEmit`) exists for editors and type checking only.

CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm test` and `npm pack --dry-run` on every push to `main` and on every pull request.

## License

MIT — see [LICENSE](./LICENSE).
