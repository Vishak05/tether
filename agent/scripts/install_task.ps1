<#
.SYNOPSIS
    Registers a Windows Scheduled Task that starts the Tether agent at user
    logon and restarts it automatically if it crashes.

.DESCRIPTION
    Uses Task Scheduler rather than a Windows Service, NSSM, or a plain
    startup-folder shortcut:
      - Built into Windows — nothing extra to install or trust.
      - Runs in the logged-on user's interactive session (LogonType Interactive,
        RunLevel Limited) rather than as SYSTEM. This matters: a SYSTEM-level
        Windows Service has no desktop session, and the agent's screenshot
        capture, volume control, and lock/unlock calls need one to work.
      - RunLevel "Limited" means this script does NOT need to run elevated —
        registering a task that runs as the current (non-admin) user doesn't
        require admin rights.
      - Launches uvicorn directly with reload DISABLED, instead of going
        through run.py (which hardcodes reload=True for dev convenience).
        uvicorn's reload mode spawns a supervisor process plus a separate
        multiprocessing worker process; if the supervisor dies but the worker
        survives, Task Scheduler's restart-on-failure can't help — it only
        tracks the process it originally launched, not an orphaned child
        still holding the port, and a restart attempt would just fail to
        bind. Confirmed live during testing: an earlier reload-mode run left
        exactly this kind of orphan behind. Reload has no purpose in an
        autostart context anyway — it exists so a developer's manual edits
        pick up without restarting the process.
      - Crash recovery uses a periodic watchdog trigger, NOT Task Scheduler's
        own RestartCount/RestartInterval failure-restart policy. That policy
        was tried first and verified NOT to fire reliably here: killing the
        process externally (Stop-Process -Force, the same thing a real crash
        looks like) left the task sitting idle in the "Ready" state well past
        RestartInterval, with no restart. Task Scheduler DID correctly and
        immediately notice the process was gone (its own State went straight
        to "Ready"), so instead a second trigger re-fires the same action
        every -WatchdogIntervalMinutes. Combined with the default
        MultipleInstances policy (IgnoreNew), a firing while the agent is
        already running is just ignored — no duplicate process — but a
        firing while it's dead starts a fresh one. Confirmed working during
        testing; the failure-restart policy alone was not.
      - Launches via pythonw.exe, not python.exe. Confirmed live: Task
        Scheduler's "Interactive" logon type gives a console-subsystem exe
        (python.exe) a real, visible console window on the desktop — not
        actually background at all, just an unattended one you'd have to
        manually close or ignore. pythonw.exe is the windowless variant of
        the same interpreter and never allocates a console. This does mean
        sys.stdout is None inside the process — agent/core/logging.py
        accounts for this (writes to ~/.tether/agent.log unconditionally,
        only adds a stdout handler when a console is actually present), so
        logs aren't lost, just no longer visible in a window.
      - Runs agent\scripts\run_headless.py instead of `-m uvicorn ...`
        directly. Confirmed live: even with pythonw.exe's stdout/stderr
        correctly handled by our own logger, uvicorn's *own* default logging
        setup still crashes the process on its first internal log line under
        a None stdout/stderr — the agent's "starting" line made it to
        agent.log, then the process silently vanished with no further
        activity and no visible error anywhere. run_headless.py passes
        `log_config=None` to uvicorn.run() so it never installs that logging
        setup in the first place. See run_headless.py's own docstring for
        the full diagnosis.

.PARAMETER PythonPath
    Path to the python.exe (or pythonw.exe) that has the agent's dependencies
    installed. Defaults to C:\Python314\python.exe — but if a pythonw.exe
    exists next to it, that's used instead automatically (see DESCRIPTION),
    so you don't need to pass the windowless variant explicitly.

.PARAMETER TaskName
    Name of the scheduled task. Defaults to "TetherAgent".

.PARAMETER BindHost
    Address uvicorn binds to. Defaults to "0.0.0.0" (matches agent/core/config.py's
    default), so the agent is reachable from other devices, not just localhost.

.PARAMETER Port
    Port uvicorn binds to. Defaults to 8765 (matches agent/core/config.py's default).

.PARAMETER WatchdogIntervalMinutes
    How often the watchdog trigger re-fires to check/restart the agent if it's
    not running. Defaults to 5 minutes — the real crash-recovery mechanism
    (see DESCRIPTION); Task Scheduler's minimum supported repetition is 1 minute.

.EXAMPLE
    .\install_task.ps1

.EXAMPLE
    .\install_task.ps1 -PythonPath "C:\Users\me\venv\Scripts\python.exe"
#>
param(
    [string]$PythonPath = "C:\Python314\python.exe",
    [string]$TaskName = "TetherAgent",
    [string]$BindHost = "0.0.0.0",
    [int]$Port = 8765,
    [int]$WatchdogIntervalMinutes = 5
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path $PythonPath)) {
    Write-Error "Python interpreter not found at '$PythonPath'. Pass -PythonPath pointing at the interpreter with agent/requirements.txt installed."
    exit 1
}
if (-not (Test-Path (Join-Path $repoRoot "agent\main.py"))) {
    Write-Error "Could not find agent\main.py under '$repoRoot'. Run this script from its original location inside the repo (agent\scripts\)."
    exit 1
}

# Prefer the windowless pythonw.exe if it sits next to the given interpreter —
# see DESCRIPTION for why python.exe isn't actually invisible under Task Scheduler.
$windowlessPath = Join-Path (Split-Path -Parent $PythonPath) "pythonw.exe"
if ((Split-Path -Leaf $PythonPath) -ieq "python.exe" -and (Test-Path $windowlessPath)) {
    $PythonPath = $windowlessPath
    Write-Host "Using windowless interpreter: $PythonPath"
}

$entryScript = Join-Path $repoRoot "agent\scripts\run_headless.py"
$runArgs = "`"$entryScript`" --host $BindHost --port $Port"
$action = New-ScheduledTaskAction -Execute $PythonPath -Argument $runArgs -WorkingDirectory $repoRoot

$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# The real crash-recovery mechanism — see DESCRIPTION. Fires indefinitely
# (RepetitionDuration = ~10 years, the practical "forever" for this cmdlet)
# starting one interval from now; a firing while the agent is already
# running is a no-op under the default MultipleInstances=IgnoreNew policy.
$watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes($WatchdogIntervalMinutes) `
    -RepetitionInterval (New-TimeSpan -Minutes $WatchdogIntervalMinutes) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Host "Task '$TaskName' already exists - replacing it."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger @($logonTrigger, $watchdogTrigger) `
    -Settings $settings `
    -Principal $principal `
    -Description "Runs the Tether laptop-control agent at logon, and re-checks/restarts it every $WatchdogIntervalMinutes minute(s) if it's not running." `
    | Out-Null

Write-Host "Registered scheduled task '$TaskName'."
Write-Host "It will start automatically at your next logon, and the watchdog trigger will pick it up within $WatchdogIntervalMinutes minute(s) even if that's missed."
Write-Host ""
Write-Host "To start it right now without logging off:"
Write-Host "    Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "To check its status:"
Write-Host "    Get-ScheduledTaskInfo -TaskName '$TaskName'"
Write-Host ""
Write-Host "To remove it:"
Write-Host "    .\uninstall_task.ps1"
