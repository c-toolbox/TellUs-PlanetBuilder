import * as THREE from "three";
import BaseScene from "../BaseScene";
import { UiConfigEvent } from "@/network/socket_ui/protocol";
import { Renderer } from "@/rendering/Renderer";
import { TouchId } from "@/network/tuioProtocol";
import { SceneId, scenes } from "@/scenes/scenes";
import { ReactionTouches } from "./ReactionTouches";
import {
	ReactionSettings,
	SphericalReactionDiffusion,
} from "./SphericalReactionDiffusion";

const PRESETS = {
	Blank: { feed: 0.005, kill: 0.03 },
	Coral: { feed: 0.0545, kill: 0.062 },
	Labyrinth: { feed: 0.029, kill: 0.057 },
	Spots: { feed: 0.035, kill: 0.065 },
	Bubbles: { feed: 0.012, kill: 0.05 },
} as const;

export default class ReactionDiffusionScene extends BaseScene {
	private simulation?: SphericalReactionDiffusion;
	private touches = new ReactionTouches();
	private accumulator = 0;
	private paused = false;
	private unavailable = false;
	private preset: string = "Blank";
	private settings: ReactionSettings = {
		...PRESETS.Blank,
		diffusionU: 0.18,
		diffusionV: 0.09,
		speed: 240,
		touchRadius: 0.1,
		touchStrength: 24,
		erase: false,
		hue: 0.52,
		contrast: 1.2,
	};

	constructor() {
		super();
		this.background = new THREE.Color(0x020408);
	}

	override onSceneEnter(renderer: Renderer) {
		this.accumulator = 0;
		this.unavailable =
			!renderer.extensions.has("EXT_color_buffer_float") &&
			!renderer.extensions.has("EXT_color_buffer_half_float");
		if (!this.unavailable) {
			this.simulation = new SphericalReactionDiffusion(renderer);
			this.simulation.setAppearance(this.settings);
			this.add(this.simulation.surface);
		} else {
			console.warn(
				"Reaction diffusion requires renderable half-float textures.",
			);
		}
		super.onSceneEnter(renderer);
		// The chemical brush itself marks each contact.
		this.remove(this.touchHandler.touchGroup);
	}

	override onSceneExit(renderer: Renderer) {
		super.onSceneExit(renderer);
		this.touches.clear();
		this.accumulator = 0;
		if (this.simulation) {
			this.remove(this.simulation.surface);
			this.simulation.dispose();
			this.simulation = undefined;
		}
	}

	override update(delta: number) {
		if (
			!this.simulation ||
			this.paused ||
			!Number.isFinite(delta) ||
			delta <= 0
		)
			return;
		const dt = 1 / 60;
		// Renderer deltas are milliseconds. Cap catch-up after stalls, and advance
		// here so cube-camera capture never advances the chemistry six times.
		this.accumulator += Math.min(delta / 1000, 2 * dt);
		while (this.accumulator + 1e-9 >= dt) {
			this.simulation.step(dt, this.touches.consume(dt), this.settings);
			this.accumulator = Math.max(0, this.accumulator - dt);
		}
	}

	protected override onTouch(touchId: TouchId, vector: THREE.Vector3) {
		if (!this.paused) this.touches.update(touchId, vector);
	}

	protected override onRemove(touchId: TouchId) {
		this.touches.release(touchId);
	}

	protected override registerSocketUiListeners() {
		super.registerSocketUiListeners();
		this.uiSocket.on("scene", (id: SceneId) => {
			this.sceneManager.setScene(id);
		});
		const slider = (
			key: Exclude<keyof ReactionSettings, "erase">,
			min: number,
			max: number,
		) => {
			this.uiSocket.on(key, (value: number) => {
				if (typeof value !== "number" || !Number.isFinite(value)) return;
				this.settings[key] = THREE.MathUtils.clamp(value, min, max);
				if (["feed", "kill", "diffusionU", "diffusionV"].includes(key))
					this.preset = "Custom";
				this.simulation?.setAppearance(this.settings);
				this.sendSocketUiConfig();
			});
		};
		slider("feed", 0.005, 0.08);
		slider("kill", 0.03, 0.075);
		slider("diffusionU", 0, 0.25);
		slider("diffusionV", 0, 0.25);
		slider("speed", 30, 480);
		slider("touchRadius", 0.025, 0.3);
		slider("touchStrength", 1, 60);
		slider("hue", 0, 1);
		slider("contrast", 0.5, 2.5);
		this.uiSocket.on("preset", (value: string) => {
			if (value === "Custom") {
				this.preset = value;
				this.sendSocketUiConfig();
				return;
			}
			if (!Object.prototype.hasOwnProperty.call(PRESETS, value)) return;
			this.preset = value;
			Object.assign(this.settings, PRESETS[value as keyof typeof PRESETS], {
				diffusionU: 0.18,
				diffusionV: 0.09,
			});
			this.resetSimulation(true);
			this.sendSocketUiConfig();
		});
		this.uiSocket.on("erase", (value: boolean) => {
			if (typeof value !== "boolean") return;
			this.settings.erase = value;
			this.sendSocketUiConfig();
		});
		this.uiSocket.on("paused", (value: boolean) => {
			if (typeof value !== "boolean") return;
			this.paused = value;
			this.touches.clear();
			this.accumulator = 0;
			this.sendSocketUiConfig();
		});
		this.uiSocket.on("reset", () => this.resetSimulation(true));
		this.uiSocket.on("clear", () => this.resetSimulation(false));
	}

