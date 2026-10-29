import { viewModes, type Renderer, type ViewMode } from "@/rendering/Renderer";
import type { SceneManager } from "@/scenes/SceneManager";

export function setupHtmlDebugControls(renderer: Renderer, sceneManager: SceneManager): void {
	const sceneOptions = document.getElementById("scene-options") as HTMLDivElement;
	for (const scene of sceneManager.scenes) {
		const button = document.createElement("button");
		button.type = "button";
		button.value = scene.id;
		button.textContent = scene.title;
		button.setAttribute("aria-pressed", "false");
		button.addEventListener("click", () => sceneManager.setScene(scene.id));
		sceneOptions.appendChild(button);
	}
	sceneManager.onSceneChange = (scene) =>
		setSelectedOption(sceneOptions, scene.id);

	const viewModeOptions = document.getElementById(
		"view-mode-options",
	) as HTMLDivElement;
	for (const mode of viewModes) {
		const button = document.createElement("button");
		button.type = "button";
		button.value = mode.id;
		button.textContent = mode.title;
		button.setAttribute("aria-pressed", "false");
		button.addEventListener("click", () => setViewMode(mode.id));
		viewModeOptions.appendChild(button);
	}
	function setViewMode(mode: ViewMode): void {
		renderer.setViewMode(mode);
		setSelectedOption(viewModeOptions, mode);
	}
	setViewMode(renderer.getViewMode());
}

function setSelectedOption(options: HTMLElement, value: string): void {
	for (const button of options.querySelectorAll("button")) {
		button.setAttribute("aria-pressed", String(button.value === value));
	}
}