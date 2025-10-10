import "@/utils/neu";
import "@/utils/storage";
import "./utils/proxy";

import { Renderer } from "./scenes/Renderer";
import { SceneManager } from "./scenes/SceneManager";

// Import all your scenes
import { WorldScene } from "./scenes/WorldScene";
import { PaintScene } from "./scenes/PaintScene";
import { globalServices } from "./network/GlobalServices";

const renderer = new Renderer();
const sceneManager = new SceneManager(renderer);

// Available scenes (label + class factory)
const scenes = [
	{ label: "World Scene", create: () => new WorldScene() },
	{ label: "Paint Scene", create: () => new PaintScene() },
];

// Populate dropdown
const select = document.getElementById("scene-select") as HTMLSelectElement;
if (select) {
	select.innerHTML = "";
	scenes.forEach((s, i) => {
		const option = document.createElement("option");
		option.value = i.toString();
		option.textContent = s.label;
		select.appendChild(option);
	});

	// Scene switching logic
	select.addEventListener("change", () => {
		const index = parseInt(select.value, 10);
		const newScene = scenes[index].create();
		sceneManager.setScene(newScene);
	});
}

// Load first scene by default
sceneManager.setScene(scenes[0].create());

globalServices.connectAll();
