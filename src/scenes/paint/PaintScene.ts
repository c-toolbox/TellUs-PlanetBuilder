import * as THREE from "three";
import BaseScene from "@/scenes/BaseScene";
import { Renderer } from "@/rendering/Renderer";
import { SceneId, scenes } from "@/scenes/scenes";
import { TouchId } from "@/network/tuioProtocol";
import { getRainbowColor, getRandomColor } from "@/utils/functions";
import { UiConfigEvent } from "@/network/socket_ui/protocol";
import { SphericalPaint } from "./SphericalPaint";

interface TouchState {
	sphereNow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
	lastPosition: THREE.Vector3;
	inputPosition: THREE.Vector3;
	brushPosition: THREE.Vector3;
	controlPosition: THREE.Vector3;
	controlWidth: number;
	timestamp: number;
	brushTimestamp: number;
	speed: number;
	movements: { distance: number; delta: number }[];
}

const PAINT_RADIUS = 5;
// Small world-space distances on the painting sphere, independent of frame rate.
const BRUSH_POINT_SPACING = 0.01;
const BRUSH_CURVE_STEP = 0.05;

// Average recent movements, then smooth over time. Speeds are world units/sec.
const BRUSH_SPEED_SCALE = 5;
const BRUSH_SPEED_SMOOTHING = 0.1;
const BRUSH_SPEED_SAMPLES = 5;
// The inverse width curve maps this speed to the selected pen width.
const BRUSH_INITIAL_SPEED = BRUSH_SPEED_SCALE / 2;

const ColorModes = ["rainbow", "random", "white"] as const;
type ColorMode = (typeof ColorModes)[number];

export interface PaintUiConfig {
	penWidth: number;
	dynamicWidth: boolean;
	dynamicWidthRange: number;
	lazyRadius: number;
	friction: number;
	blur: boolean;
	colorMode: ColorMode;
}

export default class PaintScene extends BaseScene {
	private painting?: SphericalPaint;
	private readonly strokes = new THREE.Scene();
	private readonly touchStates = new Map<TouchId, TouchState>();
	private touchSphereGeo?: THREE.SphereGeometry;
	private lineGeo?: THREE.CylinderGeometry;
	private frameMeshes: THREE.Mesh[] = [];
	private retiredMaterials: THREE.MeshBasicMaterial[] = [];
	private drawOrder = 0;
	private strokesChanged = false;

	private paintConfig: PaintUiConfig = {
		penWidth: 0.1,
		dynamicWidth: false,
		dynamicWidthRange: 0.5,
		lazyRadius: 0.02,
		friction: 0,
		blur: false,
		colorMode: "rainbow",
	};

	protected override onTouch(touchId: TouchId, vector: THREE.Vector3) {
		this.updateTouchSphere(touchId, vector);
	}

	protected override onRemove(touchId: TouchId) {
		this.removeTouchSphere(touchId);
	}

	updateTouchSphere(id: TouchId, vector: THREE.Vector3) {
		if (!this.touchSphereGeo || !this.lineGeo) return;
		const lengthSquared = vector.lengthSq();
		if (!Number.isFinite(lengthSquared) || lengthSquared < 1e-12) return;
		const newPosition = vector.clone().normalize().multiplyScalar(PAINT_RADIUS);
		const now = performance.now();
		const state = this.touchStates.get(id);
		if (state) {
			// Width follows the raw pointer, independently of the stabilized path.
			const distance = state.inputPosition.distanceTo(newPosition);
			if (distance < 1e-6) {
				this.updateBrush(state, now);
				return;
			}
			// Include time spent stationary in the next movement's speed estimate.
			const dt = Math.max((now - state.timestamp) / 1000, 0.001);
			state.timestamp = now;
			state.movements.push({ distance, delta: dt });
			if (state.movements.length > BRUSH_SPEED_SAMPLES) state.movements.shift();
			// Keep the baseline width until we have enough actual movements.
			if (state.movements.length === BRUSH_SPEED_SAMPLES) {
				const distanceSum = state.movements.reduce((sum, movement) => sum + movement.distance, 0);
				const deltaSum = state.movements.reduce((sum, movement) => sum + movement.delta, 0);
				const averageSpeed = Math.min(distanceSum / deltaSum, 1000);
				state.speed = THREE.MathUtils.damp(
					state.speed, averageSpeed, 1 / BRUSH_SPEED_SMOOTHING, dt,
				);
			}
			state.inputPosition.copy(newPosition);
			this.updateBrush(state, now);
			return;
		}
		this.strokesChanged = true;
		const order = ++this.drawOrder;
		const material = new THREE.MeshBasicMaterial({
			color: this.getColor(),
			depthTest: false,
			depthWrite: false,
			blending: THREE.NoBlending,
			toneMapped: false,
		});
		const sphereNow = new THREE.Mesh(this.touchSphereGeo, material);
		sphereNow.scale.setScalar(this.paintConfig.penWidth);
		sphereNow.position.copy(newPosition);
		sphereNow.renderOrder = order;
		this.strokes.add(sphereNow);
		this.touchStates.set(id, {
			sphereNow,
			lastPosition: newPosition.clone(),
			inputPosition: newPosition.clone(),
			brushPosition: newPosition.clone(),
			controlPosition: newPosition.clone(),
			controlWidth: this.paintConfig.penWidth,
			timestamp: now,
			brushTimestamp: now,
			speed: BRUSH_INITIAL_SPEED,
			movements: [],
		});
	}

