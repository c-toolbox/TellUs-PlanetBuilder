import GUI from "lil-gui";
import { scenes, SceneKey, sceneManager } from "@/scenes/SceneManager";

export const gui = new GUI();

export const globalSettings: { activeScene: SceneKey } = {
	activeScene: "World",
};

export const worldSettings = {
	model: "geodesic20",
};

export const paintSettings = {
	penWidth: 1.0,
};

let folders: { [key in SceneKey]: GUI };

export function initializeGui() {
	// Scene switching
	gui
		.add(globalSettings, "activeScene", Object.keys(scenes))
		.name("Active Scene")
		.onChange((key: keyof typeof scenes) => {
			openSceneFolder();
			sceneManager.setScene(scenes[key]);
		});

	folders = {
		World: gui.addFolder("World"),
		Paint: gui.addFolder("Paint"),
		Distortion: gui.addFolder("Distortion"),
		ReactionDiffusion: gui.addFolder("ReactionDiffusion"),
		Dom: gui.addFolder("Dom"),
		DragDrop: gui.addFolder("DragDrop"),
	};

	const models = [
		"geodesic20",
		"geodesic60",
		"geodesic80",
		"geodesic140",
		"geodesic180",
		"geodesic240",
		"geodesic320",
		"geodesic420",
		"geodesic500",
		"geodesic540",
	];
	folders.World.add(worldSettings, "model", models).name("Model");

	folders.Paint.add(paintSettings, "penWidth", 0, 1, 0.01).name("Pen Width");

	openSceneFolder();
}

function openSceneFolder() {
	Object.values(folders).forEach((folder) => {
		folder.hide();
	});
	folders[globalSettings.activeScene].show();
}
