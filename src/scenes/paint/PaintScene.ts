import * as THREE from "three";
import BaseScene from "@/scenes/BaseScene";
import { Renderer } from "@/rendering/Renderer";
import { SceneId, scenes } from "@/scenes/scenes";

import { TouchId } from "@/network/tuioProtocol";
import { getRainbowColor, getRandomColor } from "@/utils/functions";
import { UiConfigEvent } from "@/network/socket_ui/protocol";
import vertexShader from "@/rendering/shaders/basic.vert?raw";

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
	private touchStates: Map<number, TouchState> | null = null;
	private touchSphereGeo: THREE.SphereGeometry | null = null;
	private touchSphereMat: THREE.MeshBasicMaterial | null = null;
	private lineGeo: THREE.CylinderGeometry | null = null;
	private lineMeshes: THREE.Mesh[] = [];
	private touchColors: { [touchId: number]: number } = {};

	// Shader
	private feedbackA: THREE.WebGLRenderTarget | null = null;
	private feedbackB: THREE.WebGLRenderTarget | null = null;
	private feedbackMaterial: THREE.ShaderMaterial | null = null;
	private feedbackQuad: THREE.Mesh | null = null;
	private readonly feedbackCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	private readonly projectionTarget = new THREE.WebGLRenderTarget(2048, 2048, { samples: 4 });
	private useA = true;
	private needsClear = false;

	private paintConfig: PaintUiConfig = {
		penWidth: 0.1,
		blur: false,
		colorMode: "rainbow",
	};

	constructor() {
		super();

		this.projectionTarget.texture.colorSpace = THREE.SRGBColorSpace;
		this.init();
	}

	protected onTouch(touchId: TouchId, vector: THREE.Vector3) {
		this.updateTouchSphere(touchId, vector);
	}

	protected onRemove(touchId: TouchId) {
		this.removeTouchSphere(touchId);
	}

	public applyRendererSettings(renderer: Renderer): void {
		super.applyRendererSettings(renderer);
		renderer.setClearColor(new THREE.Color(0, 0, 0));
		renderer.clearColor();
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
		if (!this.touchStates || !this.touchSphereGeo || !this.touchSphereMat) return;
		if (!(id in this.touchColors)) {
			this.touchColors[id] = this.getColor();
		}
		this.touchSphereMat.color.setHex(this.touchColors[id]);

		let state = this.touchStates?.get(id);
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
			if (line) {
				this.add(line);
				this.lineMeshes.push(line);
			}
		}

		// Update last position
		state.lastPosition = newPosition.clone();
	}

	removeTouchSphere(id: number) {
		const state = this.touchStates?.get(id);
		if (state) {
			this.remove(state.sphereNow);
			this.remove(state.spherePrev);
			this.touchStates?.delete(id);
		}
	}

	clearLines() {
		// Clear all lines
		this.lineMeshes.forEach((line) => this.remove(line));
		this.lineMeshes.length = 0;
	}

	createLine(start: THREE.Vector3, end: THREE.Vector3): THREE.Mesh | null {
		if (!this.lineGeo || !this.touchSphereMat) return null;
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
		this.touchSphereGeo?.dispose();
		this.lineGeo?.dispose();

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

	override onSceneEnter(renderer: Renderer) {
		super.onSceneEnter(renderer);

		this.remove(this.touchHandler.touchGroup);
	}

	override onSceneExit(renderer: Renderer) {
		super.onSceneExit(renderer);

		// Remove feedback textures, listeners, etc.
		this.clearLines();
		this.touchStates?.clear();
		this.touchColors = {};
		this.clear();
	}

	postRender(renderer: Renderer) {
		super.postRender(renderer);
		this.clearLines();
	}

	override renderScene(renderer: Renderer) {
		if (!this.feedbackA || !this.feedbackB || !this.feedbackMaterial || !this.feedbackQuad) return;
		renderer.renderProjection(this, this.projectionTarget);

		// 3️⃣ Feedback blur pass
		const readBuffer = this.useA ? this.feedbackA : this.feedbackB;
		const writeBuffer = this.useA ? this.feedbackB : this.feedbackA;
		this.feedbackMaterial.uniforms.textureNew.value =
			this.projectionTarget.texture;
		this.feedbackMaterial.uniforms.textureOld.value = readBuffer.texture;

		renderer.setRenderTarget(writeBuffer);
		renderer.render(this.feedbackQuad, this.feedbackCamera);

		// 4️⃣ Display final
		renderer.setRenderTarget(renderer.projectionOutputTarget);
		renderer.render(this.feedbackQuad, this.feedbackCamera);

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
			if (!this.feedbackMaterial) return;
			this.paintConfig.blur = value;
			this.feedbackMaterial.fragmentShader = value
				? blurFragmentShader
				: fragmentShader;
			this.feedbackMaterial.needsUpdate = true;
			this.sendSocketUiConfig();
		});

		this.uiSocket.on("color_mode", (value: ColorMode) => {
			this.paintConfig.colorMode = value;
			this.sendSocketUiConfig();
		});

		this.uiSocket.on("clear", () => {
			this.needsClear = true;
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
