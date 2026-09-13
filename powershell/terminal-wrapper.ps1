function Resolve-CopilotExecutable {
    $applications = Get-Command copilot -CommandType Application -ErrorAction SilentlyContinue

    if (-not $applications) {
        return $null
    }

    # Prefer the native WindowsApps launcher when available.
    $nativeLauncher = $applications |
        Where-Object {
            $_.Source -and
            $_.Source -ieq "$env:LOCALAPPDATA\Microsoft\WindowsApps\copilot.exe"
        } |
        Select-Object -First 1

    if ($nativeLauncher) {
        return $nativeLauncher.Source
    }

    # npm installation: resolve the actual bundled Copilot executable.
    $npmLauncher = $applications |
        Where-Object {
            $_.Source -and
            $_.Source -match "\\npm\\copilot\.cmd$"
        } |
        Select-Object -First 1

    if ($npmLauncher) {
        $npmRoot = Split-Path $npmLauncher.Source -Parent

        $bundledCopilot = Join-Path `
            $npmRoot `
            "node_modules\@github\copilot\node_modules\@github\copilot-win32-x64\copilot.exe"

        if (Test-Path $bundledCopilot) {
            return $bundledCopilot
        }
    }

    # Final fallback: use any directly executable Copilot command.
    $directExecutable = $applications |
        Where-Object {
            $_.Source -and
            $_.Source -like "*.exe"
        } |
        Select-Object -First 1

    if ($directExecutable) {
        return $directExecutable.Source
    }

    return $null
}


function copilot {
    $session = $env:WT_SESSION

    $realCopilot = Resolve-CopilotExecutable

    if (-not $realCopilot) {
        Write-Error "GitHub Copilot CLI executable was not found."
        return
    }

    # If we are not running inside Windows Terminal,
    # invoke the real Copilot CLI normally.
    if (-not $session) {
        & $realCopilot @args
        return
    }

    $cleanSession = $session.Replace("-", "")

    if ($cleanSession.Length -lt 8) {
        & $realCopilot @args
        return
    }

    $shortSession = $cleanSession.Substring(0, 8)
    $desiredTitle = "Copilot [$shortSession]"
    $oldTitle = $Host.UI.RawUI.WindowTitle

    try {
        # Set our stable identity before launching Copilot.
        $Host.UI.RawUI.WindowTitle = $desiredTitle

        # Launch Copilot as a direct executable so npm's
        # copilot.cmd -> node -> npm-loader chain is avoided.
        if ($args.Count -gt 0) {
            $process = Start-Process `
                -FilePath $realCopilot `
                -ArgumentList $args `
                -NoNewWindow `
                -PassThru
        } else {
            $process = Start-Process `
                -FilePath $realCopilot `
                -NoNewWindow `
                -PassThru
        }
        # Copilot CLI may change the console title during startup
        # or while running. Keep our stable identity for the
        # lifetime of the Copilot process.
        while (-not $process.HasExited) {
            if ($Host.UI.RawUI.WindowTitle -ne $desiredTitle) {
                $Host.UI.RawUI.WindowTitle = $desiredTitle
            }

            Start-Sleep -Milliseconds 100
            $process.Refresh()
        }

        $process.WaitForExit()
    }
    finally {
        $Host.UI.RawUI.WindowTitle = $oldTitle
    }
}