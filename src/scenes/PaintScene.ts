import * as THREE from "three";
import BaseScene from "./BaseScene";
import { TouchId } from "@/network/tuioProtocol";
import { Renderer } from "./Renderer";
import { getRainbowColor, getRandomColor } from "@/utils/functions";

import vertexShader from "@/shaders/basic.vert?raw";
import { SceneKey, sceneManager, scenes } from "./SceneManager";
import { UiConfigEvent } from "@/network/uiProtocol";

const fragmentShader = `
precision highp float;
uniform sampler2D textureNew;
uniform sampler2D textureOld;
uniform float blur;
varying vec2 vUv;

void main() {
	vec4 oldColor = texture2D(textureOld, vUv);
	vec4 newColor = texture2D(textureNew, vUv);

	vec4 composed = 1.0 * max(oldColor, newColor);
	gl_FragColor = composed;
}
`;

const blurFragmentShader = `
precision highp float;
uniform sampler2D textureNew;
uniform sampler2D textureOld;
uniform float blur;
varying vec2 vUv;

void main() {
	vec4 oldColor =
		0.25 * texture2D(textureOld, vUv + vec2( blur,  blur)) +
		0.25 * texture2D(textureOld, vUv + vec2(-blur,  blur)) +
		0.25 * texture2D(textureOld, vUv + vec2( blur, -blur)) +
		0.25 * texture2D(textureOld, vUv + vec2(-blur, -blur));
	vec4 newColor = texture2D(textureNew, vUv);

	vec4 composed = 0.998 * max(oldColor, newColor);
	gl_FragColor = composed;
}
`;

interface TouchState {
	sphereNow: THREE.Mesh;
	spherePrev: THREE.Mesh;
	lastPosition: THREE.Vector3 | null;
}

/* Socket UI config */

const ColorModes = ["rainbow", "random", "white"] as const;
type ColorMode = (typeof ColorModes)[number];

export interface PaintUiConfig {
	penWidth: number;
	blur: boolean;
	colorMode: ColorMode;
}

export default class PaintScene extends BaseScene {
	// Drawing
	private touchStates: Map<number, TouchState>;
	private touchSphereGeo: THREE.SphereGeometry;
	private touchSphereMat: THREE.MeshBasicMaterial;
	private lineGeo: THREE.CylinderGeometry;
	private lineMeshes: THREE.Mesh[] = [];
	private touchColors: { [touchId: number]: number } = {};

	// Shader
	private feedbackA: THREE.WebGLRenderTarget;
	private feedbackB: THREE.WebGLRenderTarget;
	private feedbackMaterial: THREE.ShaderMaterial;
	private feedbackQuad: THREE.Mesh;
	private useA = true;
	private needsClear = false;

	private paintConfig: PaintUiConfig = {
		penWidth: 0.1,
		blur: false,
		colorMode: "rainbow",
	};

	constructor() {
		super();

		this.init();
	}

	protected onTouch(touchId: TouchId, vector: THREE.Vector3) {
		this.updateTouchSphere(touchId, vector);
	}

	protected onRemove(touchId: TouchId) {
		this.removeTouchSphere(touchId);
	}

	public setRendererSettings(renderer: Renderer): void {
		// renderer.setClearColor(new THREE.Color(255, 0, 0));
		// renderer.clearColor();
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.NoToneMapping;
		renderer.autoClear = true;
	}

	init() {
		const penWidth = this.paintConfig.penWidth;

		this.touchStates = new Map<number, TouchState>();
		this.touchSphereGeo = new THREE.SphereGeometry(penWidth, 12, 10);
		this.touchSphereMat = new THREE.MeshBasicMaterial({
			color: 0xffffff,
			depthTest: false,
			depthWrite: false,
		});
		this.lineGeo = new THREE.CylinderGeometry(penWidth, penWidth, 1, 8, 1);
		this.lineGeo.rotateX(Math.PI / 2); // Make cylinder align with Z axis
		const lineMeshes: THREE.Mesh[] = [];

		/* Rendering */

		const res = 1024;

		this.feedbackA = new THREE.WebGLRenderTarget(res, res, {
			format: THREE.RGBAFormat,
			type: THREE.UnsignedByteType,
		});
		this.feedbackB = new THREE.WebGLRenderTarget(res, res, {
			format: THREE.RGBAFormat,
			type: THREE.UnsignedByteType,
		});

		this.feedbackMaterial = new THREE.ShaderMaterial({
			uniforms: {
				textureNew: { value: null },
				textureOld: { value: this.feedbackA.texture },
				blur: { value: 0.0015 },
			},
			vertexShader: vertexShader,
			fragmentShader: fragmentShader,
			depthTest: false,
			depthWrite: false,
			transparent: true,
		});

		this.feedbackQuad = new THREE.Mesh(
			new THREE.PlaneGeometry(2, 2),
			this.feedbackMaterial,
		);
	}

