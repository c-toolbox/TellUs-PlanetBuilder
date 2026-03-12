import * as THREE from "three";
import BaseScene from "./BaseScene";
import { TouchId } from "@/network/tuioProtocol";
import { Renderer } from "./Renderer";

// ------------------------------
// Simple fluid simulation shaders
// ------------------------------

const passVertex = `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// advect pass
const advectFragment = `
precision highp float;
uniform sampler2D field;
uniform sampler2D velocity;
uniform float dt;
uniform float dissipation;
varying vec2 vUv;

void main() {
	vec2 texSize = vec2(textureSize(field, 0));
	vec2 vel = texture2D(velocity, vUv).xy;
	vec2 coord = vUv - dt * vel / texSize;
	coord = mod(coord, 1.0);
	vec4 result = texture2D(field, coord) * dissipation;
	gl_FragColor = result;
}
`;

// splat pass
const splatFragment = `
precision highp float;
uniform sampler2D target;
uniform vec2 point;
uniform vec4 value;
uniform float radius;
varying vec2 vUv;

void main() {
	vec4 base = texture2D(target, vUv);
    float d = distance(vUv, point);
    float influence = exp(-d * d / (radius * radius));  // square radius falloff
    vec4 added = value * influence;
    gl_FragColor = base + added;
}
`;

// buoyancy pass
const buoyancyFragment = `
precision highp float;
uniform sampler2D velocity;
uniform sampler2D density;
uniform float alpha;
uniform float dt;
varying vec2 vUv;

void main() {
	vec2 vel = texture2D(velocity, vUv).xy;
	float dens = texture2D(density, vUv).r;
	vel.y += alpha * dens * dt;
	gl_FragColor = vec4(vel, 0.0, 1.0);
}
`;

// display smoke
const displayFragment = `
precision highp float;
uniform sampler2D density;
varying vec2 vUv;

