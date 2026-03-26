import * as THREE from "three";
import BaseScene from "./BaseScene";
import { TouchId } from "@/network/tuioProtocol";
import { Renderer } from "./Renderer";
import { getRainbowColor } from "@/utils/functions";
import { UiConfigEvent } from "@/network/uiProtocol";

import vertexShader from "@/shaders/basic.vert?raw";

const fragmentShader = `
precision highp float;

uniform sampler2D textureNew; // current drawing / input
uniform sampler2D textureOld; // previous RD state (A in R, B in G)
uniform float blur;           // kept for compatibility (not used directly)
uniform vec2 texelSize;       // 1.0 / resolution (e.g. vec2(1.0/res,1.0/res))

// Reaction-diffusion parameters (tweak from JS)
uniform float Da;    // diffusion rate for A
uniform float Db;    // diffusion rate for B
uniform float feed;  // feed rate (f)
uniform float kill;  // kill rate (k)
uniform float dt;    // timestep
uniform float inject;   // strength to inject textureNew into B
uniform float sharpen;  // unsharp mask amount
uniform float blurRadius; // blur kernel radius (in texels)

varying vec2 vUv;

// simple 3x3 Laplacian weights
vec2 laplacian(vec2 uv) {
    // sample center + 8 neighbors
	vec4 c = texture2D(textureOld, uv);
	float centerA = c.r;
	float centerB = c.g;

    // neighbors
	float nA = texture2D(textureOld, uv + vec2(0.0, texelSize.y)).r;
	float sA = texture2D(textureOld, uv - vec2(0.0, texelSize.y)).r;
	float eA = texture2D(textureOld, uv + vec2(texelSize.x, 0.0)).r;
	float wA = texture2D(textureOld, uv - vec2(texelSize.x, 0.0)).r;

	float neA = texture2D(textureOld, uv + vec2(texelSize.x, texelSize.y)).r;
	float nwA = texture2D(textureOld, uv + vec2(-texelSize.x, texelSize.y)).r;
	float seA = texture2D(textureOld, uv + vec2(texelSize.x, -texelSize.y)).r;
	float swA = texture2D(textureOld, uv + vec2(-texelSize.x, -texelSize.y)).r;

	float nB = texture2D(textureOld, uv + vec2(0.0, texelSize.y)).g;
	float sB = texture2D(textureOld, uv - vec2(0.0, texelSize.y)).g;
	float eB = texture2D(textureOld, uv + vec2(texelSize.x, 0.0)).g;
	float wB = texture2D(textureOld, uv - vec2(texelSize.x, 0.0)).g;

	float neB = texture2D(textureOld, uv + vec2(texelSize.x, texelSize.y)).g;
	float nwB = texture2D(textureOld, uv + vec2(-texelSize.x, texelSize.y)).g;
	float seB = texture2D(textureOld, uv + vec2(texelSize.x, -texelSize.y)).g;
	float swB = texture2D(textureOld, uv + vec2(-texelSize.x, -texelSize.y)).g;

    // weights matching common Gray-Scott examples
	float lapA = -1.0 * centerA + 0.2 * (nA + sA + eA + wA) + 0.05 * (neA + nwA + seA + swA);

	float lapB = -1.0 * texture2D(textureOld, uv).g + 0.2 * (nB + sB + eB + wB) + 0.05 * (neB + nwB + seB + swB);

	return vec2(lapA, lapB);
}

// small box blur for unsharp mask (averages center + 4 neighbors at radius)
vec3 smallBlur(vec2 uv, float radius) {
	vec2 r = texelSize * radius;
	vec3 c = texture2D(textureOld, uv).rgb;
	vec3 n = texture2D(textureOld, uv + vec2(0.0, r.y)).rgb;
	vec3 s = texture2D(textureOld, uv - vec2(0.0, r.y)).rgb;
	vec3 e = texture2D(textureOld, uv + vec2(r.x, 0.0)).rgb;
	vec3 w = texture2D(textureOld, uv - vec2(r.x, 0.0)).rgb;
	return (c + n + s + e + w) * 0.2;
}

void main() {
    // read previous A and B
	vec4 state = texture2D(textureOld, vUv);
	float A = state.r;
	float B = state.g;

    // compute laplacian
	vec2 lap = laplacian(vUv);

    // Gray-Scott update
	float reaction = A * B * B;
	float dA = Da * lap.x - reaction + feed * (1.0 - A);
	float dB = Db * lap.y + reaction - (kill + feed) * B;

	float A_new = clamp(A + dA * dt, 0.0, 1.0);
	float B_new = clamp(B + dB * dt, 0.0, 1.0);

    // inject drawing input into B channel (draw adds B)
	vec4 inputCol = texture2D(textureNew, vUv);
    // use luminance of drawing and optionally alpha for injection
	float drawLuma = dot(inputCol.rgb, vec3(0.299, 0.587, 0.114));
	B_new = clamp(B_new + drawLuma * inject, 0.0, 1.0);

    // Build a visually pleasing color from A/B for display (but keep A/B in R/G)
    // Example mapping: more B -> brighter / colorful
	float displayHue = B_new - A_new * 0.5;
	vec3 displayColor = vec3(clamp(B_new * 1.2, 0.0, 1.0), clamp(A_new * 0.6 + B_new * 0.3, 0.0, 1.0), clamp(1.0 - A_new * 0.8, 0.0, 1.0));

    // Unsharp masking: blur the old display (approx), then sharpen displayColor
	vec3 oldRGB = texture2D(textureOld, vUv).rgb;
	vec3 blurRGB = smallBlur(vUv, max(1.0, blurRadius));
	vec3 sharpened = displayColor + sharpen * (displayColor - blurRGB);

    // Compose final visual that will be visible on screen:
	vec3 finalVis = clamp(sharpened, 0.0, 1.0);

    // IMPORTANT: store A_new in R, B_new in G so the feedback loop keeps the RD state.
    // Put a visually related value into B channel (we put finalVis.b into B for slight visual continuity in 3rd channel).
	gl_FragColor = vec4(A_new, B_new, finalVis.b, 1.0);
}
`;

