import type { TouchPoint } from "@/network/TouchPoint";
import * as THREE from "three";
import BaseScene from "@/scenes/BaseScene";
import { SceneId, scenes } from "@/scenes/scenes";
import { UiConfigEvent } from "@/network/socket_ui/protocol";
import { TouchId } from "@/network/tuioProtocol";
import { Renderer } from "@/rendering/Renderer";
import geodesic20 from "@/scenes/world/models/geodesic20.json";
import geodesic320 from "@/scenes/world/models/geodesic320.json";
import goldberg32 from "@/scenes/world/models/goldberg32.json";
import goldberg252 from "@/scenes/world/models/goldberg252.json";
import { ForceGraph, GraphSettings } from "./ForceGraph";
import { GraphTouches, HOLD_TO_ADD_MS } from "./GraphTouches";
import { GraphView } from "./GraphView";

const PRESETS = { geodesic20, geodesic320, goldberg32, goldberg252 };
type Preset = keyof typeof PRESETS;
const STEP = 1 / 120;

export default class ForceGraphScene extends BaseScene {
	private readonly graph = new ForceGraph();
	private readonly touches = new GraphTouches(
		this.graph,
		(direction) => this.view?.pick(direction),
		(node) => this.view?.animateCreation(node, (target) => this.createTween(target)),
	);
	private view?: GraphView;
	private preset: Preset = "geodesic20";
	private paused = false;
	private accumulator = 0;
	private ignoredTouchPoints = new Set<TouchPoint>();
	private topology = "";

	constructor() {
		super();
		this.background = new THREE.Color(0x050a12);
		this.graph.load(PRESETS[this.preset]);
	}

	override onSceneEnter(renderer: Renderer) {
		this.ignoredTouchPoints = new Set(this.touchHandler.getTouchPoints());
		this.accumulator = 0;
		this.view = new GraphView(this.graph);
		this.add(this.view);
		super.onSceneEnter(renderer);
		// Keep small dots and empty-space gestures visible beneath the fingers.
		this.remove(this.touchHandler.touchGroup);
	}

	override onSceneExit(renderer: Renderer) {
		super.onSceneExit(renderer);
		this.ignoredTouchPoints.clear();
		this.touches.clear(false);
		this.accumulator = 0;
		if (this.view) {
			this.remove(this.view);
			this.view.dispose();
			this.view = undefined;
		}
	}

	override update(delta: number) {
		this.touches.tick();
		if (!this.paused && Number.isFinite(delta) && delta > 0) {
			// Renderer deltas are milliseconds; limit catch-up after stalls.
			this.accumulator += Math.min(delta / 1000, STEP * 8);
			while (this.accumulator + 1e-9 >= STEP) {
				this.graph.step(STEP);
				this.accumulator = Math.max(0, this.accumulator - STEP);
			}
		}
		this.view?.sync();
		const topology = `${this.graph.nodes.size}:${this.graph.edges.size}`;
		if (topology !== this.topology) {
			this.topology = topology;
			this.sendSocketUiConfig();
		}
	}

	protected override onTouch(id: TouchId, direction: THREE.Vector3) {
		// Contacts already down when switching scenes must be lifted first.
		const point = this.touchHandler.getTouchPoint(id);
		if (point && this.ignoredTouchPoints.has(point)) return;
		this.touches.update(id, direction);
	}

	protected override onRemove(id: TouchId) {
		this.touches.release(id);
	}

	private resetGraph() {
		this.touches.clear();
		this.graph.load(PRESETS[this.preset]);
		this.accumulator = 0;
		this.view?.sync();
		this.sendSocketUiConfig();
	}

	protected override registerSocketUiListeners() {
		super.registerSocketUiListeners();
		this.uiSocket.on("scene", (id: SceneId) => {
			this.sceneManager.setScene(id);
		});
		this.uiSocket.on("preset", (value: unknown) => {
			if (
				typeof value !== "string" ||
				!Object.prototype.hasOwnProperty.call(PRESETS, value)
			)
				return;
			this.preset = value as Preset;
			this.resetGraph();
		});
		const slider = (key: keyof GraphSettings, min: number, max: number) => {
			this.uiSocket.on(key, (value: unknown) => {
				if (typeof value !== "number" || !Number.isFinite(value)) return;
				this.graph.settings[key] = THREE.MathUtils.clamp(value, min, max);
				this.sendSocketUiConfig();
			});
		};
		slider("repulsion", 0, 0.3);
		slider("springStrength", 0, 30);
		slider("springLength", 0.25, 2.5);
		slider("friction", 0, 12);
		this.uiSocket.on("paused", (value: unknown) => {
			if (typeof value !== "boolean") return;
			this.paused = value;
			this.accumulator = 0;
			this.sendSocketUiConfig();
		});
		this.uiSocket.on("reset", () => this.resetGraph());
	}

	protected override get socketUiConfig(): UiConfigEvent {
		const settings = this.graph.settings;
		return {
			type: "config",
			title: "Force graph",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					value: SceneId["Force graph"],
					options: scenes.map((scene) => scene.id),
				},
				{
					type: "dropdown",
					id: "preset",
					hint_title: "Base graph",
					hint_text: "Replace the graph with a preset's vertices and edges.",
					value: this.preset,
					options: Object.keys(PRESETS),
				},
				{
					type: "text",
					hint_title: `${this.graph.nodes.size} dots / ${this.graph.edges.size} edges`,
					hint_text:
						"Drag dots to move them. Bring two held dots together to connect them. Swipe across an edge with a free finger to cut it.",
				},
				{
					type: "text",
					hint_title: "Add and remove dots",
					hint_text:
						`Hold empty space still for ${HOLD_TO_ADD_MS / 1000} seconds to add and grab a dot, then drag it without lifting. Movement or touching a dot cancels the hold. Tap a dot quickly to remove it and its edges.`,
				},
				{
					type: "slider",
					id: "repulsion",
					hint_title: "Repulsion",
					value: settings.repulsion,
					min: 0,
					max: 10,
					step: 0.005,
				},
				{
					type: "slider",
					id: "springStrength",
					hint_title: "Spring strength",
					value: settings.springStrength,
					min: 0,
					max: 1000,
					step: 0.5,
				},
				{
					type: "slider",
					id: "springLength",
					hint_title: "Spring length",
					hint_text: "Multiplier of the preset's average edge length.",
					value: settings.springLength,
					min: 0.25,
					max: 2.5,
					step: 0.05,
				},
				{
					type: "slider",
					id: "friction",
					hint_title: "Friction",
					value: settings.friction,
					min: 0,
					max: 12,
					step: 0.25,
				},
				{
					type: "switch",
					id: "paused",
					hint_title: "Pause physics",
					hint_text: "Keep editing the graph while its forces are paused.",
					value: this.paused,
				},
				{ type: "button", id: "reset", text: "Reset graph" },
			],
		};
	}
}