void main() {
	float d = texture2D(density, vUv).r;
	vec3 col = vec3(d * 0.9, d * 0.95, d);
	gl_FragColor = vec4(col, 1.0);
}
`;

// ------------------------------
// Types and class
// ------------------------------

interface TouchState {
	sphereNow: THREE.Mesh;
	spherePrev: THREE.Mesh;
	lastPosition: THREE.Vector3 | null;
	position: THREE.Vector3;
	velocity: THREE.Vector3;
	uv: THREE.Vector2;
}

export default class DistortionScene extends BaseScene {
	private touchStates: Map<number, TouchState>;
	private touchSphereGeo: THREE.SphereGeometry;
	private touchSphereMat: THREE.MeshBasicMaterial;
	private lineGeo: THREE.CylinderGeometry;
	private lineMeshes: THREE.Mesh[] = [];

	// fluid sim
	private velocityA: THREE.WebGLRenderTarget;
	private velocityB: THREE.WebGLRenderTarget;
	private densityA: THREE.WebGLRenderTarget;
	private densityB: THREE.WebGLRenderTarget;
	private advectMat: THREE.ShaderMaterial;
	private splatMat: THREE.ShaderMaterial;
	private buoyancyMat: THREE.ShaderMaterial;
	private displayMat: THREE.ShaderMaterial;
	private quad: THREE.Mesh;
	private simRes = 512;
	private dt = 0.016;
	private splatRadius = 0.02;
	private dissipation = 0.995;
	private velocityDissipation = 0.99;
	private buoyancyAlpha = 0.6;

	constructor() {
		super();
		this.init();

		this.touchHandler.on("touch", (touchId: TouchId, vector: THREE.Vector3) => {
			this.updateTouchSphere(touchId, vector);
		});
		this.touchHandler.on("remove", (touchId: TouchId) => {
			this.removeTouchSphere(touchId);
		});
	}

	public setRendererSettings(renderer: Renderer): void {
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.NoToneMapping;
		renderer.autoClear = true;
	}

	private init() {
		this.touchStates = new Map();
		const penWidth = 1 / 100;
		this.touchSphereGeo = new THREE.SphereGeometry(penWidth, 12, 10);
		this.touchSphereMat = new THREE.MeshBasicMaterial({
			depthTest: false,
			depthWrite: false,
		});
		this.lineGeo = new THREE.CylinderGeometry(penWidth, penWidth, 1, 8, 1);
		this.lineGeo.rotateX(Math.PI / 2);

		// Fluid render targets
		const opts: THREE.RenderTargetOptions = {
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			depthBuffer: false,
			stencilBuffer: false,
		};
		this.velocityA = new THREE.WebGLRenderTarget(
			this.simRes,
			this.simRes,
			opts
		);
		this.velocityB = new THREE.WebGLRenderTarget(
			this.simRes,
			this.simRes,
			opts
		);
		this.densityA = new THREE.WebGLRenderTarget(this.simRes, this.simRes, opts);
		this.densityB = new THREE.WebGLRenderTarget(this.simRes, this.simRes, opts);

		this.advectMat = new THREE.ShaderMaterial({
			uniforms: {
				field: { value: null },
				velocity: { value: null },
				dt: { value: this.dt },
				dissipation: { value: this.dissipation },
			},
			vertexShader: passVertex,
			fragmentShader: advectFragment,
		});

		this.splatMat = new THREE.ShaderMaterial({
			uniforms: {
				target: { value: null },
				point: { value: new THREE.Vector2(0.5, 0.5) },
				value: { value: new THREE.Vector4(1, 1, 1, 1) },
				radius: { value: this.splatRadius },
			},
			vertexShader: passVertex,
			fragmentShader: splatFragment,
			transparent: true,
		});

		this.buoyancyMat = new THREE.ShaderMaterial({
			uniforms: {
				velocity: { value: null },
				density: { value: null },
				alpha: { value: this.buoyancyAlpha },
				dt: { value: this.dt },
			},
			vertexShader: passVertex,
			fragmentShader: buoyancyFragment,
		});

		this.displayMat = new THREE.ShaderMaterial({
			uniforms: { density: { value: this.densityA.texture } },
			vertexShader: passVertex,
			fragmentShader: displayFragment,
		});

		this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.advectMat);
	}

	private posToUV(pos: THREE.Vector3): THREE.Vector2 {
		const u = 0.5 + Math.atan2(pos.z, pos.x) / (2 * Math.PI);
		const v = 0.5 - Math.asin(pos.y) / Math.PI;
		return new THREE.Vector2(u, v);
	}

	private updateTouchSphere(id: number, vec: THREE.Vector3) {
		const pos = vec.clone().normalize();
		const color = new THREE.Color(
			pos.x * 0.5 + 0.5,
			pos.y * 0.5 + 0.5,
			pos.z * 0.5 + 0.5
		);
		let state = this.touchStates.get(id);

		if (!state) {
			const now = new THREE.Mesh(
				this.touchSphereGeo,
				this.touchSphereMat.clone()
			);
			const prev = new THREE.Mesh(
				this.touchSphereGeo,
				this.touchSphereMat.clone()
			);
			this.add(now);
			this.add(prev);
			state = {
				sphereNow: now,
				spherePrev: prev,
				lastPosition: null,
				position: pos.clone(),
				velocity: new THREE.Vector3(),
				uv: this.posToUV(pos),
			};
			this.touchStates.set(id, state);
		}
		(state.sphereNow.material as THREE.MeshBasicMaterial).color.copy(color);
		(state.spherePrev.material as THREE.MeshBasicMaterial).color.copy(color);

		const newPos = vec.clone().multiplyScalar(5);
		if (state.lastPosition) {
			state.velocity.copy(newPos.clone().sub(state.lastPosition));
			const line = this.createLine(state.lastPosition, newPos);
			this.add(line);
			this.lineMeshes.push(line);
			state.spherePrev.position.copy(state.lastPosition);
		}
		state.sphereNow.position.copy(newPos);
		state.lastPosition = newPos.clone();
		state.position.copy(pos);
		state.uv.copy(this.posToUV(pos));
	}

	private removeTouchSphere(id: number) {
		const s = this.touchStates.get(id);
		if (s) {
			this.remove(s.sphereNow);
			this.remove(s.spherePrev);
			this.touchStates.delete(id);
		}
	}

	private clearLines() {
		this.lineMeshes.forEach((l) => this.remove(l));
		this.lineMeshes.length = 0;
	}

	private createLine(a: THREE.Vector3, b: THREE.Vector3) {
		const line = new THREE.Mesh(this.lineGeo, this.touchSphereMat.clone());
		const dir = b.clone().sub(a);
		const len = dir.length();
		line.position.copy(a).add(b).multiplyScalar(0.5);
		line.lookAt(b);
		line.scale.set(1, 1, len);
		return line;
	}

	private runPass(
		renderer: Renderer,
		mat: THREE.ShaderMaterial,
		out: THREE.WebGLRenderTarget
	) {
		this.quad.material = mat;
		renderer.setRenderTarget(out);
		renderer.render(this.quad, renderer.projectionScene.screenCamera);
	}

	private splatTouches(renderer: Renderer) {
		this.touchStates.forEach((state) => {
			this.splatMat.uniforms.target.value = this.velocityA.texture;
			this.splatMat.uniforms.point.value = state.uv;
			this.splatMat.uniforms.value.value = new THREE.Vector4(
				state.velocity.x,
				state.velocity.y,
				0,
				1
			);
			this.runPass(renderer, this.splatMat, this.velocityB);
			[this.velocityA, this.velocityB] = [this.velocityB, this.velocityA];

			this.splatMat.uniforms.target.value = this.densityA.texture;
			this.splatMat.uniforms.value.value = new THREE.Vector4(1, 1, 1, 1);
			this.runPass(renderer, this.splatMat, this.densityB);
			[this.densityA, this.densityB] = [this.densityB, this.densityA];
		});
	}

	private advect(renderer: Renderer) {
		this.advectMat.uniforms.field.value = this.velocityA.texture;
		this.advectMat.uniforms.velocity.value = this.velocityA.texture;
		this.advectMat.uniforms.dissipation.value = this.velocityDissipation;
		this.runPass(renderer, this.advectMat, this.velocityB);
		[this.velocityA, this.velocityB] = [this.velocityB, this.velocityA];

		this.advectMat.uniforms.field.value = this.densityA.texture;
		this.advectMat.uniforms.velocity.value = this.velocityA.texture;
		this.advectMat.uniforms.dissipation.value = this.dissipation;
		this.runPass(renderer, this.advectMat, this.densityB);
		[this.densityA, this.densityB] = [this.densityB, this.densityA];
	}

	private buoyancy(renderer: Renderer) {
		this.buoyancyMat.uniforms.velocity.value = this.velocityA.texture;
		this.buoyancyMat.uniforms.density.value = this.densityA.texture;
		this.runPass(renderer, this.buoyancyMat, this.velocityB);
		[this.velocityA, this.velocityB] = [this.velocityB, this.velocityA];
	}

	override renderScene(renderer: Renderer) {
		// Run fluid sim
		this.splatTouches(renderer);
		this.advect(renderer);
		this.buoyancy(renderer);

		// Display smoke
		this.displayMat.uniforms.density.value = this.densityA.texture;
		this.quad.material = this.displayMat;
		renderer.setRenderTarget(null);
		renderer.render(this.quad, renderer.projectionScene.screenCamera);

		// 🧪 DEBUG: visualize velocity
		renderer.setRenderTarget(null);
		this.displayMat.uniforms.density.value = this.velocityA.texture;
		renderer.render(this.quad, renderer.projectionScene.screenCamera);
		return;
	}

	postRender() {
		this.clearLines();
	}
}
