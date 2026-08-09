# Multi-Runner Profiles

## Problem

The original runner CLI stored its configuration in a single hardcoded file at `~/.deployx/runner.json`. This meant **only one runner could be registered per machine**. If a user wanted to run pipelines for multiple organizations (e.g., their own projects and a friend's), they had to unregister and re-register each time.

## Solution

Runner configurations are now stored as **profiles** in `~/.deployx/runners/{profile}.json`. Each profile is an independent runner with its own token, control plane URL, and runner ID. Multiple runners can be registered and started simultaneously on the same machine.

### Directory Structure

```
~/.deployx/
├── runners/
│   ├── my-runner.json         # Profile for your org
│   ├── friend-runner.json     # Profile for friend's org
│   └── staging-runner.json    # Profile for staging env
└── ports.json                 # Port allocator state
```

Each profile file contains:

```json
{
  "runner_id": "uuid",
  "token": "registration-token",
  "control_plane_url": "https://deployx-chi.vercel.app",
  "name": "my-runner"
}
```

Files are created with `0600` permissions (owner-only read/write).

## CLI Changes

All commands now accept an optional `--profile` flag:

```bash
# Register
deployx-runner register --token <T> --url <U> --name <N> [--profile <P>]

# Start
deployx-runner start [--profile <P>]

# Status
deployx-runner status [--profile <P>]

# Unregister
deployx-runner unregister [--profile <P>]

# List all profiles (new command)
deployx-runner list
```

### Auto-Selection

When `--profile` is omitted:
- **register**: profile defaults to the `--name` value
- **start / unregister**: if exactly one profile exists, it is auto-selected. If multiple exist, the command prints the list and asks the user to specify `--profile`.
- **status**: if multiple profiles exist and no `--profile` given, shows a summary of all runners.

## Usage Examples

### Register multiple runners

```bash
# Register your own org's runner
deployx-runner register \
  --token TOKEN_A \
  --url https://deployx-chi.vercel.app \
  --name my-runner

# Register a friend's org runner
deployx-runner register \
  --token TOKEN_B \
  --url https://deployx-chi.vercel.app \
  --name friend-runner
```

### List all runners

```bash
deployx-runner list
# 2 runner(s) registered:
#
#   my-runner
#     Name:          my-runner
#     ID:            72244555-...
#     Control Plane: https://deployx-chi.vercel.app
#
#   friend-runner
#     Name:          friend-runner
#     ID:            a1b2c3d4-...
#     Control Plane: https://deployx-chi.vercel.app
```

### Start runners (in separate terminals)

```bash
# Terminal 1
deployx-runner start --profile my-runner

# Terminal 2
deployx-runner start --profile friend-runner
```

### Unregister a specific runner

```bash
deployx-runner unregister --profile friend-runner
```

## Backwards Compatibility

Existing installations with the old `~/.deployx/runner.json` format are **automatically migrated** on first command:

1. The old config is read
2. `~/.deployx/runners/` directory is created
3. Config is moved to `~/.deployx/runners/{name}.json`
4. Old file is deleted
5. A migration message is logged

No manual intervention required.

## Files Changed

| File | Change |
|------|--------|
| `apps/runner/src/config.ts` | Profile-based config paths, `listProfiles()`, `resolveProfile()`, auto-migration |
| `apps/runner/src/cli.ts` | `--profile` option on all commands, new `list` command |
| `apps/runner/src/commands/register.ts` | Profile-aware registration |
| `apps/runner/src/commands/start.ts` | Profile-aware startup with auto-selection |
| `apps/runner/src/commands/status.ts` | Multi-profile status display |
| `apps/runner/src/commands/unregister.ts` | Profile-aware unregistration |
| `apps/runner/src/commands/list.ts` | New command — lists all registered profiles |

## Architecture Note

No server-side changes were needed. The Control Plane already supports multiple runners per organization via the `runner_registrations` table (scoped by `org_id`). The multi-profile feature is purely a client-side improvement to the runner CLI.
