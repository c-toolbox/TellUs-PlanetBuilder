import * as THREE from "three";
import { MAX_REACTION_TOUCHES, ReactionStroke } from "./ReactionTouches";
// Reuse the fluid experiment's atlas and unit-sphere geometry without changing its solver.
import sphere from "../fluid/shaders/sphere.glsl?raw";
import fullscreenVertex from "../fluid/shaders/fullscreen.vert?raw";
import displayVertex from "../fluid/shaders/display.vert?raw";
import seedFragment from "./shaders/seed.frag?raw";
import reactionFragment from "./shaders/reaction.frag?raw";
import displayFragment from "./shaders/display.frag?raw";

export interface ReactionSettings {
	feed: number;
	kill: number;
	diffusionU: number;
	diffusionV: number;
	speed: number;
	touchRadius: number;
	touchStrength: number;
	erase: boolean;
	hue: number;
	contrast: number;
}

function createTarget(resolution: number) {
	return new THREE.WebGLRenderTarget(3 * (resolution + 4), 2 * (resolution + 4), {
		type: THREE.HalfFloatType,
		format: THREE.RGBAFormat,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		depthBuffer: false,
		stencilBuffer: false,
		generateMipmaps: false,
	});
}

/** Gray–Scott chemistry with an interpolated geodesic Laplace–Beltrami stencil. */
export class SphericalReactionDiffusion {
	readonly surface: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
	private read: THREE.WebGLRenderTarget;
	private write: THREE.WebGLRenderTarget;
	private passScene = new THREE.Scene();
	private camera = new THREE.Camera();
	private quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
	private seedMaterial: THREE.ShaderMaterial;
	private reactionMaterial: THREE.ShaderMaterial;
	private uniforms = {
		state: { value: null as THREE.Texture | null },
		resolution: { value: 0 },
		cellSize: { value: 0 },
		dt: { value: 0 },
		feed: { value: 0 },
		kill: { value: 0 },
		diffusion: { value: new THREE.Vector2() },
		seed: { value: 0 },
		seeded: { value: true },
		touchRadius: { value: 0 },
		touchStrength: { value: 0 },
		erase: { value: false },
		touchCount: { value: 0 },
		touchStarts: { value: Array.from({ length: MAX_REACTION_TOUCHES }, () => new THREE.Vector4()) },
		touchEnds: { value: Array.from({ length: MAX_REACTION_TOUCHES }, () => new THREE.Vector3()) },
	};

