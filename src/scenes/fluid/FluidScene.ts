import * as THREE from "three";
import BaseScene from "@/scenes/BaseScene";
import { SceneKey } from "@/scenes/SceneManager";
import { UiConfigEvent } from "@/network/uiProtocol";
import { Renderer } from "@/rendering/Renderer";
import { TouchId } from "@/network/tuioProtocol";
import { FluidTouches } from "./FluidTouches";
import { FluidSettings, SphericalFluid } from "./SphericalFluid";
import { DEFAULT_FLUID_OUTPUT, FLUID_OUTPUT_OPTIONS, FLUID_OUTPUTS, FluidOutput } from "./FluidDisplay";

export default class FluidScene extends BaseScene {
	private fluid?: SphericalFluid;
	private touches = new FluidTouches();
	private paused = false;
	private output: FluidOutput = DEFAULT_FLUID_OUTPUT;
	private accumulator = 0;
	private settings: FluidSettings = {
		touchRadius: 0.13,
		touchForce: 10,
		swirl: 6,
		dyeDecay: 0.2,
		ambient: false,
	};
	private unavailable = false;

	constructor() {
		super();
		this.background = new THREE.Color(0x020408);
	}

	override onEnter(renderer: Renderer) {
		this.accumulator = 0;
		this.unavailable = !renderer.extensions.has("EXT_color_buffer_float") &&
			!renderer.extensions.has("EXT_color_buffer_half_float");
		if (!this.unavailable) {
			this.fluid = new SphericalFluid(renderer);
			this.fluid.setOutput(this.output);
			this.add(this.fluid.surface);
		} else {
			console.warn("Fluid simulation unavailable: renderable half-float textures are required.");
		}
		super.onEnter(renderer);
		// Dye marks the fingers directly; the shared touch discs would cover it.
		this.remove(this.touchHandler.touchGroup);
	}

	override onExit(renderer: Renderer) {
		super.onExit(renderer);
		this.touches.clear();
		this.accumulator = 0;
		if (this.fluid) {
			this.remove(this.fluid.surface);
			this.fluid.dispose();
			this.fluid = undefined;
		}
	}

	override update(delta: number) {
		if (!this.fluid || !Number.isFinite(delta) || delta <= 0) return;
		if (this.paused) {
			this.touches.clear();
			this.accumulator = 0;
			return;
		}
		// Renderer.update receives milliseconds. Advance at 60 Hz independently
		// of display refresh, allowing at most two catch-up steps per frame.
		const dt = 1 / 60;
		this.accumulator += Math.min(delta / 1000, 2 * dt);
		while (this.accumulator + 1e-9 >= dt) {
			this.fluid.step(dt, this.touches.consume(dt), this.settings);
			this.accumulator = Math.max(0, this.accumulator - dt);
		}
	}

	protected override onTouch(touchId: TouchId, vector: THREE.Vector3) {
		if (!this.paused) this.touches.update(touchId, vector);
	}

	protected override onRemove(touchId: TouchId) {
		this.touches.release(touchId);
	}

	protected override initializeUi() {
		super.initializeUi();
		this.uiSocket.on("output", (value: unknown) => {
			if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(FLUID_OUTPUTS, value)) return;
			this.output = value as FluidOutput;
			this.fluid?.setOutput(this.output);
			this.sendUiConfig();
		});
		const slider = (key: "touchRadius" | "touchForce" | "swirl" | "dyeDecay", min: number, max: number) => {
			this.uiSocket.on(key, (value: number) => {
				if (typeof value !== "number" || !Number.isFinite(value)) return;
				this.settings[key] = THREE.MathUtils.clamp(value, min, max);
				this.sendUiConfig();
			});
		};
		slider("touchRadius", 0.04, 0.35);
		slider("touchForce", 0, 20);
		slider("swirl", 0, 12);
		slider("dyeDecay", 0, 0.4);
		this.uiSocket.on("ambient", (value: boolean) => {
			if (typeof value !== "boolean") return;
			this.settings.ambient = value;
			this.sendUiConfig();
		});
		this.uiSocket.on("paused", (value: boolean) => {
			if (typeof value !== "boolean") return;
			this.paused = value;
			this.touches.clear();
			this.accumulator = 0;
			this.sendUiConfig();
		});
		this.uiSocket.on("reset", () => this.resetFluid(true));
		this.uiSocket.on("clear", () => this.resetFluid(false));
	}

	private resetFluid(seed: boolean) {
		this.touches.clear();
		this.accumulator = 0;
		this.fluid?.reset(seed);
	}

	protected override get uiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Fluid",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneKey.Fluid,
					options: Object.values(SceneKey),
				},
				{
					type: "dropdown",
					id: "output",
					hint_title: "Simulation output",
					hint_text: "Inspect a stage of the latest simulation step. Switch views while paused to compare fields.",
					value: this.output,
					options: FLUID_OUTPUT_OPTIONS,
				},
				{ type: "text", hint_title: this.output, hint_text: FLUID_OUTPUTS[this.output].hint },
				{ type: "slider", id: "touchRadius", hint_title: "Brush radius", value: this.settings.touchRadius, min: 0.04, max: 0.35, step: 0.01 },
				{ type: "slider", id: "touchForce", hint_title: "Stir strength", value: this.settings.touchForce, min: 0, max: 20, step: 0.5 },
				{ type: "slider", id: "swirl", hint_title: "Swirl", value: this.settings.swirl, min: 0, max: 12, step: 0.5 },
				{ type: "slider", id: "dyeDecay", hint_title: "Colour fade", value: this.settings.dyeDecay, min: 0, max: 0.4, step: 0.005 },
				{ type: "switch", id: "ambient", hint_title: "Ambient flow", hint_text: "Keep gentle currents and a slow colour supply running between touches.", value: this.settings.ambient },
				{ type: "switch", id: "paused", hint_title: "Pause", value: this.paused },
				{
					type: "multi_button",
					buttons: [
						{ id: "reset", text: "Reset colours" },
						{ id: "clear", text: "Clear ink" },
					],
				},
			],
		};
	}
}
