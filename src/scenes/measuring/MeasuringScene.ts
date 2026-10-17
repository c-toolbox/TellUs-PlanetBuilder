import * as THREE from "three";
import backgroundAsset from "@/assets/backgrounds/globe/truecolor.png";
import MeasuringTape from "@/components/MeasuringTape";
import { UiConfigEvent } from "@/network/uiProtocol";
import { Renderer } from "@/rendering/Renderer";
import BaseScene from "@/scenes/BaseScene";
import { SceneKey } from "@/scenes/SceneManager";
import { Color } from "@/utils/colors";

export default class MeasuringScene extends BaseScene {
	private readonly measuringTapes: MeasuringTape[];

	constructor() {
		super();
		this.setBackground(backgroundAsset, 2);
		this.measuringTapes = [Color.Red600, Color.Blue600, Color.Green600].map(
			(color, index) => {
				const angle = (index / 3) * Math.PI * 2;
				const tape = new MeasuringTape({
					start: new THREE.Vector3(
						Math.sin(angle - 0.5),
						0.15,
						Math.cos(angle - 0.5),
					).normalize(),
					end: new THREE.Vector3(
						Math.sin(angle + 0.5),
						-0.15,
						Math.cos(angle + 0.5),
					).normalize(),
					color,
				});
				this.add(tape);
				tape.touchInteractions.forEach((interaction) =>
					this.registerTouchInteraction(interaction),
				);
				return tape;
			},
		);
	}

	override onExit(renderer: Renderer) {
		super.onExit(renderer);
		this.measuringTapes.forEach((tape) => tape.resetInteraction());
	}

	protected get uiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Measuring",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneKey.Measuring,
					options: Object.values(SceneKey),
				},
			],
		};
	}
}
