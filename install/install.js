const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

function checkWindows() {
    if (os.platform() !== "win32") {
        console.error("Copilot Notify currently supports Windows only.");
        process.exit(1);
    }

    console.log("✓ Windows detected");
}

function checkPowerShell() {
    try {
        execFileSync(
            "powershell.exe",
            [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "$PSVersionTable.PSVersion.ToString()"
            ],
            {
                stdio: "pipe",
                encoding: "utf8"
            }
        );

        console.log("✓ Windows PowerShell detected");
    } catch (error) {
        console.error("✗ Windows PowerShell was not detected.");
        process.exit(1);
    }
}

function checkCopilot() {
    const candidates = [
        process.env.APPDATA
            ? `${process.env.APPDATA}\\npm\\copilot.cmd`
            : null,

        process.env.LOCALAPPDATA
            ? `${process.env.LOCALAPPDATA}\\Microsoft\\WindowsApps\\copilot.exe`
            : null
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            const version = execFileSync(
                candidate,
                ["--version"],
                {
                    stdio: "pipe",
                    encoding: "utf8"
                }
            ).trim();

            console.log(`✓ GitHub Copilot CLI detected (${version})`);
            return;
        } catch {
            // Try the next candidate.
        }
    }

    console.error("✗ GitHub Copilot CLI was not detected.");
    console.error("  Install GitHub Copilot CLI before continuing.");
    process.exit(1);
}

function checkWindowsTerminal() {
    try {
        execFileSync(
            "where.exe",
            ["wt.exe"],
            {
                stdio: "pipe",
                encoding: "utf8"
            }
        );

        console.log("✓ Windows Terminal detected");
    } catch {
        console.error("✗ Windows Terminal was not detected.");
        console.error("  Copilot Notify requires Windows Terminal.");
        process.exit(1);
    }
}

function checkBurntToast() {
    try {
        execFileSync(
            "powershell.exe",
            [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "if (Get-Module -ListAvailable -Name BurntToast) { exit 0 } else { exit 1 }"
            ],
            {
                stdio: "pipe"
            }
        );

        console.log("✓ BurntToast detected");
    } catch {
        console.error("✗ BurntToast was not detected.");
        console.error("  BurntToast is required for Windows toast notifications.");
        console.error("  Install it with:");
        console.error("  Install-Module BurntToast -Scope CurrentUser");
        process.exit(1);
    }
}

function getCopilotHome() {
    return (
        process.env.COPILOT_HOME ||
        `${process.env.USERPROFILE}\\.copilot`
    );
}

function getHooksDirectory() {
    return `${getCopilotHome()}\\hooks`;
}

function checkCopilotHooksDirectory() {
    const hooksDirectory = getHooksDirectory();

    fs.mkdirSync(hooksDirectory, {
        recursive: true
    });

    console.log(`✓ Copilot hooks directory ready (${hooksDirectory})`);
}

function getInstallStatePath() {
    return path.join(
        getHooksDirectory(),
        ".copilot-notify-state.json"
    );
}

function readJsonFile(filePath, description) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
        console.error(`✗ Could not parse ${description}.`);
        console.error("  Aborting to avoid modifying existing configuration.");
        process.exit(1);
    }
}

function getFileHash(filePath) {
    return crypto
        .createHash("sha256")
        .update(fs.readFileSync(filePath))
        .digest("hex");
}

function abortForUnownedFile(filePath, description) {
    console.error(
        `✗ ${description} already exists and is not owned by Copilot Notify: ${filePath}`
    );
    console.error(
        "  Aborting installation to avoid overwriting user data."
    );
    process.exit(1);
}

function checkInstallFileOwnership(
    targetPath,
    previousCreated,
    previousHash,
    description
) {
    if (!fs.existsSync(targetPath)) {
        return false;
    }

    if (
        previousCreated &&
        previousHash &&
        getFileHash(targetPath) === previousHash
    ) {
        return true;
    }

    abortForUnownedFile(
        targetPath,
        description
    );
}