	updateTouchSphere(id: number, vector: THREE.Vector3) {
		if (!(id in this.touchColors)) {
			this.touchColors[id] = this.getColor();
		}
		this.touchSphereMat.color.setHex(this.touchColors[id]);

		let state = this.touchStates.get(id);
		if (!state) {
			const sphereNow = new THREE.Mesh(
				this.touchSphereGeo,
				this.touchSphereMat.clone(),
			);
			this.add(sphereNow);
			const spherePrev = new THREE.Mesh(
				this.touchSphereGeo,
				this.touchSphereMat.clone(),
			);
			this.add(spherePrev);

			state = { sphereNow, spherePrev, lastPosition: null };
			this.touchStates.set(id, state);
		}

		// Convert pitch/yaw to direction and get new position
		const newPosition = vector.clone().multiplyScalar(5);
		state.sphereNow.position.copy(newPosition);

		// If we have a previous position, create a line between them
		if (state.lastPosition) {
			state.spherePrev.position.copy(state.lastPosition);

			const line = this.createLine(state.lastPosition, newPosition);
			this.add(line);
			this.lineMeshes.push(line);
		}

		// Update last position
		state.lastPosition = newPosition.clone();
	}

	removeTouchSphere(id: number) {
		const state = this.touchStates.get(id);
		if (state) {
			this.remove(state.sphereNow);
			this.remove(state.spherePrev);
			this.touchStates.delete(id);
		}
	}

	clearLines() {
		// Clear all lines
		this.lineMeshes.forEach((line) => this.remove(line));
		this.lineMeshes.length = 0;
	}

	createLine(start: THREE.Vector3, end: THREE.Vector3): THREE.Mesh {
		const line = new THREE.Mesh(this.lineGeo, this.touchSphereMat.clone());
		const direction = end.clone().sub(start);
		const length = direction.length();

		// Position at midpoint
		line.position.copy(start).add(end).multiplyScalar(0.5);

		// Orient to point from start to end
		line.lookAt(end);
		line.scale.set(1, 1, length);

		return line;
	}

	updatePenWidth(width: number) {
		this.paintConfig.penWidth = width;

		// Dispose old geometries
		this.touchSphereGeo.dispose();
		this.lineGeo.dispose();

		// Create new ones
		this.touchSphereGeo = new THREE.SphereGeometry(width, 12, 10);

		this.lineGeo = new THREE.CylinderGeometry(width, width, 1, 8, 1);
		this.lineGeo.rotateX(Math.PI / 2);
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

	/* Rendering */

	override onExit(renderer: Renderer) {
		super.onExit(renderer);

		// Remove feedback textures, listeners, etc.
		this.clearLines();
		this.clear();
	}

	postRender() {
		this.clearLines();
	}

	override renderScene(renderer: Renderer) {
		const projectionScene = renderer.projectionScene;

		// 1️⃣ Capture cube map
		projectionScene.cubeCamera.position.copy(renderer.centerCamera.position);
		projectionScene.cubeCamera.quaternion.copy(
			renderer.centerCamera.quaternion,
		);
		projectionScene.cubeCamera.update(renderer, this);

		// 2️⃣ Render AEP into target
		renderer.setRenderTarget(projectionScene.aepTarget);
		renderer.render(projectionScene, projectionScene.screenCamera);

		// 3️⃣ Feedback blur pass
		const readBuffer = this.useA ? this.feedbackA : this.feedbackB;
		const writeBuffer = this.useA ? this.feedbackB : this.feedbackA;
		this.feedbackMaterial.uniforms.textureNew.value =
			projectionScene.aepTarget.texture;
		this.feedbackMaterial.uniforms.textureOld.value = readBuffer.texture;

		renderer.setRenderTarget(writeBuffer);
		renderer.render(this.feedbackQuad, projectionScene.screenCamera);

		// 4️⃣ Display final
		renderer.setRenderTarget(null);
		renderer.render(this.feedbackQuad, projectionScene.screenCamera);

		// 5️⃣ Swap buffers
		this.useA = !this.useA;

		// Clear is needed
		if (this.needsClear) {
			const prev = renderer.getRenderTarget();

			renderer.setRenderTarget(this.feedbackA);
			renderer.clear(true, true, true);

			renderer.setRenderTarget(this.feedbackB);
			renderer.clear(true, true, true);

			renderer.setRenderTarget(prev);

			this.useA = true;
			this.needsClear = false;
		}
	}

	/* Socket UI */

	initializeUi() {
		super.initializeUi();

		this.uiSocket.on("pen_width", (value: number) => {
			this.updatePenWidth(value);
			this.sendUiConfig();
		});

		this.uiSocket.on("blur", (value: boolean) => {
			this.paintConfig.blur = value;
			this.feedbackMaterial.fragmentShader = value
				? blurFragmentShader
				: fragmentShader;
			this.feedbackMaterial.needsUpdate = true;
			this.sendUiConfig();
		});

		this.uiSocket.on("color_mode", (value: ColorMode) => {
			this.paintConfig.colorMode = value;
			this.sendUiConfig();
		});

		this.uiSocket.on("clear", () => {
			this.needsClear = true;
		});
	}

	sendUiConfig() {
		this.uiSocket.send(this.uiConfig);
	}

	get uiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Paint",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneKey.Paint,
					options: Object.values(SceneKey),
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
					hint_text: "Make the painting fade away",
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
