# Context-Aware Windows Notifications for GitHub Copilot CLI

A Windows notification layer for **GitHub Copilot CLI** that surfaces important Copilot events only when the relevant CLI session is not already visible.

The project combines **Copilot hooks, PowerShell, Win32 APIs, Windows UI Automation, Windows Terminal, and BurntToast** to answer a simple question:

> **Does Copilot actually need my attention right now?**

Instead of showing a toast every time Copilot finishes or needs input, the system checks the user's current Windows context and suppresses the notification when the exact Copilot CLI tab is already selected.

## Install with npm

The working notification system is now distributed as a **public npm package**. You can install it on a Windows machine with a single command:

```powershell
npm install -g copilot-notify
```

The installer configures the Copilot hooks, installs the Windows notification script and bundled Copilot mascot, adds the stable Terminal-title wrapper, sets `updateTerminalTitle` to `false`, and verifies the installation.

### Requirements

The package is designed for:

- Windows
- Windows Terminal
- Windows PowerShell
- GitHub Copilot CLI
- Node.js 18+
- BurntToast

The installer checks the required components and reports any missing dependency.

### Verify the installation

After installation, start a new PowerShell session if needed so the profile wrapper is loaded, then run:

```powershell
copilot-notify status
copilot-notify test
```

`status` verifies the installed CLI entry point, while `test` sends a real Windows notification using the same PowerShell notification path used by Copilot hooks.

### Using the package

There is no separate application to launch. Once installed, continue using GitHub Copilot CLI normally. The configured Copilot hooks automatically produce notifications when attention is needed:

- Copilot needs permission.
- Copilot needs additional input.
- A background agent/subagent finishes.
- The main Copilot agent finishes a turn.

The notification is suppressed when the exact Copilot CLI Terminal tab is already selected.

## What it does

The system currently handles these Copilot CLI events:

| Event | Notification |
|---|---|
| `permission_prompt` | Copilot needs approval |
| `agent_completed` | A background Copilot agent/subagent finished |
| `elicitation_dialog` | Copilot needs additional input |
| `agentStop` | The main Copilot agent finished a turn |

The notification decision is context-aware:

| User state | Result |
|---|---|
| Exact Copilot CLI tab is selected | No notification |
| Another Windows Terminal tab is selected | Notification |
| Another Windows Terminal window is active | Notification |
| Brave/Chrome/another application is active | Notification |
| UI Automation cannot determine the tab | Notification (fail-open) |
| `WT_SESSION` is unavailable | Notification (fail-open) |

### VS Code Copilot is intentionally excluded

The same user-level Copilot hook infrastructure can also be used by Copilot in VS Code. The notification script therefore checks the incoming hook payload and ignores the VS Code-compatible `Stop` event.

This keeps the project focused on **Copilot CLI notifications**:

```text
VS Code Copilot
      |
      v
 Stop hook
      |
      v
 copilot-notify.ps1
      |
      +--> hook_event_name = "Stop"
      |
      v
   EXIT
      |
   No toast
```

Copilot CLI continues through the context-aware Windows logic:

```text
Copilot CLI
    |
    v
agentStop / notification event
    |
    v
copilot-notify.ps1
    |
    +--> Is another application foreground?
    |        |
    |        +--> Yes -> show toast
    |
    +--> Is Windows Terminal foreground?
             |
             v
        Find exact Copilot tab
             |
             v
        Is tab selected?
          /         \
        Yes          No
         |            |
      No toast      Toast
```

## Why this project exists

Copilot CLI already exposes lifecycle hooks and notification events. The missing piece was **desktop context awareness**.

A simple notification hook cannot distinguish between:

- Copilot finishing while you are staring directly at it.
- Copilot finishing in a background Terminal tab while you are doing something else.
- Copilot finishing while you are working in another application.

This project adds that missing layer.

The core principle is:

> **Notify when attention is needed, not merely when an event occurs.**

## How it works

### 1. Copilot emits a hook event

GitHub Copilot CLI invokes a configured hook when an event occurs.

```text
Copilot CLI
    |
    v
~/.copilot/hooks/notification-hooks.json
```

The hook passes the event to the PowerShell notification script.

### 2. The PowerShell script identifies the current Windows context

The script uses the Win32 APIs:

- `GetForegroundWindow()` to identify the foreground window.
- `GetWindowThreadProcessId()` to identify the process owning that window.

If the foreground application is not Windows Terminal, the Copilot session is considered out of view and the notification is shown.

### 3. Windows Terminal tabs are inspected with UI Automation

When Windows Terminal is foreground, the script uses Windows UI Automation to inspect Terminal `TabItem` controls.

The relevant selection check is:

```text
SelectionItemPattern.IsSelected
```

This allows the script to distinguish the exact selected Terminal tab from other tabs in the same Terminal window.

### 4. Each Copilot CLI session gets a stable tab identity

The PowerShell wrapper reads:

```powershell
$env:WT_SESSION
```

and gives the Copilot tab a stable title such as:

```text
Copilot [3f5f2596]
```

The notification script reads the same `WT_SESSION` value and reconstructs the expected tab title.

This gives us the mapping:

```text
Copilot session
      |
      +--> WT_SESSION
              |
              v
      Copilot [XXXXXXXX]
              |
              v
      Windows Terminal TabItem
              |
              v
      IsSelected?
```

### 5. BurntToast renders the notification

When the Copilot CLI session is not visible, the script uses the PowerShell **BurntToast** module to generate the Windows desktop toast.

```powershell
Import-Module BurntToast
New-BurntToastNotification -Text $Title, $Message
```

## Architecture

