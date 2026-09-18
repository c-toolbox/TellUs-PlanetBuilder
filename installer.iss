[Setup]
AppName=Planet Builder
AppVersion=1.0
DefaultDirName=C:\PufferConsole\applications\PlanetBuilder
DisableProgramGroupPage=yes
OutputDir=dist\win\PlanetBuilder
OutputBaseFilename=Planet Builder Installer
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
SetupIconFile=src\public\icon.ico

UninstallFilesDir={app}\uninst

[Files]
Source: "dist\win\PlanetBuilder\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs; Excludes: "Planet Builder Installer.exe"
Source: "src\public\thumbnail.png"; DestDir: "{app}"; Flags: ignoreversion

[Messages]
ClickFinish=Please go to the PufferConsole application portal to start PlanetBuilder.