	constructor(private readonly renderer: THREE.WebGLRenderer, private readonly resolution = 128) {
		if (!renderer.extensions.has("EXT_color_buffer_float") && !renderer.extensions.has("EXT_color_buffer_half_float")) {
			throw new Error("Reaction diffusion requires renderable half-float textures.");
		}
		this.read = createTarget(resolution);
		this.write = createTarget(resolution);
		this.uniforms.resolution.value = resolution;
		this.uniforms.cellSize.value = Math.PI / (2 * resolution);
		this.seedMaterial = this.createMaterial("seed", seedFragment);
		this.reactionMaterial = this.createMaterial("step", reactionFragment);
		this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.seedMaterial);
		this.quad.frustumCulled = false;
		this.passScene.add(this.quad);
		this.surface = new THREE.Mesh(
			new THREE.SphereGeometry(10, 64, 48),
			new THREE.ShaderMaterial({
				name: "Spherical reaction diffusion display",
				uniforms: { state: { value: this.read.texture }, resolution: { value: resolution }, hue: { value: 0.52 }, contrast: { value: 1.2 } },
				vertexShader: displayVertex,
				fragmentShader: sphere + displayFragment,
				side: THREE.BackSide,
				depthWrite: false,
				toneMapped: false,
			}),
		);
		this.reset();
	}

	private createMaterial(name: string, fragment: string) {
		return new THREE.ShaderMaterial({
			name: `Spherical reaction diffusion ${name}`,
			defines: { MAX_TOUCHES: MAX_REACTION_TOUCHES },
			uniforms: this.uniforms,
			vertexShader: fullscreenVertex,
			fragmentShader: sphere + fragment,
			depthTest: false,
			depthWrite: false,
			blending: THREE.NoBlending,
			toneMapped: false,
		});
	}

	private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) {
		this.quad.material = material;
		this.renderer.setRenderTarget(target);
		this.renderer.setScissorTest(false);
		this.renderer.render(this.passScene, this.camera);
	}

	private offscreen(work: () => void) {
		const renderer = this.renderer;
		const target = renderer.getRenderTarget();
		const face = renderer.getActiveCubeFace();
		const mip = renderer.getActiveMipmapLevel();
		const viewport = renderer.getViewport(new THREE.Vector4());
		const scissor = renderer.getScissor(new THREE.Vector4());
		const scissorTest = renderer.getScissorTest();
		const autoClear = renderer.autoClear;
		const xr = renderer.xr.enabled;
		try {
			renderer.autoClear = false;
			renderer.xr.enabled = false;
			work();
		} finally {
			renderer.setRenderTarget(target, face, mip);
			renderer.setViewport(viewport);
			renderer.setScissor(scissor);
			renderer.setScissorTest(scissorTest);
			renderer.autoClear = autoClear;
			renderer.xr.enabled = xr;
		}
	}

	reset(seeded = true) {
		this.uniforms.seeded.value = seeded;
		this.uniforms.seed.value = Math.random() * 100;
		this.offscreen(() => {
			this.pass(this.seedMaterial, this.read);
			this.pass(this.seedMaterial, this.write);
		});
		this.surface.material.uniforms.state.value = this.read.texture;
	}

	setAppearance(settings: Pick<ReactionSettings, "hue" | "contrast">) {
		this.surface.material.uniforms.hue.value = settings.hue;
		this.surface.material.uniforms.contrast.value = settings.contrast;
	}

	step(realDt: number, strokes: readonly ReactionStroke[], settings: ReactionSettings) {
		if (!Number.isFinite(realDt) || realDt <= 0) return;
		realDt = Math.min(realDt, 1 / 60);
		// Conservative positivity bound for [0,1] concentrations and a stencil
		// with centre weight -4. Speed increases pass count, never the Euler dt.
		const maxDt = Math.min(0.8, 0.9 / (4 * Math.max(settings.diffusionU, settings.diffusionV) + 1 + settings.feed + settings.kill));
		const duration = realDt * settings.speed;
		const steps = Math.max(1, Math.ceil(duration / maxDt));
		const u = this.uniforms;
		u.dt.value = duration / steps;
		u.feed.value = settings.feed;
		u.kill.value = settings.kill;
		u.diffusion.value.set(settings.diffusionU, settings.diffusionV);
		u.touchRadius.value = settings.touchRadius;
		u.touchStrength.value = settings.touchStrength;
		u.erase.value = settings.erase;
		u.touchCount.value = Math.min(strokes.length, MAX_REACTION_TOUCHES);
		for (let i = 0; i < u.touchCount.value; i++) {
			const stroke = strokes[i];
			// Split real-time brush exposure across all chemical substeps.
			u.touchStarts.value[i].set(stroke.start.x, stroke.start.y, stroke.start.z, stroke.exposure / steps);
			u.touchEnds.value[i].copy(stroke.end);
		}
		this.offscreen(() => {
			for (let i = 0; i < steps; i++) {
				u.state.value = this.read.texture;
				this.pass(this.reactionMaterial, this.write);
				[this.read, this.write] = [this.write, this.read];
			}
		});
		this.surface.material.uniforms.state.value = this.read.texture;
		this.setAppearance(settings);
	}

	dispose() {
		this.read.dispose();
		this.write.dispose();
		this.seedMaterial.dispose();
		this.reactionMaterial.dispose();
		this.quad.geometry.dispose();
		this.surface.geometry.dispose();
		this.surface.material.dispose();
	}
}