```text
                    GitHub Copilot CLI
                            |
                    native hook event
                            |
                            v
              notification-hooks.json
                            |
                            v
                   copilot-notify.ps1
                            |
              +-------------+-------------+
              |                           |
              v                           v
     Foreground window              Hook source check
        Win32 APIs                  CLI vs VS Code
              |                           |
              v                           v
       Windows Terminal             VS Code Stop?
              |                     /          \
              v                   Yes          No
       UI Automation                |            |
              |                  EXIT           v
              v                              Continue
      Exact TabItem selected?
          /           \
        Yes            No
         |              |
     No toast          v
                   BurntToast
                       |
                       v
               Windows desktop toast
```

## Files

The current implementation uses:

```text
%USERPROFILE%\.copilot\
└── hooks\
    ├── notification-hooks.json
    └── copilot-notify.ps1
```

A PowerShell profile wrapper is also used to assign the stable Copilot Terminal tab title.

The repository contains the interactive documentation page for the project.

## Configuration

The Copilot Terminal title feature should be disabled so Copilot does not continuously replace the stable tab identity:

```json
"updateTerminalTitle": false
```

The stable title is required by the UI Automation lookup.

## Setup

The recommended setup is the public npm package:

```powershell
npm install -g copilot-notify
```

The installer performs the Windows-specific setup automatically:

1. Checks Windows PowerShell, GitHub Copilot CLI, Windows Terminal, Node.js, and BurntToast.
2. Creates the Copilot hooks directory.
3. Backs up an existing `notification-hooks.json` when present.
4. Installs `copilot-notify.ps1`.
5. Installs the bundled Copilot mascot.
6. Generates the hook configuration with the correct local script path.
7. Installs the PowerShell `copilot` wrapper used for stable Terminal tab titles.
8. Sets `updateTerminalTitle` to `false`.
9. Verifies the installation.

If PowerShell execution policy prevents BurntToast from loading, the currently tested setup uses:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Then restart your PowerShell/Windows Terminal session and restart Copilot CLI so the installed hook configuration and wrapper are active.

### Manual implementation details

The npm package automates the existing implementation. The underlying Copilot hook files are installed under:

```text
%USERPROFILE%\.copilot\hooks\
├── notification-hooks.json
└── copilot-notify.ps1
```

If `COPILOT_HOME` is set, Copilot uses that location instead.

## Verification

The important scenarios are:

### Same Copilot CLI tab

```text
Copilot CLI working
      |
You stay on the exact Copilot tab
      |
Copilot finishes
      |
No toast
```

### Another Terminal tab

```text
Copilot CLI working in Tab A
      |
You switch to Tab B
      |
Copilot finishes
      |
Toast displayed
```

### Another application

```text
Copilot CLI working
      |
You switch to Brave / Chrome / VS Code
      |
Copilot finishes
      |
Toast displayed
```

### VS Code Copilot

```text
Copilot Agent in VS Code finishes
      |
Stop hook
      |
Ignored by copilot-notify.ps1
      |
No toast
```

## Design decisions

### Why not just check whether Windows Terminal is open?

Because that does not tell us whether the **specific Copilot tab** is visible.

The system must distinguish between:

```text
Windows Terminal open
```

and:

```text
The exact Terminal tab containing this Copilot session is selected
```

UI Automation provides that distinction.

### Why use `WT_SESSION`?

Windows Terminal exposes a session identifier for each terminal session. Using the identifier to create a stable tab title gives the notification script a reliable way to map the Copilot process back to the Terminal tab containing it.

### Why fail open?

If foreground-window detection, `WT_SESSION`, or UI Automation fails, the system shows the notification rather than silently losing an important Copilot event.

The trade-off is an occasional extra notification rather than a missed notification.

## Limitations

This is a practical Windows integration rather than an official Windows Terminal integration.

Current limitations include:

- Windows only.
- Windows Terminal is required for exact-tab detection.
- The solution depends on Windows UI Automation exposing Terminal tabs.
- The stable tab title depends on the PowerShell wrapper and `updateTerminalTitle: false`.
- The current implementation uses BurntToast for rendering.
- Additional Copilot notification events such as `shell_completed`, `shell_detached_completed`, and `agent_idle` are not currently enabled.

## Future direction

The core npm distribution is working and publicly installable as `copilot-notify@0.1.0`. The next improvements are focused on making upgrades, recovery, and configuration safer rather than changing the core notification architecture.

Potential future additions include:

- repair and uninstall support
- safer hook configuration merging
- improved package upgrade handling
- additional Copilot CLI events such as `shell_completed`, `shell_detached_completed`, and `agent_idle`
- broader terminal support
- support for additional agent clients where the hook/session model allows it

## Interactive documentation

The repository's GitHub Pages site provides an interactive explanation of the architecture, event model, attention decision, implementation, troubleshooting, and verified scenarios.

GitHub Pages:

https://grok08.github.io/custom-notifications-for-octo_cli/

## Project status

**Status: Working npm MVP — `copilot-notify@0.1.0` is publicly published.**

The implementation has been manually verified for:

- Copilot CLI completion while staying on the same tab.
- Copilot CLI completion after switching to another Windows Terminal tab.
- Copilot CLI completion after switching to another application.
- VS Code Copilot completion without generating a notification.
- The bundled Copilot mascot appearing in the real Windows toast.
- Fresh installation from the public npm registry.
- `copilot-notify status` and `copilot-notify test`.

Public package:

```text
npm install -g copilot-notify
```

## Author

**Umesh Chandra Maheshuni**

Built as an exploration of context-aware agent tooling on Windows.
