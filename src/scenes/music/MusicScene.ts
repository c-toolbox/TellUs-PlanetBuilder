import * as THREE from "three";
import BaseScene from "@/scenes/BaseScene";
import { SceneKey } from "@/scenes/SceneManager";
import { UiConfigEvent } from "@/network/uiProtocol";
import { Renderer } from "@/rendering/Renderer";
import { Piano } from "./Piano";
import { SoundFontPlayer } from "./SoundFontPlayer";

export default class MusicScene extends BaseScene {
	private readonly audio = new SoundFontPlayer();
	private readonly piano: Piano;

	constructor() {
		super();
		this.background = new THREE.Color(0x18202d);
		this.addLights();

		this.piano = new Piano({
			registerInteraction: (interaction) =>
				this.registerTouchInteraction(interaction),
			createTween: (target) => this.createTween(target),
		});
		this.add(this.piano.object);
		this.piano.on("noteOn", this.audio.noteOn);
		this.piano.on("noteOff", this.audio.noteOff);
		this.audio.on("change", () => {
			if (this.audio.isActive) this.sendUiConfig();
		});
		this.audio.on("loadError", (error) =>
			console.error("Failed to load music audio", error),
		);
	}

	private addLights() {
		this.add(new THREE.HemisphereLight(0xe5edff, 0x303344, 0.45));

		const rimColors = [0xffd1ab, 0xb5ceff, 0xb8e4d5];

		for (let i = 0; i < rimColors.length; i++) {
			const angle = (i / rimColors.length) * Math.PI * 2;

			// Outside the radius-2 piano: restrained color along its edges.
			const rim = new THREE.PointLight(rimColors[i], 5, 5, 2);
			rim.position.set(Math.cos(angle) * 2.8, 0.9, Math.sin(angle) * 2.8);

			// Offset inside lights reveal changing key angles when pressed.
			const insideAngle = angle + Math.PI / 3;
			const fill = new THREE.PointLight(0xfff4e8, 2.5, 4, 2);
			fill.position.set(
				Math.cos(insideAngle) * 1.1,
				0.55,
				Math.sin(insideAngle) * 1.1,
			);

			this.add(rim, fill);
		}
	}

	override onEnter(renderer: Renderer) {
		super.onEnter(renderer);
		this.audio.activate();
	}

	override onExit(renderer: Renderer) {
		this.piano.reset();
		this.audio.deactivate();
		super.onExit(renderer);
	}

	protected override initializeUi() {
		super.initializeUi();
		this.uiSocket.on(
			"soundFont",
			(name: string) => void this.audio.selectSoundFont(name),
		);
		this.uiSocket.on("instrument", (label: string) =>
			this.audio.selectInstrument(label),
		);
		this.uiSocket.on("retryAudio", () => void this.audio.retry());
	}

	protected override get uiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Music",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneKey.Music,
					options: Object.values(SceneKey),
				},
				...this.audio.uiElements,
			],
		};
	}
}
