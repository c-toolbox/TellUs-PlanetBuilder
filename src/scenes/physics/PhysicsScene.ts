import type { TouchPoint } from "@/network/TouchPoint";
import * as THREE from "three";
import BaseScene from "@/scenes/BaseScene";
import { SceneId, scenes } from "@/scenes/scenes";
import { UiConfigEvent } from "@/network/socket_ui/protocol";
import { TouchId } from "@/network/tuioProtocol";
import { Renderer } from "@/rendering/Renderer";
import { PhysicsWorld, PhysicsSettings } from "./PhysicsWorld";
import { PhysicsTouches, HOLD_TO_ADD_MS } from "./PhysicsTouches";
import { PhysicsView } from "./PhysicsView";
import { buildShapes } from "./shapes";

const STEP = 1 / 120;
// Simulated seconds per real second.
const TIME_SCALE = 1.0;
const GRAVITY_RANGE = { min: 0, max: 20 };
const FRICTION_RANGE = { min: 0, max: 1 };
const FLOOR_RANGE = { min: 0.5, max: 1 };
const BOUNCINESS_RANGE = { min: 0, max: 1 };
const AIR_FRICTION_RANGE = { min: 0, max: 3 };

export default class PhysicsScene extends BaseScene {
	private readonly world = new PhysicsWorld();
	private readonly touches = new PhysicsTouches(
		this.world,
		(direction) => this.view?.pick(direction),
		(node) =>
			this.view?.animateCreation(node, (target) => this.createTween(target)),
	);
	private view?: PhysicsView;
	private accumulator = 0;
	private ignoredTouchPoints = new Set<TouchPoint>();

	constructor() {
		super();
		this.background = new THREE.Color(0xbfe4f8);
		this.world.load(buildShapes());
	}

	override onSceneEnter(renderer: Renderer) {
		this.ignoredTouchPoints = new Set(this.touchHandler.getTouchPoints());
		this.accumulator = 0;
		this.view = new PhysicsView(this.world);
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
		if (Number.isFinite(delta) && delta > 0) {
			// Renderer deltas are milliseconds; limit catch-up after stalls.
			this.accumulator += Math.min(delta / 1000, STEP * 8) * TIME_SCALE;
			while (this.accumulator + 1e-9 >= STEP) {
				this.world.step(STEP);
				this.accumulator = Math.max(0, this.accumulator - STEP);
			}
		}
		this.view?.sync();
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

	private resetWorld() {
		this.touches.clear();
		this.world.load(buildShapes());
		this.accumulator = 0;
		this.view?.sync();
		this.sendSocketUiConfig();
	}

	protected override registerSocketUiListeners() {
		super.registerSocketUiListeners();
		this.uiSocket.on("scene", (id: SceneId) => {
			this.sceneManager.setScene(id);
		});
		const slider = (key: keyof PhysicsSettings, min: number, max: number) => {
			this.uiSocket.on(key, (value: unknown) => {
				if (typeof value !== "number" || !Number.isFinite(value)) return;
				this.world.settings[key] = THREE.MathUtils.clamp(value, min, max);
				this.sendSocketUiConfig();
			});
		};
		slider("gravity", GRAVITY_RANGE.min, GRAVITY_RANGE.max);
		slider("friction", FRICTION_RANGE.min, FRICTION_RANGE.max);
		slider("floor", FLOOR_RANGE.min, FLOOR_RANGE.max);
		slider("bounciness", BOUNCINESS_RANGE.min, BOUNCINESS_RANGE.max);
		slider("airFriction", AIR_FRICTION_RANGE.min, AIR_FRICTION_RANGE.max);
		this.uiSocket.on("reset", () => this.resetWorld());
	}

	protected override get socketUiConfig(): UiConfigEvent {
		const settings = this.world.settings;
		return {
			type: "config",
			title: "Physics",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					value: SceneId["Physics"],
					options: scenes.map((scene) => scene.id),
				},
				{
					type: "text",
					hint_title: "Instructions",
					hint_text: [
						"- Hold on empty space to add a dot",
						"- Bring two held dots together to connect them",
						"- Connect 3+ dots to make a shape",
						"- Hold a shape with two fingers to scale it",
						"- Pull two connected dots far apart to disconnect",
						"- Drag a dot into the floor to delete it",
					].join("\n"),
				},
				{
					type: "grid",
					columns: 2,
					elements: [
						{
							type: "slider",
							id: "gravity",
							hint_title: "Gravity",
							value: settings.gravity,
							min: GRAVITY_RANGE.min,
							max: GRAVITY_RANGE.max,
							step: 0.25,
						},
						{
							type: "slider",
							id: "bounciness",
							hint_title: "Bounciness",
							value: settings.bounciness,
							min: BOUNCINESS_RANGE.min,
							max: BOUNCINESS_RANGE.max,
							step: 0.05,
						},
						{
							type: "slider",
							id: "friction",
							hint_title: "Surface friction",
							value: settings.friction,
							min: FRICTION_RANGE.min,
							max: FRICTION_RANGE.max,
							step: 0.05,
						},
						{
							type: "slider",
							id: "airFriction",
							hint_title: "Air friction",
							value: settings.airFriction,
							min: AIR_FRICTION_RANGE.min,
							max: AIR_FRICTION_RANGE.max,
							step: 0.05,
						},
					],
				},
				{
					type: "slider",
					id: "floor",
					hint_title: "Floor height",
					hint_text: "Starts at the equator; lower it to sink the floor.",
					value: settings.floor,
					min: FLOOR_RANGE.min,
					max: FLOOR_RANGE.max,
					step: 0.05,
				},
				{ type: "button", id: "reset", text: "Reset scene" },
			],
		};
	}
}