function recordInstalledFile(
    state,
    createdKey,
    hashKey,
    targetPath
) {
    state[createdKey] = true;
    state[hashKey] = getFileHash(targetPath);
    saveInstallationState(state);
}

function validateExistingHookConfiguration() {
    const targetPath = path.join(
        getHooksDirectory(),
        "notification-hooks.json"
    );

    if (!fs.existsSync(targetPath)) {
        return;
    }

    const existingHooks = readJsonFile(
        targetPath,
        "existing notification-hooks.json"
    );

    if (
        existingHooks.hooks !== undefined &&
        (
            !existingHooks.hooks ||
            typeof existingHooks.hooks !== "object" ||
            Array.isArray(existingHooks.hooks)
        )
    ) {
        console.error(
            "✗ Existing notification-hooks.json has an invalid hooks object."
        );
        console.error(
            "  Aborting to avoid modifying existing configuration."
        );
        process.exit(1);
    }
}

function getPowerShellProfilePath() {
    const profilePath = execFileSync(
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

    if (!profilePath) {
        console.error("✗ Could not determine PowerShell profile path.");
        process.exit(1);
    }

    return profilePath;
}

function captureInstallationState() {
    const hooksDirectory = getHooksDirectory();
    const packageRoot = path.resolve(__dirname, "..");

    const targetScript = path.join(
        hooksDirectory,
        "copilot-notify.ps1"
    );

    const sourceScript = path.join(
        packageRoot,
        "powershell",
        "copilot-notify.ps1"
    );

    const targetIcon = path.join(
        hooksDirectory,
        "copilot-mascot.png"
    );

    const sourceIcon = path.join(
        packageRoot,
        "assets",
        "copilot-mascot.png"
    );

    const hookConfigPath = path.join(
        hooksDirectory,
        "notification-hooks.json"
    );

    const settingsPath = path.join(
        getCopilotHome(),
        "settings.json"
    );

    const profilePath = getPowerShellProfilePath();

    const notificationScriptCreated =
        checkInstallFileOwnership(
            targetScript,
            false,
            null,
            "Notification script"
        );

    const notificationIconCreated =
        checkInstallFileOwnership(
            targetIcon,
            false,
            null,
            "Copilot mascot"
        );

    let existingProfile = "";

    if (fs.existsSync(profilePath)) {
        existingProfile = fs.readFileSync(
            profilePath,
            "utf8"
        );
    }

    const startMarker = "# >>> copilot-notify >>>";
    const endMarker = "# <<< copilot-notify <<<";

    const startIndex = existingProfile.indexOf(startMarker);
    const endIndex = existingProfile.indexOf(endMarker);

    const previousProfileBlock =
        startIndex !== -1 &&
        endIndex !== -1 &&
        endIndex >= startIndex
            ? existingProfile.slice(
                startIndex,
                endIndex + endMarker.length
            )
            : null;

    let settings = {};
    const settingsFileExisted = fs.existsSync(settingsPath);

    if (settingsFileExisted) {
        settings = readJsonFile(
            settingsPath,
            "Copilot settings.json"
        );
    }

    const updateTerminalTitleExisted =
        Object.prototype.hasOwnProperty.call(
            settings,
            "updateTerminalTitle"
        );

    return {
        version: 1,

        hookConfigExisted:
            fs.existsSync(hookConfigPath),

        notificationScriptExisted:
            fs.existsSync(targetScript),

        notificationScriptCreated:
            notificationScriptCreated,

        notificationScriptHash: null,

        notificationIconExisted:
            fs.existsSync(targetIcon),

        notificationIconCreated:
            notificationIconCreated,

        notificationIconHash: null,

        profile: {
            path: profilePath,
            previousBlock: previousProfileBlock
        },

        settings: {
            path: settingsPath,
            fileExisted: settingsFileExisted,
            updateTerminalTitleExisted,
            updateTerminalTitleValue:
                settings.updateTerminalTitle
        }
    };
}

function saveInstallationState(state) {
    fs.writeFileSync(
        getInstallStatePath(),
        JSON.stringify(state, null, 2) + "\n",
        "utf8"
    );
}

function loadInstallationState() {
    const statePath = getInstallStatePath();

    if (!fs.existsSync(statePath)) {
        return null;
    }

    try {
        return JSON.parse(
            fs.readFileSync(statePath, "utf8")
        );
    } catch {
        console.error(
            "✗ Copilot Notify installation state is invalid JSON."
        );
        console.error(
            "  Aborting installation to avoid modifying user configuration."
        );
        process.exit(1);
    }
}

function installNotificationScript() {
    const packageRoot = path.resolve(__dirname, "..");

    const sourceScript = path.join(
        packageRoot,
        "powershell",
        "copilot-notify.ps1"
    );

    const targetScript = path.join(
        getHooksDirectory(),
        "copilot-notify.ps1"
    );

    if (!fs.existsSync(sourceScript)) {
        console.error(
            `✗ Notification script not found: ${sourceScript}`
        );
        process.exit(1);
    }

    const state = loadInstallationState();

    checkInstallFileOwnership(
        targetScript,
        state?.notificationScriptCreated,
        state?.notificationScriptHash,
        "Notification script"
    );

    fs.copyFileSync(
        sourceScript,
        targetScript
    );

    recordInstalledFile(
        state,
        "notificationScriptCreated",
        "notificationScriptHash",
        targetScript
    );

    console.log("✓ Notification script installed");
}

function installNotificationIcon() {
    const packageRoot = path.resolve(__dirname, "..");

    const sourceIcon = path.join(
        packageRoot,
        "assets",
        "copilot-mascot.png"
    );

    const targetIcon = path.join(
        getHooksDirectory(),
        "copilot-mascot.png"
    );

    if (!fs.existsSync(sourceIcon)) {
        console.error(
            `✗ Copilot mascot not found: ${sourceIcon}`
        );
        process.exit(1);
    }

    const state = loadInstallationState();

    checkInstallFileOwnership(
        targetIcon,
        state?.notificationIconCreated,
        state?.notificationIconHash,
        "Copilot mascot"
    );

    fs.copyFileSync(
        sourceIcon,
        targetIcon
    );

    recordInstalledFile(
        state,
        "notificationIconCreated",
        "notificationIconHash",
        targetIcon
    );

    console.log("✓ Copilot mascot installed");
}

function installHookConfiguration() {
    const packageRoot = path.resolve(__dirname, "..");

    const templatePath = path.join(
        packageRoot,
        "hooks",
        "notification-hooks.json"
    );

    const targetPath = path.join(
        getHooksDirectory(),
        "notification-hooks.json"
    );

    if (!fs.existsSync(templatePath)) {
        console.error(
            `✗ Hook template not found: ${templatePath}`
        );
        process.exit(1);
    }

    const notificationScriptPath = path.join(
        getHooksDirectory(),
        "copilot-notify.ps1"
    );

    const powershellCommand =
        `& "${notificationScriptPath}"`;

    const escapedPowerShellCommand =
        JSON.stringify(powershellCommand).slice(1, -1);

    let template = fs.readFileSync(
        templatePath,
        "utf8"
    );

    template = template.replace(
        /COPILOT_NOTIFY_COMMAND_PLACEHOLDER/g,
        escapedPowerShellCommand
    );

    let packageHooks;

    try {
        packageHooks = JSON.parse(template);
    } catch {
        console.error(
            "✗ Package hook configuration is invalid JSON."
        );
        process.exit(1);
    }

    let existingHooks = {
        version: 1,
        hooks: {}
    };

    if (fs.existsSync(targetPath)) {
        existingHooks = readJsonFile(
            targetPath,
            "existing notification-hooks.json"
        );
    }

    if (
        existingHooks.hooks === undefined
    ) {
        existingHooks.hooks = {};
    }

    /*
     * Remove any Copilot Notify hooks from a previous
     * installation before adding the current ones.
     * This makes installation idempotent.
     */
    for (
        const [eventName, hooks]
        of Object.entries(existingHooks.hooks)
    ) {
        if (!Array.isArray(hooks)) {
            continue;
        }

        existingHooks.hooks[eventName] =
            hooks.filter((hook) => {
                if (
                    !hook ||
                    hook.type !== "command"
                ) {
                    return true;
                }

                const command =
                    hook.powershell || "";

                return !command.includes(
                    "copilot-notify.ps1"
                );
            });

        if (
            existingHooks.hooks[eventName].length === 0
        ) {
            delete existingHooks.hooks[eventName];
        }
    }

    /*
     * Add our hooks while preserving every unrelated
     * user hook already present in the file.
     */
    for (
        const [eventName, hooks]
        of Object.entries(packageHooks.hooks)
    ) {
        if (
            !Array.isArray(
                existingHooks.hooks[eventName]
            )
        ) {
            existingHooks.hooks[eventName] = [];
        }

        existingHooks.hooks[eventName].push(
            ...hooks
        );
    }

    existingHooks.version =
        existingHooks.version ||
        packageHooks.version ||
        1;

    fs.writeFileSync(
        targetPath,
        JSON.stringify(
            existingHooks,
            null,
            2
        ) + "\n",
        "utf8"
    );

    console.log(
        "✓ Copilot hook configuration merged"
    );
}

function installPowerShellWrapper() {
    const packageRoot = path.resolve(__dirname, "..");

    const wrapperPath = path.join(
        packageRoot,
        "powershell",
        "terminal-wrapper.ps1"
    );

    if (!fs.existsSync(wrapperPath)) {
        console.error(
            `✗ PowerShell wrapper not found: ${wrapperPath}`
        );
        process.exit(1);
    }

    const powershellCommand = `
# >>> copilot-notify >>>
. "${wrapperPath}"
# <<< copilot-notify <<<
`;

    const profilePath =
        getPowerShellProfilePath();

    const existingProfile =
        fs.existsSync(profilePath)
            ? fs.readFileSync(
                profilePath,
                "utf8"
            )
            : "";

    const startMarker =
        "# >>> copilot-notify >>>";

    const endMarker =
        "# <<< copilot-notify <<<";

    const startIndex =
        existingProfile.indexOf(startMarker);

    const endIndex =
        existingProfile.indexOf(endMarker);

    let updatedProfile = existingProfile;

    if (
        startIndex !== -1 &&
        endIndex !== -1 &&
        endIndex >= startIndex
    ) {
        const endPosition =
            endIndex + endMarker.length;

        updatedProfile =
            existingProfile.slice(
                0,
                startIndex
            ) +
            powershellCommand.trim() +
            existingProfile.slice(
                endPosition
            );
    } else {
        if (
            updatedProfile &&
            !updatedProfile.endsWith("\n")
        ) {
            updatedProfile += "\n";
        }

        updatedProfile +=
            powershellCommand;
    }

    fs.writeFileSync(
        profilePath,
        updatedProfile,
        "utf8"
    );

    console.log(
        `✓ PowerShell wrapper installed (${profilePath})`
    );
}

function configureCopilotSettings() {
    const copilotHome =
        getCopilotHome();

    const settingsPath =
        path.join(
            copilotHome,
            "settings.json"
        );

    let settings = {};

    if (fs.existsSync(settingsPath)) {
        settings = readJsonFile(
            settingsPath,
            "Copilot settings.json"
        );
    }

    settings.updateTerminalTitle = false;

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
        "✓ Copilot terminal title updates disabled"
    );
}

