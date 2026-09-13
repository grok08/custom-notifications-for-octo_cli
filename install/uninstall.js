const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

function getCopilotHome() {
    return (
        process.env.COPILOT_HOME ||
        `${process.env.USERPROFILE}\\.copilot`
    );
}

function getHooksDirectory() {
    return path.join(
        getCopilotHome(),
        "hooks"
    );
}

function getInstallStatePath() {
    return path.join(
        getHooksDirectory(),
        ".copilot-notify-state.json"
    );
}

function getPowerShellProfilePath() {
    try {
        return execFileSync(
            "powershell.exe",
            [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "$PROFILE"
            ],
            {
                encoding: "utf8"
            }
        ).trim();
    } catch {
        return null;
    }
}

function readJsonFile(
    filePath,
    description
) {
    try {
        return JSON.parse(
            fs.readFileSync(
                filePath,
                "utf8"
            )
        );
    } catch {
        console.error(
            `✗ Could not parse ${description}.`
        );
        console.error(
            "  Aborting uninstall to avoid modifying user configuration."
        );
        process.exit(1);
    }
}

function getFileHash(filePath) {
    return crypto
        .createHash("sha256")
        .update(fs.readFileSync(filePath))
        .digest("hex");
}

function normalizeWindowsPath(value) {
    return String(value)
        .replace(/\//g, "\\")
        .toLowerCase();
}

function loadInstallationState() {
    const statePath =
        getInstallStatePath();

    if (
        !fs.existsSync(
            statePath
        )
    ) {
        return null;
    }

    return readJsonFile(
        statePath,
        "Copilot Notify installation state"
    );
}

function validateExistingConfiguration(state) {
    const hookConfigPath = path.join(
        getHooksDirectory(),
        "notification-hooks.json"
    );

    if (fs.existsSync(hookConfigPath)) {
        const hooksConfig = readJsonFile(
            hookConfigPath,
            "notification-hooks.json"
        );

        if (
            hooksConfig.hooks !== undefined &&
            (
                !hooksConfig.hooks ||
                typeof hooksConfig.hooks !== "object" ||
                Array.isArray(hooksConfig.hooks)
            )
        ) {
            console.error(
                "✗ notification-hooks.json has an invalid hooks object."
            );
            console.error(
                "  Aborting uninstall to avoid modifying user configuration."
            );
            process.exit(1);
        }
    }

    const settingsPath =
        state?.settings?.path ||
        path.join(
            getCopilotHome(),
            "settings.json"
        );

    if (fs.existsSync(settingsPath)) {
        readJsonFile(
            settingsPath,
            "Copilot settings.json"
        );
    }
}

function uninstallHookConfiguration(state) {
    const targetPath = path.join(
        getHooksDirectory(),
        "notification-hooks.json"
    );

    if (!fs.existsSync(targetPath)) {
        console.log("✓ Copilot hook configuration not found");
        return;
    }

    const hooksConfig = readJsonFile(
        targetPath,
        "notification-hooks.json"
    );

    if (hooksConfig.hooks === undefined) {
        console.log("✓ No Copilot Notify hooks found");
        return;
    }

    if (
        !hooksConfig.hooks ||
        typeof hooksConfig.hooks !== "object" ||
        Array.isArray(hooksConfig.hooks)
    ) {
        console.error(
            "✗ notification-hooks.json has an invalid hooks object."
        );
        console.error(
            "  Aborting uninstall to avoid modifying user configuration."
        );
        process.exit(1);
    }

    const notificationScriptPath = normalizeWindowsPath(
        path.join(
            getHooksDirectory(),
            "copilot-notify.ps1"
        )
    );

    for (
        const [eventName, hooks]
        of Object.entries(hooksConfig.hooks)
    ) {
        if (!Array.isArray(hooks)) {
            continue;
        }

        hooksConfig.hooks[eventName] =
            hooks.filter((hook) => {
                if (
                    !hook ||
                    hook.type !== "command"
                ) {
                    return true;
                }

                const command = normalizeWindowsPath(
                    hook.powershell || ""
                );

                return !command.includes(
                    notificationScriptPath
                );
            });

        if (
            hooksConfig.hooks[eventName].length === 0
        ) {
            delete hooksConfig.hooks[eventName];
        }
    }

    const remainingHooks =
        Object.keys(hooksConfig.hooks).length > 0;

    if (
        state?.hookConfigExisted === false &&
        !remainingHooks
    ) {
        fs.unlinkSync(targetPath);
        console.log(
            "✓ Copilot hook configuration removed"
        );
        return;
    }

    fs.writeFileSync(
        targetPath,
        JSON.stringify(
            hooksConfig,
            null,
            2
        ) + "\n",
        "utf8"
    );

    console.log(
        "✓ Copilot Notify hooks removed"
    );
}

function uninstallPowerShellWrapper(
    state
) {
    const profilePath =
        state?.profile?.path ||
        getPowerShellProfilePath();

    if (
        !profilePath ||
        !fs.existsSync(profilePath)
    ) {
        console.log(
            "✓ PowerShell profile wrapper not found"
        );
        return;
    }

    const existingProfile =
        fs.readFileSync(
            profilePath,
            "utf8"
        );

    const startMarker =
        "# >>> copilot-notify >>>";

    const endMarker =
        "# <<< copilot-notify <<<";

    const startIndex =
        existingProfile.indexOf(
            startMarker
        );

    const endIndex =
        existingProfile.indexOf(
            endMarker
        );

    if (
        startIndex === -1 ||
        endIndex === -1 ||
        endIndex < startIndex
    ) {
        console.log(
            "✓ PowerShell profile wrapper not found"
        );
        return;
    }

    const endPosition =
        endIndex +
        endMarker.length;

    const previousBlock =
    state?.profile?.previousBlock;

    const restoredProfile =
        previousBlock
            ? existingProfile.slice(
                0,
                startIndex
            ) +
            previousBlock +
            existingProfile.slice(
                endPosition
            )
            : existingProfile.slice(
                0,
                startIndex
            ) +
            existingProfile.slice(
                endPosition
            );

    fs.writeFileSync(
        profilePath,
        restoredProfile,
        "utf8"
    );

    console.log(
        "✓ PowerShell wrapper removed"
    );
}

function restoreCopilotSettings(
    state
) {
    const settingsPath =
        state?.settings?.path ||
        path.join(
            getCopilotHome(),
            "settings.json"
        );

    if (
        !fs.existsSync(
            settingsPath
        )
    ) {
        console.log(
            "✓ Copilot settings file not found"
        );
        return;
    }

    const settings =
        readJsonFile(
            settingsPath,
            "Copilot settings.json"
        );

    const previousExisted =
        Boolean(
            state?.settings
                ?.updateTerminalTitleExisted
        );

    if (previousExisted) {
        settings.updateTerminalTitle =
            state.settings
                .updateTerminalTitleValue;
    } else {
        delete settings.updateTerminalTitle;
    }

    const remainingKeys =
        Object.keys(settings);

    if (
        state?.settings &&
        state.settings.fileExisted === false &&
        remainingKeys.length === 0
    ) {
        fs.unlinkSync(
            settingsPath
        );

        console.log(
            "✓ Copilot settings restored"
        );

        return;
    }

    fs.writeFileSync(
        settingsPath,
        JSON.stringify(
            settings,
            null,
            2
        ) + "\n",
        "utf8"
    );

    console.log(
        "✓ Copilot terminal-title setting restored"
    );
}

function removeInstalledFiles(
    state
) {
    const hooksDirectory =
        getHooksDirectory();

    const files = [
        {
            name: "copilot-notify.ps1",
            path: path.join(
                hooksDirectory,
                "copilot-notify.ps1"
            ),
            created: state?.notificationScriptCreated,
            hash: state?.notificationScriptHash
        },
        {
            name: "copilot-mascot.png",
            path: path.join(
                hooksDirectory,
                "copilot-mascot.png"
            ),
            created: state?.notificationIconCreated,
            hash: state?.notificationIconHash
        }
    ];

    for (
        const file of files
    ) {
        if (!fs.existsSync(file.path)) {
            continue;
        }

        if (
            !file.created ||
            !file.hash
        ) {
            console.log(
                `✓ Left ${file.name} untouched (not created by Copilot Notify)`
            );
            continue;
        }

        if (getFileHash(file.path) !== file.hash) {
            console.log(
                `✓ Left ${file.name} untouched (modified externally)`
            );
            continue;
        }

        fs.unlinkSync(
            file.path
        );

        console.log(
            `✓ Removed ${file.name}`
        );
    }
}

function removeStateFile() {
    const statePath =
        getInstallStatePath();

    if (
        fs.existsSync(
            statePath
        )
    ) {
        fs.unlinkSync(
            statePath
        );

        console.log(
            "✓ Installation state removed"
        );
    }
}

function main() {
    if (
        os.platform() !== "win32"
    ) {
        return;
    }

    console.log("");
    console.log(
        "Copilot Notify uninstaller"
    );
    console.log(
        "-------------------------"
    );

    const state =
        loadInstallationState();

    validateExistingConfiguration(state);

    uninstallHookConfiguration(state);
    uninstallPowerShellWrapper(state);
    restoreCopilotSettings(state);
    removeInstalledFiles(state);
    removeStateFile();

    console.log("");
    console.log(
        "✓ Copilot Notify configuration removed successfully."
    );
}

main();