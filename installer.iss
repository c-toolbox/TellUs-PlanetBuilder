[Setup]
AppName=Planet Builder
AppVersion=1.0
DefaultDirName=C:\PufferConsole\applications\PlanetBuilder
DisableProgramGroupPage=yes
OutputDir=dist\win\planet-builder
OutputBaseFilename=Planet Builder Installer
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
SetupIconFile=src\public\icon.ico

[Files]
Source: "dist\win\planet-builder\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs; Excludes: "Planet Builder Installer.exe"
Source: "src\public\thumbnail.png"; DestDir: "{app}"; Flags: ignoreversion

[Run]
Filename: "{app}\Planet Builder.exe"; Description: "Launch Planet Builder"; Flags: nowait postinstall skipifsilent
