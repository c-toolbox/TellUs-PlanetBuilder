import BackgroundSphere from "@/components/BackgroundSphere";
import * as THREE from "three";
import backgroundAsset from "@/assets/textures/earth/animated.webm";
import MeasuringTape from "@/components/MeasuringTape";
import { UiConfigEvent } from "@/network/socket_ui/protocol";
import { Renderer } from "@/rendering/Renderer";
import BaseScene from "@/scenes/BaseScene";
import { SceneId, scenes } from "@/scenes/scenes";
import { Color } from "@/utils/colors";

export default class MeasuringScene extends BaseScene {
	private readonly backgroundVideo = document.createElement("video");
	private readonly measuringTapes: MeasuringTape[];

	constructor() {
		super();
		this.background = new THREE.Color(0x222222);
		this.add(this.drawings);

		this.backgroundVideo.loop = true;
		this.backgroundVideo.muted = true;
		this.backgroundVideo.playsInline = true;
		this.backgroundVideo.preload = "metadata";
		this.backgroundVideo.src = backgroundAsset;
		this.add(new BackgroundSphere(new THREE.VideoTexture(this.backgroundVideo), 2));

		// const overlay = new THREE.Mesh(
		// 	new THREE.SphereGeometry(1.9, 64, 64),
		// 	new THREE.MeshBasicMaterial({
		// 		color: 0x000000,
		// 		transparent: true,
		// 		opacity: 1.0,
		// 		side: THREE.BackSide,
		// 		depthWrite: false,
		// 	}),
		// );
		// overlay.renderOrder = -1;
		// this.add(overlay);

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

	override onSceneEnter(renderer: Renderer) {
		void this.backgroundVideo.play().catch((error: unknown) => {
			if (this.renderer) console.error("Failed to play measuring background video", error);
		});
	}

	override onSceneExit(renderer: Renderer) {
		this.backgroundVideo.pause();
		super.onSceneExit(renderer);
		this.measuringTapes.forEach((tape) => tape.resetInteraction());
	}

	protected override registerSocketUiListeners() {
		super.registerSocketUiListeners();

		this.uiSocket.on("scene", (id: SceneId) => {
			this.sceneManager.setScene(id);
		});
	}

	protected get socketUiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Measuring",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneId.Measuring,
					options: scenes.map((scene) => scene.id),
				},
			],
		};
	}
}
