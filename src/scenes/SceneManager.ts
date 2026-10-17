import { Renderer } from "../rendering/Renderer";
import BaseScene from "./BaseScene";
import WorldScene from "./world/WorldScene";
import PaintScene from "./paint/PaintScene";
import ReactionDiffusionScene from "./reaction/ReactionDiffusionScene";
import BoidsScene from "./boids/BoidsScene";
import CountryScene from "./country/CountryScene";
import VinjettScene from "./vinjett/VinjettScene";
import MusicScene from "./music/MusicScene";
import InteractionScene from "./interaction/InteractionScene";
import MeasuringScene from "./measuring/MeasuringScene";
import FluidScene from "./fluid/FluidScene";

/* Scenes */

export enum SceneKey {
	World = "Planet",
	Paint = "Paint",
	Boids = "Fish",
	Country = "Country",
	Vinjett = "Wildlife",
	Music = "Music",
	Interaction = "Interaction",
	Measuring = "Measuring",
	Fluid = "Fluid",
	ReactionDiffusion = "ReactionDiffusion",
}

export const scenes = {
	[SceneKey.World]: new WorldScene(),
	[SceneKey.Paint]: new PaintScene(),
	[SceneKey.Boids]: new BoidsScene(),
	[SceneKey.Country]: new CountryScene(),
	[SceneKey.Vinjett]: new VinjettScene(),
	[SceneKey.Music]: new MusicScene(),
	[SceneKey.Interaction]: new InteractionScene(),
	[SceneKey.Measuring]: new MeasuringScene(),
	[SceneKey.Fluid]: new FluidScene(),
	[SceneKey.ReactionDiffusion]: new ReactionDiffusionScene(),
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