	private resetSimulation(seed: boolean) {
		this.touches.clear();
		this.accumulator = 0;
		this.simulation?.reset(seed);
	}

	protected override get socketUiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Reaction diffusion",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneId.ReactionDiffusion,
					options: scenes.map((scene) => scene.id),
				},
				{
					type: "text",
					hint_title: this.unavailable
						? "Simulation unavailable"
						: "Paint living patterns",
					hint_text: this.unavailable
						? "This GPU needs support for renderable half-float textures."
						: "Touch or drag to add chemical V. Hold to keep feeding a patch. Patterns develop over several seconds; try a preset or clear the sphere and draw your own seeds.",
				},
				{
					type: "dropdown",
					id: "preset",
					hint_title: "Pattern preset",
					hint_text:
						"Reseeds the sphere and restores feed, kill and diffusion rates.",
					value: this.preset,
					options: [...Object.keys(PRESETS), "Custom"],
				},
				{
					type: "slider",
					id: "feed",
					hint_title: "Feed rate (F)",
					hint_text:
						"Replenishes U. Small changes can produce a different pattern or a uniform state.",
					value: this.settings.feed,
					min: 0.005,
					max: 0.08,
					step: 0.0005,
				},
				{
					type: "slider",
					id: "kill",
					hint_title: "Kill rate (k)",
					hint_text: "Removes V in addition to the feed outflow.",
					value: this.settings.kill,
					min: 0.03,
					max: 0.075,
					step: 0.0005,
				},
				{
					type: "slider",
					id: "diffusionU",
					hint_title: "U diffusion",
					value: this.settings.diffusionU,
					min: 0,
					max: 0.25,
					step: 0.005,
				},
				{
					type: "slider",
					id: "diffusionV",
					hint_title: "V diffusion",
					value: this.settings.diffusionV,
					min: 0,
					max: 0.25,
					step: 0.005,
				},
				{
					type: "slider",
					id: "speed",
					hint_title: "Simulation speed",
					hint_text:
						"Chemical time units per second. Higher values require more GPU passes.",
					value: this.settings.speed,
					min: 30,
					max: 480,
					step: 10,
				},
				{
					type: "slider",
					id: "touchRadius",
					hint_title: "Brush radius",
					hint_text:
						"Angular radius in radians, equal everywhere on the sphere.",
					value: this.settings.touchRadius,
					min: 0.025,
					max: 0.3,
					step: 0.005,
				},
				{
					type: "slider",
					id: "touchStrength",
					hint_title: "Brush strength",
					value: this.settings.touchStrength,
					min: 1,
					max: 60,
					step: 1,
				},
				{
					type: "switch",
					id: "erase",
					hint_title: "Erase brush",
					hint_text: "Restore U and remove V under your fingers.",
					value: this.settings.erase,
				},
				{
					type: "slider",
					id: "hue",
					hint_title: "Colour hue",
					value: this.settings.hue,
					min: 0,
					max: 1,
					step: 0.01,
				},
				{
					type: "slider",
					id: "contrast",
					hint_title: "Colour contrast",
					value: this.settings.contrast,
					min: 0.5,
					max: 2.5,
					step: 0.05,
				},
				{
					type: "switch",
					id: "paused",
					hint_title: "Pause",
					value: this.paused,
				},
				{
					type: "multi_button",
					buttons: [
						{ id: "reset", text: "Reset seeds" },
						{ id: "clear", text: "Clear sphere" },
					],
				},
			],
		};
	}
}
