; ============================================================
; Nitro Hub — Windows Service lifecycle hooks for NSIS
; Included via electron-builder nsis.include.
; ============================================================

!define SVC_NAME    "NitroHubService"
!define SVC_DISPLAY "Nitro Hub Hardware Service"
!define SVC_DESC    "Manages fan control, RGB and hardware telemetry for Nitro Hub."

; ---- install hook -------------------------------------------
!macro customInstall
  DetailPrint "Installing ${SVC_DISPLAY}..."

  ; Stop & delete any stale registration (upgrade / reinstall path)
  nsExec::ExecToLog 'sc.exe stop "${SVC_NAME}"'
  Pop $0
  nsExec::ExecToLog 'sc.exe delete "${SVC_NAME}"'
  Pop $0
  Sleep 1500

  ; Register service pointing at the binary inside $INSTDIR.
  ; Normal double quotes around $INSTDIR path (no escaped $\" which breaks sc.exe).
  nsExec::ExecToLog 'sc.exe create "${SVC_NAME}" binPath= "$INSTDIR\nitro-service\NitroHubService.exe" start= auto DisplayName= "${SVC_DISPLAY}" obj= LocalSystem type= own'
  Pop $0
  DetailPrint "sc create exit code: $0"

  ; Best-effort: human-readable service description
  nsExec::ExecToLog 'sc.exe description "${SVC_NAME}" "${SVC_DESC}"'
  Pop $0

  ; Auto-restart on failure: 3 attempts, 5-second delay, 24-hour reset
  nsExec::ExecToLog 'sc.exe failure "${SVC_NAME}" reset= 86400 actions= restart/5000/restart/5000/restart/5000'
  Pop $0

  ; Pre-create the ProgramData folder the service uses for config & logs.
  ReadEnvStr $R0 "PROGRAMDATA"
  CreateDirectory "$R0\NitroHub"

  ; Start the service — installer is already elevated.
  nsExec::ExecToLog 'sc.exe start "${SVC_NAME}"'
  Pop $0
  DetailPrint "sc start exit code: $0"

  ; Clean up any legacy registry Run startup entries and register Task Scheduler logon task
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Nitro Hub"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Nitro Hub"
  nsExec::ExecToLog 'schtasks.exe /Create /TN "NitroHubAutoStart" /TR "\"$INSTDIR\Nitro Hub.exe\" --startup" /SC ONLOGON /F'
  Pop $0
!macroend

; ---- uninstall hook -----------------------------------------
!macro customUnInstall
  DetailPrint "Removing ${SVC_DISPLAY}..."

  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Nitro Hub"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Nitro Hub"
  nsExec::ExecToLog 'schtasks.exe /Delete /TN "NitroHubAutoStart" /F'
  Pop $0

  ; Stop the service gracefully
  nsExec::ExecToLog 'sc.exe stop "${SVC_NAME}"'
  Pop $0
  Sleep 2000

  ; Remove the SCM registration
  nsExec::ExecToLog 'sc.exe delete "${SVC_NAME}"'
  Pop $0
  DetailPrint "sc delete exit code: $0"

  ; Wipe config, logs and cache from ProgramData.
  ReadEnvStr $R0 "PROGRAMDATA"
  RMDir /r "$R0\NitroHub"
!macroend
