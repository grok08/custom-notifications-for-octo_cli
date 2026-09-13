#!/usr/bin/env node

const path = require("path");
const { execFileSync } = require("child_process");

const command = process.argv[2];

function runScript(scriptName) {
    const scriptPath = path.join(
        __dirname,
        "..",
        "install",
        scriptName
    );

    try {
        execFileSync(
            process.execPath,
            [scriptPath],
            {
                stdio: "inherit"
            }
        );
    } catch {
        process.exit(1);
    }
}

function testNotification() {
    const scriptPath = path.join(
        process.env.USERPROFILE,
        ".copilot",
        "hooks",
        "copilot-notify.ps1"
    );

    try {
        execFileSync(
            "powershell.exe",
            [
                "-NoProfile",
                "-NonInteractive",
                "-File",
                scriptPath,
                "-Title",
                "Copilot Notify",
                "-Message",
                "Windows notifications are working."
            ],
            {
                stdio: "inherit"
            }
        );

        console.log("✓ Test notification sent");
    } catch {
        console.error("✗ Failed to send test notification");
        process.exit(1);
    }
}

function showStatus() {
    const statePath = path.join(
        process.env.USERPROFILE,
        ".copilot",
        "hooks",
        ".copilot-notify-state.json"
    );

    const installed = require("fs").existsSync(statePath);

    console.log("Copilot Notify");
    console.log("");

    if (installed) {
        console.log("Integration: installed");
        console.log("");
        console.log("Commands:");
        console.log("  copilot-notify test");
        console.log("  copilot-notify uninstall");
    } else {
        console.log("Integration: not installed");
        console.log("");
        console.log("Run:");
        console.log("  copilot-notify install");
    }
}

switch (command) {
    case "install":
        runScript("install.js");
        break;

    case "uninstall":
        runScript("uninstall.js");
        break;

    case "test":
        testNotification();
        break;

    case "status":
        showStatus();
        break;

    default:
        console.log("Copilot Notify");
        console.log("");
        console.log("Commands:");
        console.log("  copilot-notify install");
        console.log("  copilot-notify uninstall");
        console.log("  copilot-notify test");
        console.log("  copilot-notify status");
        break;
}