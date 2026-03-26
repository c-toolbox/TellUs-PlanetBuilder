import { Renderer } from "../rendering/Renderer";
import BaseScene from "./BaseScene";
import WorldScene from "./world/WorldScene";
import PaintScene from "./paint/PaintScene";
// import DistortionScene from "./distortion/DistortionScene";
// import ReactionDiffusionScene from "./reactiondiffusion/ReactionDiffusionScene";
// import DomScene from "./dom/DomScene";
// import DragDropScene from "./dragdrop/DragDropScene";
import BoidsScene from "./boids/BoidsScene";
import CountryScene from "./country/CountryScene";

/* Scenes */

export enum SceneKey {
	World = "World",
	Paint = "Paint",
	// Distortion = "Distortion",
	// ReactionDiffusion = "ReactionDiffusion",
	// Dom = "Dom",
	// DragDrop = "DragDrop",
	Boids = "Boids",
	Country = "Country",
}

export const scenes = {
	World: new WorldScene(),
	Paint: new PaintScene(),
	// Distortion: new DistortionScene(),
	// ReactionDiffusion: new ReactionDiffusionScene(),
	// Dom: new DomScene(),
	// DragDrop: new DragDropScene(),
	Boids: new BoidsScene(),
	Country: new CountryScene(),
} satisfies Record<SceneKey, BaseScene>;

/* Manager */

export class SceneManager {
	private renderer: Renderer;
	private currentScene: BaseScene | null = null;

	constructor() {
		this.renderer = new Renderer();
	}

	/** Switch to a new scene instance */
	setScene(scene: BaseScene) {
		// Clean up the current scene
		if (this.currentScene) {
			this.currentScene.onExit(this.renderer);
		}

		// Set and initialize new scene
		this.currentScene = scene;
		this.renderer.setScene(scene);
		scene.onEnter(this.renderer);
	}

	/** Get current scene */
	getCurrentScene(): BaseScene | null {
		return this.currentScene;
	}
}

// Export a singleton instance
export const sceneManager = new SceneManager();
