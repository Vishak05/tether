<#
.SYNOPSIS
    Removes the Tether agent's scheduled task, undoing install_task.ps1.

.PARAMETER TaskName
    Name of the scheduled task to remove. Defaults to "TetherAgent" —
    must match whatever -TaskName was passed to install_task.ps1, if anything.

.EXAMPLE
    .\uninstall_task.ps1
#>
param(
    [string]$TaskName = "TetherAgent"
)

$ErrorActionPreference = "Stop"

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task '$TaskName'."
} else {
    Write-Host "No scheduled task named '$TaskName' found - nothing to remove."
}
