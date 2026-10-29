import config from "../app.config.json";

interface AppIdentity {
	title: string;
	team: string;
	description: string;
	version: string;
}

export function createAppMetadata(identity: AppIdentity) {
	const { title, team, description, version } = identity;
	// Titles become Windows filenames as well as window and release titles.
	if (!title.trim() || /[<>:"/\\|?*{}\x00-\x1f]/.test(title)
		|| /[. ]$/.test(title) || title !== title.trim()
		|| /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(title)) {
		throw new Error("app.config.json: title must be a valid Windows filename.");
	}
	if (!/^\d+\.\d+\.\d+$/.test(version)
		|| version.split(".").some((part) => Number(part) > 65535)) {
		throw new Error("app.config.json: version must contain three numbers between 0 and 65535.");
	}
	const applicationId = slug(team) + "." + slug(title);
	const distributionName = title.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "");
	return {
		title, team, description, version, applicationId, distributionName,
		binaryName: slug(team) + "-" + slug(title),
		bundleDirectory: "dist/win/" + distributionName,
		archivePath: "dist/" + distributionName + ".zip",
	};
}

function slug(value: string) {
	const result = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
		.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	if (!result) throw new Error("app.config.json: title and team must contain letters or numbers.");
	return result;
}

export const appMetadata = createAppMetadata(config);
export const {
	title, team, description, version, applicationId, binaryName,
	distributionName, bundleDirectory, archivePath,
} = appMetadata;
export const neutralino = config.neutralino;
