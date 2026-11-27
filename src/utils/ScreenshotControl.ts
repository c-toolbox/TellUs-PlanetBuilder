import type { Renderer } from "@/rendering/Renderer";
import { savePngToDownloads } from "@/utils/screenshot";

type ScreenshotRenderer = Pick<Renderer, "captureEquirectangularImage">;
type ScreenshotState = "idle" | "saving" | "saved";

const controls = new WeakMap<ScreenshotRenderer, ScreenshotControl>();

/** Share progress and prevent overlapping saves across controls for one renderer. */
export function getScreenshotControl(renderer: ScreenshotRenderer): ScreenshotControl {
	let control = controls.get(renderer);
	if (!control) {
		control = new ScreenshotControl(renderer);
		controls.set(renderer, control);
	}
	return control;
}

export class ScreenshotControl {
	private state: ScreenshotState = "idle";
	private resetLabelTimeout?: number;
	private readonly listeners = new Set<() => void>();

	constructor(private readonly renderer: ScreenshotRenderer) {}

	get label(): string {
		switch (this.state) {
			case "saving":
				return "Saving...";
			case "saved":
				return "Saved!";
			default:
				return "";
		}
	}

	get isSaving(): boolean {
		return this.state === "saving";
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	async save(): Promise<void> {
		if (this.isSaving) return;
		window.clearTimeout(this.resetLabelTimeout);
		this.setState("saving");
		try {
			const image = await this.renderer.captureEquirectangularImage();
			const location = await savePngToDownloads(image);
			console.log(`Screenshot saved: ${location}`);
			this.setState("saved");
			this.resetLabelTimeout = window.setTimeout(() => {
				this.resetLabelTimeout = undefined;
				this.setState("idle");
			}, 3000);
		} catch (error) {
			console.error("Failed to save screenshot", error);
			this.setState("idle");
		}
	}

	private setState(state: ScreenshotState): void {
		this.state = state;
		this.listeners.forEach((listener) => listener());
	}
}