	private updateBrush(state: TouchState, now: number) {
		const dt = Math.max((now - state.brushTimestamp) / 1000, 0);
		state.brushTimestamp = now;
		const { lazyRadius, friction } = this.paintConfig;
		// Follow only the excess distance outside the lazy radius. Friction is
		// the fraction retained at 60 Hz, adjusted for elapsed time so different
		// input and display rates have the same feel. 0 follows; 1 holds still.
		const pullDistance = state.brushPosition.distanceTo(state.inputPosition);
		if (pullDistance <= lazyRadius) return;
		const follow = friction === 0 ? 1 : 1 - Math.pow(friction, dt * 60);
		if (follow <= 0) return;
		state.brushPosition.lerp(state.inputPosition, (1 - lazyRadius / pullDistance) * follow)
			.normalize().multiplyScalar(PAINT_RADIUS);
		const spacing = Math.min(BRUSH_POINT_SPACING, this.paintConfig.penWidth * 0.25);
		if (state.controlPosition.distanceTo(state.brushPosition) < spacing) return;
		const width = this.getBrushWidth(state.speed);
		const midpoint = state.controlPosition.clone().add(state.brushPosition)
			.normalize().multiplyScalar(PAINT_RADIUS);
		this.drawCurve(state, midpoint, (state.controlWidth + width) / 2);
		state.controlPosition.copy(state.brushPosition);
		state.controlWidth = width;
	}

	private drawCurve(state: TouchState, endPosition: THREE.Vector3, endWidth: number) {
		// Consecutive curves meet at sample midpoints, sharing a tangent. Apply
		// the same quadratic interpolation to width to avoid little size steps.
		const startWidth = state.sphereNow.scale.x;
		const curve = new THREE.QuadraticBezierCurve3(
			state.lastPosition.clone(), state.controlPosition, endPosition,
		);
		const length = state.lastPosition.distanceTo(state.controlPosition) +
			state.controlPosition.distanceTo(endPosition);
		const step = Math.min(BRUSH_CURVE_STEP, this.paintConfig.penWidth * 0.5);
		const segments = THREE.MathUtils.clamp(Math.ceil(length / step), 1, 64);
		const point = new THREE.Vector3();
		for (let i = 1; i <= segments; i++) {
			const t = i / segments;
			const u = 1 - t;
			curve.getPoint(t, point).normalize().multiplyScalar(PAINT_RADIUS);
			const width = u * u * startWidth + 2 * u * t * state.controlWidth + t * t * endWidth;
			this.drawSegment(state, point, width);
		}
	}

	private drawSegment(state: TouchState, newPosition: THREE.Vector3, width: number) {
		if (!this.lineGeo) return;
		const length = state.lastPosition.distanceTo(newPosition);
		if (length < 1e-6) return;
		const order = ++this.drawOrder;
		const previousWidth = state.sphereNow.scale.x;
		// Keep every rounded joint until capture, even when several curve
		// segments arrive between frames. Later segments must not resize it.
		const spherePrev = state.sphereNow.clone();
		spherePrev.visible = true;
		spherePrev.renderOrder = order;
		this.strokes.add(spherePrev);
		this.frameMeshes.push(spherePrev);
		const tapered = previousWidth !== width;
		const geometry = tapered
			? new THREE.CylinderGeometry(width, previousWidth, 1, 64, 1)
			: this.lineGeo;
		// After rotation, radiusTop is at local +Z, facing the new point.
		if (tapered) geometry.rotateX(Math.PI / 2);
		const line = new THREE.Mesh(geometry, state.sphereNow.material);
		line.position.copy(state.lastPosition).add(newPosition).multiplyScalar(0.5);
		line.lookAt(newPosition);
		const radiusScale = tapered ? 1 : width;
		line.scale.set(radiusScale, radiusScale, length);
		line.renderOrder = order;
		this.strokes.add(line);
		this.frameMeshes.push(line);
		state.sphereNow.position.copy(newPosition);
		state.sphereNow.scale.setScalar(width);
		state.sphereNow.visible = true;
		state.sphereNow.renderOrder = order;
		state.lastPosition.copy(newPosition);
		this.strokesChanged = true;
	}

