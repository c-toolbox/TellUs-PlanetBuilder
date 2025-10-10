import { Renderer } from "./Renderer";
import BaseScene from "./BaseScene";
import WorldScene from "./WorldScene";
import PaintScene from "./PaintScene";
import DomScene from "./DomScene";

/* Scenes */

export const scenes = {
	World: new WorldScene(),
	Paint: new PaintScene(),
	Dom: new DomScene(),
} satisfies Record<string, BaseScene>;

export type SceneKey = keyof typeof scenes;

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
