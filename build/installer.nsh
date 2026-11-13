; Capglow.exe garde l'icône d'Electron (il n'est pas modifié, pour passer Smart App Control) :
; on crée nous-mêmes les raccourcis avec l'icône de Capglow.
!macro customInstall
  CreateShortCut "$SMPROGRAMS\Capglow.lnk" "$INSTDIR\Capglow.exe" "" "$INSTDIR\resources\icon.ico" 0
  CreateShortCut "$DESKTOP\Capglow.lnk" "$INSTDIR\Capglow.exe" "" "$INSTDIR\resources\icon.ico" 0
  WinShell::SetLnkAUMI "$SMPROGRAMS\Capglow.lnk" "io.github.capglow"
  WinShell::SetLnkAUMI "$DESKTOP\Capglow.lnk" "io.github.capglow"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Capglow.lnk"
  Delete "$DESKTOP\Capglow.lnk"
!macroend
