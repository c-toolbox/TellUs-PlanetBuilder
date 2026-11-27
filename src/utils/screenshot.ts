import * as Neutralino from "@neutralinojs/lib";
import { isNeutralino } from "@/utils/neu";

function timestampFileName(): string {
	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, "0");
	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
	return `${date}_${time}.png`;
}

/** Save to the Downloads folder without prompting; returns the file name or path. */
export async function savePngToDownloads(blob: Blob): Promise<string> {
	const fileName = timestampFileName();
	if (isNeutralino) {
		const folder = await Neutralino.os.getPath("downloads");
		const path = `${folder}/${fileName}`;
		await Neutralino.filesystem.writeBinaryFile(path, await blob.arrayBuffer());
		return path;
	}

	// Browsers save to their configured download folder.
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	URL.revokeObjectURL(url);
	return fileName;
}
