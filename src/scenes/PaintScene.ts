import * as THREE from "three";
import BaseScene from "./BaseScene";
import { TouchId } from "@/network/tuioProtocol";
import { PEN_SIZE } from "@/constants";
import { Color } from "@/utils/colors";
import { Renderer } from "./Renderer";
import { getNextColor } from "@/utils/functions";

import vertexShader from "@/shaders/basic.vert?raw";
import fragmentShader from "@/shaders/feedbackBlur.frag?raw";

interface TouchState {
	sphereNow: THREE.Mesh;
	spherePrev: THREE.Mesh;
	lastPosition: THREE.Vector3 | null;
}

export class PaintScene extends BaseScene {
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

	constructor() {
		super();

		this.init();

		// [
		// 	[1, 0, 0],
		// 	[-1, 0, 0],
		// 	[0, 1, 0],
		// 	[0, -1, 0],
		// 	[0, 0, 1],
		// 	[0, 0, -1],
		// ].forEach((position) =>
		// 	this.addText({
		// 		text: "Touch to draw!",
		// 		color: getNextColor(),
		// 		size: 0.2,
		// 		position: new THREE.Vector3(...position),
		// 	})
		// );

		this.touchHandler.on("touch", (touchId: TouchId, vector: THREE.Vector3) => {
			this.updateTouchSphere(touchId, vector);
		});
		this.touchHandler.on("remove", (touchId: TouchId) => {
			this.removeTouchSphere(touchId);
			// this.clearLines();
		});
	}

	public setRendererSettings(renderer: Renderer): void {
		// renderer.setClearColor(new THREE.Color(255, 0, 0));
		// renderer.clearColor();
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.NoToneMapping;
		renderer.autoClear = true;
	}

	init() {
		this.touchStates = new Map<number, TouchState>();
		this.touchSphereGeo = new THREE.SphereGeometry(PEN_SIZE, 12, 10);
		this.touchSphereMat = new THREE.MeshBasicMaterial({
			color: 0xffffff,
			depthTest: false,
			depthWrite: false,
		});
		this.lineGeo = new THREE.CylinderGeometry(PEN_SIZE, PEN_SIZE, 1, 8, 1);
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
			this.feedbackMaterial
		);
	}

	updateTouchSphere(id: number, vector: THREE.Vector3) {
		if (!(id in this.touchColors)) {
			this.touchColors[id] = getNextColor();
		}
		this.touchSphereMat.color.setHex(this.touchColors[id]);

		let state = this.touchStates.get(id);
		if (!state) {
			const sphereNow = new THREE.Mesh(
				this.touchSphereGeo,
				this.touchSphereMat.clone()
			);
			this.add(sphereNow);
			const spherePrev = new THREE.Mesh(
				this.touchSphereGeo,
				this.touchSphereMat.clone()
			);
			this.add(spherePrev);

			state = { sphereNow, spherePrev, lastPosition: null };
			this.touchStates.set(id, state);
		}

		// Convert pitch/yaw to direction and get new position
		const newPosition = vector.multiplyScalar(5);
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

	/* Rendering */

	override onEnter(renderer: Renderer) {
		console.log("PaintScene loaded");
	}

	override onExit(renderer: Renderer) {
		console.log("PaintScene cleaned up");

		// Remove feedback textures, listeners, etc.
		this.clearLines();
		// this.touchHandler.removeAllListeners?.();
	}

	postRender() {
		this.clearLines();
	}

	override renderScene(renderer: Renderer) {
		const projectionScene = renderer.projectionScene;

		// 1️⃣ Capture cube map
		projectionScene.cubeCamera.position.copy(renderer.centerCamera.position);
		projectionScene.cubeCamera.quaternion.copy(
			renderer.centerCamera.quaternion
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
	}
}