interface TouchState {
	sphereNow: THREE.Mesh;
	spherePrev: THREE.Mesh;
	lastPosition: THREE.Vector3 | null;
}

export default class ReactionDiffusionScene extends BaseScene {
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

		[
			[1, 0, 0],
			[-1, 0, 0],
			[0, 1, 0],
			[0, -1, 0],
			[0, 0, 1],
			[0, 0, -1],
		].forEach((position) =>
			this.addText({
				text: "·",
				color: getRainbowColor(),
				size: 1.0,
				position: new THREE.Vector3(...position),
			}),
		);

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
		const penWidth = 1.0;

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
				blur: { value: 0.0015 }, // kept for compatibility
				texelSize: { value: new THREE.Vector2(1 / res, 1 / res) },

				// RD params (tweak)
				Da: { value: 0.2 }, // diffusion A
				Db: { value: 0.1 }, // diffusion B
				feed: { value: 0.05 }, // f (try 0.02..0.06)
				kill: { value: 0.062 }, // k (try 0.045..0.07)
				dt: { value: 1.0 },

				// injection & visual params
				inject: { value: 0.6 },
				sharpen: { value: 0.8 },
				blurRadius: { value: 1.0 },
			},
			vertexShader,
			fragmentShader,
			depthTest: false,
			depthWrite: false,
			transparent: true,
		});

		const feedbackUniforms = this.feedbackMaterial.uniforms;

		// const rdFolder = gui.addFolder("Reaction Diffusion");
		// rdFolder.add(feedbackUniforms.Da, "value", 0.1, 5.0, 0.01).name("Da");
		// rdFolder.add(feedbackUniforms.Db, "value", 0.1, 5.0, 0.01).name("Db");
		// rdFolder
		// 	.add(feedbackUniforms.feed, "value", 0.01, 1.0, 0.001)
		// 	.name("Feed");
		// rdFolder
		// 	.add(feedbackUniforms.kill, "value", 0.03, 1.0, 0.001)
		// 	.name("Kill");
		// rdFolder.add(feedbackUniforms.dt, "value", 0.1, 2.0, 0.1).name("Δt");
		// rdFolder
		// 	.add(feedbackUniforms.inject, "value", 0.0, 2.0, 0.01)
		// 	.name("Inject Strength");
		// rdFolder.open();

		// const visFolder = gui.addFolder("Visual");
		// visFolder
		// 	.add(feedbackUniforms.sharpen, "value", 0.0, 2.0, 0.01)
		// 	.name("Sharpen");
		// visFolder
		// 	.add(feedbackUniforms.blurRadius, "value", 0.0, 10.0, 0.1)
		// 	.name("Blur Radius");
		// visFolder.open();

		this.feedbackQuad = new THREE.Mesh(
			new THREE.PlaneGeometry(2, 2),
			this.feedbackMaterial,
		);
	}

	updateTouchSphere(id: number, vector: THREE.Vector3) {
		if (!(id in this.touchColors)) {
			this.touchColors[id] = getRainbowColor();
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

	override onExit(renderer: Renderer) {
		super.onExit(renderer);

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
	}

	get uiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Reaction Diffusion",
			elements: [],
		};
	}
}