function verifyInstallation() {
    const hooksDirectory =
        getHooksDirectory();

    const notificationScriptPath =
        path.join(
            hooksDirectory,
            "copilot-notify.ps1"
        );

    const hookConfigPath =
        path.join(
            hooksDirectory,
            "notification-hooks.json"
        );

    const profilePath =
        getPowerShellProfilePath();

    let valid = true;

    if (
        !fs.existsSync(
            notificationScriptPath
        )
    ) {
        console.error(
            "✗ Notification script verification failed"
        );
        valid = false;
    } else {
        console.log(
            "✓ Notification script verified"
        );
    }

    if (
        !fs.existsSync(
            hookConfigPath
        )
    ) {
        console.error(
            "✗ Hook configuration verification failed"
        );
        valid = false;
    } else {
        try {
            const hooksConfig =
                JSON.parse(
                    fs.readFileSync(
                        hookConfigPath,
                        "utf8"
                    )
                );

            const serialized =
                JSON.stringify(
                    hooksConfig
                );

            if (
                serialized.includes(
                    "copilot-notify.ps1"
                )
            ) {
                console.log(
                    "✓ Hook configuration verified"
                );
            } else {
                console.error(
                    "✗ Copilot Notify hooks were not found"
                );
                valid = false;
            }
        } catch {
            console.error(
                "✗ Hook configuration contains invalid JSON"
            );
            valid = false;
        }
    }

    if (
        !fs.existsSync(profilePath)
    ) {
        console.error(
            "✗ PowerShell profile verification failed"
        );
        valid = false;
    } else {
        const profileContent =
            fs.readFileSync(
                profilePath,
                "utf8"
            );

        if (
            profileContent.includes(
                "# >>> copilot-notify >>>"
            ) &&
            profileContent.includes(
                "# <<< copilot-notify <<<"
            )
        ) {
            console.log(
                "✓ PowerShell wrapper verified"
            );
        } else {
            console.error(
                "✗ PowerShell wrapper was not found in profile"
            );
            valid = false;
        }
    }

    const settingsPath =
        path.join(
            getCopilotHome(),
            "settings.json"
        );

    if (
        fs.existsSync(settingsPath)
    ) {
        try {
            const settings =
                JSON.parse(
                    fs.readFileSync(
                        settingsPath,
                        "utf8"
                    )
                );

            if (
                settings.updateTerminalTitle === false
            ) {
                console.log(
                    "✓ Copilot terminal-title setting verified"
                );
            } else {
                console.error(
                    "✗ updateTerminalTitle is not set to false"
                );
                valid = false;
            }
        } catch {
            console.error(
                "✗ Could not verify Copilot settings"
            );
            valid = false;
        }
    } else {
        console.error(
            "✗ Copilot settings.json not found"
        );
        valid = false;
    }

    if (
        !fs.existsSync(
            getInstallStatePath()
        )
    ) {
        console.error(
            "✗ Installation state was not created"
        );
        valid = false;
    } else {
        console.log(
            "✓ Installation state verified"
        );
    }

    if (!valid) {
        console.error("");
        console.error(
            "Installation verification failed."
        );
        process.exit(1);
    }

    console.log("");
    console.log(
        "✓ Installation verified successfully"
    );
}

function main() {
    console.log("");
    console.log(
        "Copilot Notify installer"
    );
    console.log(
        "-----------------------"
    );

    checkWindows();
    checkPowerShell();
    checkCopilot();
    checkWindowsTerminal();
    checkBurntToast();
    checkCopilotHooksDirectory();

    const existingState =
        loadInstallationState();

    if (!existingState) {
        saveInstallationState(
            captureInstallationState()
        );
    } else {
        checkInstallFileOwnership(
            path.join(
                getHooksDirectory(),
                "copilot-notify.ps1"
            ),
            existingState.notificationScriptCreated,
            existingState.notificationScriptHash,
            "Notification script"
        );

        checkInstallFileOwnership(
            path.join(
                getHooksDirectory(),
                "copilot-mascot.png"
            ),
            existingState.notificationIconCreated,
            existingState.notificationIconHash,
            "Copilot mascot"
        );
    }

    validateExistingHookConfiguration();

    installNotificationScript();
    installNotificationIcon();
    installHookConfiguration();
    installPowerShellWrapper();
    configureCopilotSettings();
    verifyInstallation();

    console.log("");
    console.log(
        "Installation checks passed."
    );
}

main();