	removeTouchSphere(id: TouchId) {
		const state = this.touchStates.get(id);
		if (!state) return;
		// Finish the buffered curve without snapping across any remaining
		// friction lag. Retain the last accepted width to avoid endpoint blobs.
		const endPosition = this.paintConfig.friction > 0 ? state.brushPosition : state.inputPosition;
		if (state.lastPosition.distanceToSquared(endPosition) > 1e-12) {
			this.drawCurve(state, endPosition, state.controlWidth);
		}
		// Retain quick taps until the next update has copied them into the painting.
		this.frameMeshes.push(state.sphereNow);
		this.retiredMaterials.push(state.sphereNow.material);
		this.touchStates.delete(id);
	}

	private clearFrameStrokes() {
		for (const mesh of this.frameMeshes) {
			this.strokes.remove(mesh);
			if (mesh.geometry !== this.touchSphereGeo && mesh.geometry !== this.lineGeo) {
				mesh.geometry.dispose();
			}
		}
		this.frameMeshes.length = 0;
		for (const material of this.retiredMaterials) material.dispose();
		this.retiredMaterials.length = 0;
		// A held touch paints its current position only when blur is enabled.
		for (const state of this.touchStates.values()) {
			state.sphereNow.visible = false;
		}
	}

	private clearBrushes() {
		this.clearFrameStrokes();
		for (const state of this.touchStates.values()) state.sphereNow.material.dispose();
		this.touchStates.clear();
		this.strokes.clear();
		this.drawOrder = 0;
		this.strokesChanged = false;
	}

	updatePenWidth(width: number) {
		if (!Number.isFinite(width)) return;
		this.paintConfig.penWidth = THREE.MathUtils.clamp(width, 0.01, 1);
		for (const state of this.touchStates.values()) {
			state.sphereNow.scale.setScalar(this.getBrushWidth(state.speed));
			state.controlWidth = state.sphereNow.scale.x;
			state.sphereNow.visible = true;
		}
		this.strokesChanged = this.touchStates.size > 0 || this.strokesChanged;
	}

	private getBrushWidth(speed: number) {
		if (!this.paintConfig.dynamicWidth) return this.paintConfig.penWidth;
		// Normalize the inverse curve to [-1, 1], keeping the initial speed at
		// baseline width for every range. A range of 0.5 preserves 50–150%.
		const response = THREE.MathUtils.clamp(3 / (1 + speed / BRUSH_SPEED_SCALE) - 2, -1, 1);
		const scale = 1 + this.paintConfig.dynamicWidthRange * response;
		return this.paintConfig.penWidth * scale;
	}

	getColor() {
		switch (this.paintConfig.colorMode) {
			case "rainbow":
				return getRainbowColor();
			case "random":
				return getRandomColor();
			case "white":
				return 0xffffff;
		}
	}

	override onSceneEnter(renderer: Renderer) {
		this.touchSphereGeo = new THREE.SphereGeometry(1, 64, 48);
		this.lineGeo = new THREE.CylinderGeometry(1, 1, 1, 64, 1);
		this.lineGeo.rotateX(Math.PI / 2);
		this.painting = new SphericalPaint(renderer);
		this.add(this.painting.surface);
		super.onSceneEnter(renderer);
		this.remove(this.touchHandler.touchGroup);
	}

	override onSceneExit(renderer: Renderer) {
		super.onSceneExit(renderer);
		this.clearBrushes();
		this.touchSphereGeo?.dispose();
		this.touchSphereGeo = undefined;
		this.lineGeo?.dispose();
		this.lineGeo = undefined;
		if (this.painting) {
			this.remove(this.painting.surface);
			this.painting.dispose();
			this.painting = undefined;
		}
	}

