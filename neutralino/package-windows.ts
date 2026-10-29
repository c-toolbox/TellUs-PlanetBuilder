import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPackage } from "@electron/asar";
import { NtExecutable, NtExecutableResource, Data, Resource } from "resedit";
import { createICO, HERMITE } from "png2icons";
import type { PluginOption } from "vite";
import writeNeuConfig from "./write-neu-config";
import { appMetadata } from "./app-config";

export default function packageWindows(): PluginOption {
	return {
		name: "package-windows",
		apply: "build",
		closeBundle: {
			sequential: true,
			async handler() {
				if (process.platform !== "win32") {
					throw new Error("Windows packaging requires Windows. Use npm start for a browser preview.");
				}
				execFileSync("node_modules/bun/bin/bun.exe", [
					"build", "extensions/tuio-extension.ts", "--compile",
					"--outfile", "extensions/tuio-extension.exe",
				], { stdio: "inherit" });
				writeNeuConfig(true);
				await createPackage("dist", "bin/resources.neu");
				bundleWindowsApp();
				writeAppMetadata();
			},
		},
	};
}

function bundleWindowsApp() {
	const { title, description, version, team, bundleDirectory } = appMetadata;
	mkdirSync(bundleDirectory + "/extensions", { recursive: true });
	copyFileSync("bin/resources.neu", bundleDirectory + "/resources.neu");
	copyFileSync("extensions/tuio-extension.exe", bundleDirectory + "/extensions/tuio-extension.exe");
	copyFileSync("src/public/thumbnail.png", bundleDirectory + "/thumbnail.png");

	const exe = NtExecutable.from(readFileSync("bin/neutralino-win_x64.exe"));
	const resources = NtExecutableResource.from(exe);
	const icon = createICO(readFileSync("src/public/icon.png"), HERMITE, 0, true, true);
	if (!icon) throw new Error("Could not generate a Windows icon from src/public/icon.png.");
	Resource.IconGroupEntry.replaceIconsForResource(
		resources.entries, 101, 1033, Data.IconFile.from(icon).icons.map((item) => item.data),
	);
	const info = Resource.VersionInfo.createEmpty();
	const [major, minor, patch] = version.split(".").map(Number);
	info.setFileVersion(major, minor, patch, 0, 1033);
	info.setProductVersion(major, minor, patch, 0, 1033);
	info.setStringValues({ lang: 1033, codepage: 1200 }, {
		FileDescription: description,
		ProductName: title,
		ProductVersion: version,
		CompanyName: team,
	});
	info.outputToResourceEntries(resources.entries);
	resources.outputResource(exe);
	writeFileSync(bundleDirectory + "/" + title + ".exe", Buffer.from(exe.generate()));
}

export function writeAppMetadata(directory = "dist", metadata = appMetadata) {
	const { applicationId, title, version, distributionName, bundleDirectory, archivePath } = metadata;
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, "app-metadata.json"), JSON.stringify({
		title, version, distributionName, bundleDirectory, archivePath,
	}, null, 2) + "\n");

	writeFileSync(join(directory, "installer.iss"), [
		"; Generated from app.config.json. Do not edit.",
		'#define AppTitle "' + title + '"',
		'#define AppVersion "' + version + '"',
		'#define AppId "' + applicationId + '"',
		'#define DistributionName "' + distributionName + '"',
		String.raw`
[Setup]
AppId={#AppId}
AppName={#AppTitle}
AppVersion={#AppVersion}
DefaultDirName=C:\PufferConsole\applications\{#DistributionName}
DisableProgramGroupPage=yes
OutputDir=win\{#DistributionName}
OutputBaseFilename={#AppTitle} Installer
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
SetupIconFile=..\src\public\icon.ico
UninstallFilesDir={app}\uninst

[Files]
Source: "win\{#DistributionName}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs; Excludes: "{#AppTitle} Installer.exe"

[Messages]
ClickFinish=Please go to the PufferConsole application portal to start {#AppTitle}.
`,
	].join("\n"));
}
