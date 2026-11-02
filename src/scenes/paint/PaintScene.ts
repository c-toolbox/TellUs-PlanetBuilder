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
	spherePrev: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
	lastPosition: THREE.Vector3;
}

const ColorModes = ["rainbow", "random", "white"] as const;
type ColorMode = (typeof ColorModes)[number];

export interface PaintUiConfig {
	penWidth: number;
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
		const newPosition = vector.clone().normalize().multiplyScalar(5);
		let state = this.touchStates.get(id);
		if (state && state.lastPosition.distanceToSquared(newPosition) < 1e-12) return;
		this.strokesChanged = true;
		const order = ++this.drawOrder;
		if (!state) {
			const material = new THREE.MeshBasicMaterial({
				color: this.getColor(),
				depthTest: false,
				depthWrite: false,
				blending: THREE.NoBlending,
				toneMapped: false,
			});
			const sphereNow = new THREE.Mesh(this.touchSphereGeo, material);
			const spherePrev = new THREE.Mesh(this.touchSphereGeo, material);
			sphereNow.scale.setScalar(this.paintConfig.penWidth);
			spherePrev.scale.setScalar(this.paintConfig.penWidth);
			spherePrev.position.copy(newPosition);
			this.strokes.add(sphereNow, spherePrev);
			state = { sphereNow, spherePrev, lastPosition: newPosition.clone() };
			this.touchStates.set(id, state);
		} else {
			state.spherePrev.position.copy(state.lastPosition);
			const length = state.lastPosition.distanceTo(newPosition);
			if (length > 1e-6) {
				const line = new THREE.Mesh(this.lineGeo, state.sphereNow.material);
				line.position.copy(state.lastPosition).add(newPosition).multiplyScalar(0.5);
				line.lookAt(newPosition);
				line.scale.set(this.paintConfig.penWidth, this.paintConfig.penWidth, length);
				line.renderOrder = order;
				this.strokes.add(line);
				this.frameMeshes.push(line);
			}
		}
		state.sphereNow.position.copy(newPosition);
		state.sphereNow.visible = true;
		state.spherePrev.visible = true;
		state.sphereNow.renderOrder = order;
		state.spherePrev.renderOrder = order;
		state.lastPosition.copy(newPosition);
	}

	removeTouchSphere(id: TouchId) {
		const state = this.touchStates.get(id);
		if (!state) return;
		// Retain quick taps until the next update has copied them into the painting.
		this.frameMeshes.push(state.sphereNow, state.spherePrev);
		this.retiredMaterials.push(state.sphereNow.material);
		this.touchStates.delete(id);
	}

	private clearFrameStrokes() {
		for (const mesh of this.frameMeshes) this.strokes.remove(mesh);
		this.frameMeshes.length = 0;
		for (const material of this.retiredMaterials) material.dispose();
		this.retiredMaterials.length = 0;
		// The previous endpoint is needed for one frame only; a held touch paints
		// its current position while the rest of the accumulated stroke can blur.
		for (const state of this.touchStates.values()) {
			state.spherePrev.position.copy(state.sphereNow.position);
			state.sphereNow.visible = false;
			state.spherePrev.visible = false;
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
			state.sphereNow.scale.setScalar(this.paintConfig.penWidth);
			state.spherePrev.scale.setScalar(this.paintConfig.penWidth);
			state.sphereNow.visible = true;
			state.spherePrev.visible = true;
		}
		this.strokesChanged = this.touchStates.size > 0 || this.strokesChanged;
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
		// Update once before any view renders, including the direct 3D scene view.
		// Re-stamping an unchanged contact would gradually turn fractional edge
		// coverage opaque. Only blur needs continuous input from a held touch.
		if (this.paintConfig.blur) {
			for (const state of this.touchStates.values()) {
				state.sphereNow.visible = true;
				state.spherePrev.visible = true;
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
