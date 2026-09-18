# Backup Guard Extension

> Automatically backup files before destructive operations (write/edit/dangerous bash commands).

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
<project>/backups/<relative-path>/<basename>_<timestamp>.<ext>   ← file snapshot (for both modify & delete)
<project>/backups/<relative-path>/<timestamp>/                  ← directory snapshot (for `rm -rf` whole trees)
```

Both deletion and modification use the same "pre-operation snapshot" approach. To restore, simply copy the snapshot back to the original path. Operation context can be traced through Pi session history.

## Usage

### Automatic Backups

Backup Guard runs automatically when you use `write`, `edit`, or `bash` tools. No manual setup is required.

- **Backup succeeded** → notification displayed → operation proceeds
- **Target file doesn't exist** → skipped (e.g., `write` creating a new file) → operation proceeds
- **Target inside `backups/`** → skipped (prevents recursive self-copying) → operation proceeds
- **Target outside working directory** → skipped → operation proceeds
- **Backup failed (permission/disk)** → operation is BLOCKED

### Viewing Backups

Run the `/backups` command in Pi to see the 10 most recent backup entries.

### Cleaning Up

Manually delete unwanted files/directories under `backups/`.

## Configuration

The default backup directory is `backups/` under the current working directory. Only files within the working directory are processed.

> **Tip:** If your project is a git repository, add `backups/` to `.gitignore`.

## Configuration Reference

| Setting | Default | Description |
|---------|---------|-------------|
| `BACKUP_DIR_NAME` | `"backups"` | Backup root directory name |
| `BLOCK_ON_BACKUP_FAILURE` | `true` | Whether to block the original operation when backup fails |

## Installation

### Prerequisites

- Pi Coding Agent
- Node.js 18+

### Install

```bash
# Clone the extension to your Pi agent extensions directory
git clone <repo-url> agent/extensions/backup-guard

# Or copy the directory manually
cp -r backup-guard agent/extensions/backup-guard
```

The extension is automatically loaded by Pi when placed under `agent/extensions/`.

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

- **Recursive copy prevention**: Files inside `backups/` are never backed up again.
- **Working directory guard**: Only files under the current working directory are processed.
- **Permission awareness**: Permission errors block the operation to prevent data loss.
- **Timestamp isolation**: Each backup operation uses a unique timestamp with a random suffix to prevent concurrent conflicts.
