[Setup]
AppName=Planet Builder
AppVersion=1.0
DefaultDirName=C:\Pufferfish\applications\PlanetBuilder
DefaultGroupName=Planet Builder
OutputDir=.
OutputBaseFilename=PlanetBuilder-Installer
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
SetupIconFile=src\public\icon.ico

[Files]
; Packages the compiled folder containing the exe, proxy.py, and resources
Source: "dist\win\planet-builder\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Planet Builder"; Filename: "{app}\Planet Builder.exe"
Name: "{autodesktop}\Planet Builder"; Filename: "{app}\Planet Builder.exe"

[Run]
Filename: "{app}\Planet Builder.exe"; Description: "Launch Planet Builder"; Flags: nowait postinstall skipifsilent
