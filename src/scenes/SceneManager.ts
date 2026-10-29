import type { Renderer } from "@/rendering/Renderer";
import type BaseScene from "./BaseScene";
import type { SceneId } from "./scenes";

export interface SceneDefinition {
	id: SceneId;
	title: string;
	create: () => BaseScene;
}

export class SceneManager {
	private currentScene: BaseScene | null = null;
	private currentDefinition: SceneDefinition | null = null;
	private instances = new Map<SceneId, BaseScene>();
	onSceneChange?: (definition: SceneDefinition) => void;

	constructor(
		readonly scenes: readonly SceneDefinition[],
		private readonly renderer: Renderer,
	) {
		if (new Set(scenes.map((scene) => scene.id)).size !== scenes.length) {
			throw new Error("Scene IDs must be unique.");
		}
	}

	setScene(id: SceneId): boolean {
		const definition = this.scenes.find((scene) => scene.id === id);
		if (!definition) return false;
		if (definition === this.currentDefinition) return true;

		// Create on first use and retain the scene's state between visits.
		const scene = this.instances.get(id) ?? definition.create();
		this.instances.set(id, scene);
		this.currentScene?.onSceneExit(this.renderer);
		this.currentScene = scene;
		this.currentDefinition = definition;
		this.renderer.setScene(scene);
		scene.onSceneEnter(this.renderer);
		this.onSceneChange?.(definition);
		return true;
	}

	getCurrentScene(): BaseScene | null {
		return this.currentScene;
	}
}