	override update(delta: number) {
		// Let friction settle toward a held pointer, even without new input.
		if (this.paintConfig.friction > 0 && this.paintConfig.friction < 1) {
			const now = performance.now();
			for (const state of this.touchStates.values()) this.updateBrush(state, now);
		}
		// Update once before any view renders, including the direct 3D scene view.
		// Re-stamping an unchanged contact would gradually turn fractional edge
		// coverage opaque. Once the brush settles, only blur needs more stamping.
		if (this.paintConfig.blur) {
			for (const state of this.touchStates.values()) {
				state.sphereNow.visible = true;
			}
		}
		if (this.strokesChanged || this.paintConfig.blur) {
			this.painting?.step(this.strokes, this.paintConfig.blur, delta / 1000);
		}
		this.strokesChanged = false;
		this.clearFrameStrokes();
	}

	/* Socket UI */

	registerSocketUiListeners() {
		super.registerSocketUiListeners();
		this.uiSocket.on("scene", (id: SceneId) => {
			this.sceneManager.setScene(id);
		});

		this.uiSocket.on("pen_width", (value: number) => {
			this.updatePenWidth(value);
			this.sendSocketUiConfig();
		});

		this.uiSocket.on("dynamic_width", (value: boolean) => {
			if (typeof value !== "boolean") return;
			this.paintConfig.dynamicWidth = value;
			this.updatePenWidth(this.paintConfig.penWidth);
			this.sendSocketUiConfig();
		});

		const slider = (id: string, key: "dynamicWidthRange" | "lazyRadius" | "friction", max: number) => {
			this.uiSocket.on(id, (value: number) => {
				if (!Number.isFinite(value)) return;
				this.paintConfig[key] = THREE.MathUtils.clamp(value, 0, max);
				if (key === "dynamicWidthRange") {
					this.updatePenWidth(this.paintConfig.penWidth);
				} else {
					const now = performance.now();
					for (const state of this.touchStates.values()) this.updateBrush(state, now);
				}
				this.sendSocketUiConfig();
			});
		};
		slider("dynamic_width_range", "dynamicWidthRange", 1);
		slider("lazy_radius", "lazyRadius", 0.5);
		slider("friction", "friction", 1);

		this.uiSocket.on("blur", (value: boolean) => {
			if (typeof value !== "boolean") return;
			this.paintConfig.blur = value;
			this.sendSocketUiConfig();
		});

		this.uiSocket.on("color_mode", (value: ColorMode) => {
			if (!ColorModes.includes(value)) return;
			this.paintConfig.colorMode = value;
			this.sendSocketUiConfig();
		});

		this.uiSocket.on("clear", () => {
			this.clearBrushes();
			this.painting?.clear();
		});
	}

	get socketUiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Paint",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneId.Paint,
					options: scenes.map((scene) => scene.id),
				},

				{
					type: "hr",
					hint_title: "Paint settings",
				},
				{
					type: "slider",
					id: "pen_width",
					hint_title: "Pen size",
					hint_text: "The width of the pen while drawing",
					value: this.paintConfig.penWidth,
					min: 0.01,
					max: 1.0,
					step: 0.01,
				},
				{
					type: "switch",
					id: "dynamic_width",
					hint_title: "Dynamic pen size",
					hint_text: "Faster strokes are thinner; adjust the amount with width variation",
					value: this.paintConfig.dynamicWidth,
				},
				{
					type: "slider",
					id: "dynamic_width_range",
					hint_title: "Width variation",
					hint_text: "Variation around the pen size: 0 is constant, 0.5 allows ±50%, 1 allows ±100%",
					value: this.paintConfig.dynamicWidthRange,
					min: 0,
					max: 1,
					step: 0.01,
				},
				{
					type: "slider",
					id: "lazy_radius",
					hint_title: "Lazy radius",
					hint_text: "How far the pointer moves before pulling the brush; 0 removes the dead zone",
					value: this.paintConfig.lazyRadius,
					min: 0,
					max: 0.5,
					step: 0.005,
				},
				{
					type: "slider",
					id: "friction",
					hint_title: "Friction",
					hint_text: "Extra brush lag: 0 follows freely, 1 holds the brush still",
					value: this.paintConfig.friction,
					min: 0,
					max: 1,
					step: 0.01,
				},
				{
					type: "switch",
					id: "blur",
					hint_title: "Enable blur",
					hint_text: "Blur the painting and let it fade away",
					value: this.paintConfig.blur,
				},
				{
					type: "dropdown",
					id: "color_mode",
					hint_title: "Color mode",
					hint_text: "How colors are picked while drawing",
					options: ColorModes,
					value: this.paintConfig.colorMode,
				},
				{
					type: "button",
					id: "clear",
					hint_title: "Clear",
					hint_text: "Clear all drawings and start fresh",
					text: "Clear",
					color: "#c70036",
				},
			],
		};
	}
}
