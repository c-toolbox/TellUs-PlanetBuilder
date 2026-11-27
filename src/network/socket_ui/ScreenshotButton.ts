import type { Renderer } from "@/rendering/Renderer";
import type { SocketUi } from "./SocketUi";
import type { UiElement } from "./protocol";
import { ColorStr } from "@/utils/colors";
import {
	getScreenshotControl,
	type ScreenshotControl,
} from "@/utils/ScreenshotControl";

const BUTTON_ID = "save_image";

/** Connect on scene entry, include config in its UI, and disconnect on scene exit. */
export class ScreenshotButton {
	private control?: ScreenshotControl;
	private uiSocket?: SocketUi;
	private unsubscribe?: () => void;
	private readonly onClick = () => {
		void this.control?.save();
	};

	get config(): UiElement {
		return {
			type: "button",
			id: BUTTON_ID,
			text: this.control?.label || "Save",
			hint_title: "Screenshot",
			hint_text:
				"Saves an equirectangular image of the globe. See downloads folder.",
			color: ColorStr.Emerald700,
		};
	}

	connect(renderer: Renderer, uiSocket: SocketUi, onChange: () => void): void {
		this.disconnect();
		this.control = getScreenshotControl(renderer);
		this.uiSocket = uiSocket;
		this.unsubscribe = this.control.subscribe(onChange);
		uiSocket.on(BUTTON_ID, this.onClick);
	}

	disconnect(): void {
		this.uiSocket?.off(BUTTON_ID, this.onClick);
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		this.uiSocket = undefined;
		this.control = undefined;
	}
}
