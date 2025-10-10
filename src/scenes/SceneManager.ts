import { Renderer } from "./Renderer";
import BaseScene from "./BaseScene";

export class SceneManager {
	private renderer: Renderer;
	private currentScene: BaseScene | null = null;

	constructor(renderer: Renderer) {
		this.renderer = renderer;
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
