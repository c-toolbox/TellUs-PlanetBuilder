import * as THREE from "three";
import { FluidSplat, MAX_FLUID_TOUCHES } from "./FluidTouches";
import { DEFAULT_FLUID_OUTPUT, FLUID_DISPLAY_STYLES, FLUID_OUTPUTS, FluidDisplayField, FluidDisplayOption, FluidOutput } from "./FluidDisplay";

import sphere from "./shaders/sphere.glsl?raw";
import fullscreenVertex from "./shaders/fullscreen.vert?raw";
import seedFragment from "./shaders/seed.frag?raw";
import advectFragment from "./shaders/advect.frag?raw";
import derivativesFragment from "./shaders/derivatives.frag?raw";
import forcesFragment from "./shaders/forces.frag?raw";
import pressureFragment from "./shaders/pressure.frag?raw";
import projectFragment from "./shaders/project.frag?raw";
import dyeFragment from "./shaders/dye.frag?raw";
import displayVertex from "./shaders/display.vert?raw";
import displayFragment from "./shaders/display.frag?raw";

export interface FluidSettings {
	touchRadius: number;
	touchForce: number;
	swirl: number;
	dyeDecay: number;
	ambient: boolean;
}

class Field {
	read: THREE.WebGLRenderTarget;
	write: THREE.WebGLRenderTarget;

	constructor(resolution: number) {
		this.read = createTarget(resolution);
		this.write = createTarget(resolution);
	}

	swap() {
		[this.read, this.write] = [this.write, this.read];
	}

	dispose() {
		this.read.dispose();
		this.write.dispose();
	}
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

/** A visual Stable Fluids approximation on the unit sphere, entirely on the GPU. */
export class SphericalFluid {
	readonly surface: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
	private velocity: Field;
	private dye: Field;
	private pressure: Field;
	private advectedVelocity: THREE.WebGLRenderTarget;
	private derivatives: THREE.WebGLRenderTarget;
	private projectedDerivatives: THREE.WebGLRenderTarget;
	private passScene = new THREE.Scene();
	private camera = new THREE.Camera();
	private quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
	private time = 0;
	private output: FluidOutput = DEFAULT_FLUID_OUTPUT;
	private readonly pressureIterations = 28;
	private readonly uniforms = {
		velocity: { value: null as THREE.Texture | null },
		source: { value: null as THREE.Texture | null },
		dye: { value: null as THREE.Texture | null },
		pressure: { value: null as THREE.Texture | null },
		derivatives: { value: null as THREE.Texture | null },
		resolution: { value: 0 },
		velocityResolution: { value: 0 },
		cellSize: { value: 0 },
		dt: { value: 0 },
		time: { value: 0 },
		dissipation: { value: 0 },
		isVelocity: { value: false },
		seedMode: { value: 0 },
		ambient: { value: 1 },
		swirl: { value: 0 },
		touchRadius: { value: 0 },
		touchForce: { value: 0 },
		touchCount: { value: 0 },
		touchDirections: { value: Array.from({ length: MAX_FLUID_TOUCHES }, () => new THREE.Vector4()) },
		touchImpulses: { value: Array.from({ length: MAX_FLUID_TOUCHES }, () => new THREE.Vector3()) },
		touchColors: { value: Array.from({ length: MAX_FLUID_TOUCHES }, () => new THREE.Color()) },
	};
	private materials: Record<"seed" | "advect" | "derivatives" | "forces" | "pressure" | "project" | "dye", THREE.ShaderMaterial>;

	constructor(
		private readonly renderer: THREE.WebGLRenderer,
		private readonly velocityResolution = 96,
		private readonly dyeResolution = 192,
	) {
		if (!renderer.extensions.has("EXT_color_buffer_float") &&
			!renderer.extensions.has("EXT_color_buffer_half_float")) {
			throw new Error("The fluid scene requires renderable half-float textures.");
		}
		this.velocity = new Field(velocityResolution);
		this.dye = new Field(dyeResolution);
		this.pressure = new Field(velocityResolution);
		this.advectedVelocity = createTarget(velocityResolution);
		this.derivatives = createTarget(velocityResolution);
		this.projectedDerivatives = createTarget(velocityResolution);
		this.uniforms.velocityResolution.value = velocityResolution;
		this.uniforms.cellSize.value = Math.PI / (2 * velocityResolution);
		this.uniforms.derivatives.value = this.derivatives.texture;
		this.materials = {
			seed: this.createMaterial("seed", seedFragment),
			advect: this.createMaterial("advect", advectFragment),
			derivatives: this.createMaterial("derivatives", derivativesFragment),
			forces: this.createMaterial("forces", forcesFragment),
			pressure: this.createMaterial("pressure", pressureFragment),
			project: this.createMaterial("project", projectFragment),
			dye: this.createMaterial("dye", dyeFragment),
		};
		this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.materials.seed);
		this.quad.frustumCulled = false;
		this.passScene.add(this.quad);
		this.surface = new THREE.Mesh(
			new THREE.SphereGeometry(10, 64, 48),
			new THREE.ShaderMaterial({
				name: "Spherical fluid display",
				defines: FLUID_DISPLAY_STYLES,
				uniforms: {
					field: { value: this.dye.read.texture },
					reference: { value: this.dye.read.texture },
					velocity: { value: this.velocity.read.texture },
					resolution: { value: dyeResolution },
					velocityResolution: { value: velocityResolution },
					displayStyle: { value: 0 },
					subtractReference: { value: false },
					scale: { value: 1 },
					channel: { value: 0 },
				},
				vertexShader: displayVertex,
				fragmentShader: sphere + displayFragment,
				side: THREE.BackSide,
				depthWrite: false,
				toneMapped: false,
			}),
		);
		this.reset();
	}

	/** Rebind the latest completed step immediately, including while paused. */
	setOutput(output: FluidOutput) {
		this.output = output;
		this.updateDisplay();
	}

	private updateDisplay() {
		const option: FluidDisplayOption = FLUID_OUTPUTS[this.output];
		const fields: Record<FluidDisplayField, THREE.Texture> = {
			dye: this.dye.read.texture,
			advectedDye: this.dye.write.texture,
			advectedVelocity: this.advectedVelocity.texture,
			forcedVelocity: this.velocity.write.texture,
			velocity: this.velocity.read.texture,
			derivatives: this.derivatives.texture,
			projectedDerivatives: this.projectedDerivatives.texture,
			pressure: this.pressure.read.texture,
		};
		const u = this.surface.material.uniforms;
		u.field.value = fields[option.field];
		u.reference.value = fields[option.reference ?? option.field];
		u.velocity.value = this.velocity.read.texture;
		u.resolution.value = option.field === "dye" || option.field === "advectedDye"
			? this.dyeResolution : this.velocityResolution;
		u.displayStyle.value = option.style;
		u.subtractReference.value = option.reference !== undefined &&
			option.style !== FLUID_DISPLAY_STYLES.DISPLAY_SCALAR_COMPARISON;
		u.scale.value = option.scale;
		u.channel.value = option.channel ?? 0;
	}

	private createMaterial(name: string, fragment: string) {
		return new THREE.ShaderMaterial({
			name: `Spherical fluid ${name}`,
			defines: { MAX_TOUCHES: MAX_FLUID_TOUCHES },
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
		this.uniforms.resolution.value = target.width / 3 - 4;
		this.quad.material = material;
		this.renderer.setRenderTarget(target);
		this.renderer.render(this.passScene, this.camera);
	}

	/** Keep offscreen work independent of the cube camera and all three view modes. */
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

	reset(seed = false) {
		this.time = 0;
		this.offscreen(() => {
			this.uniforms.seedMode.value = seed ? 1 : 0;
			for (const target of [this.velocity.read, this.velocity.write, this.advectedVelocity]) {
				this.pass(this.materials.seed, target);
			}
			this.uniforms.seedMode.value = seed ? 2 : 0;
			for (const target of [this.dye.read, this.dye.write]) {
				this.pass(this.materials.seed, target);
			}
			this.uniforms.seedMode.value = 0;
			for (const target of [this.pressure.read, this.pressure.write]) {
				this.pass(this.materials.seed, target);
			}
			this.uniforms.velocity.value = this.velocity.read.texture;
			for (const target of [this.derivatives, this.projectedDerivatives]) {
				this.pass(this.materials.derivatives, target);
			}
		});
		this.updateDisplay();
	}

	step(dt: number, splats: readonly FluidSplat[], settings: FluidSettings) {
		if (!Number.isFinite(dt) || dt <= 0) return;
		// The scene subdivides frames; this also protects direct callers after a pause.
		dt = Math.min(dt, 1 / 60);
		this.time += dt;
		const u = this.uniforms;
		u.dt.value = dt;
		u.time.value = this.time;
		u.ambient.value = settings.ambient ? 1 : 0;
		u.swirl.value = settings.swirl;
		u.touchRadius.value = settings.touchRadius;
		u.touchForce.value = settings.touchForce;
		u.touchCount.value = Math.min(splats.length, MAX_FLUID_TOUCHES);
		for (let i = 0; i < u.touchCount.value; i++) {
			const splat = splats[i];
			u.touchDirections.value[i].set(splat.direction.x, splat.direction.y, splat.direction.z, splat.dyeAmount);
			u.touchImpulses.value[i].copy(splat.impulse);
			u.touchColors.value[i].copy(splat.color);
		}

		this.offscreen(() => {
			// Carry momentum along the sphere, then add touch impulses and fine swirls.
			u.velocity.value = this.velocity.read.texture;
			u.source.value = this.velocity.read.texture;
			u.isVelocity.value = true;
			u.dissipation.value = 0.12;
			// Preserve this stage for inspection; the ping-pong pair ends the step
			// holding the forced velocity in write and projected velocity in read.
			this.pass(this.materials.advect, this.advectedVelocity);
			u.velocity.value = this.advectedVelocity.texture;
			this.pass(this.materials.derivatives, this.derivatives);
			this.pass(this.materials.forces, this.velocity.write);
			this.velocity.swap();

			// Solve Laplace-Beltrami(p) = div(v). p is the pressure impulse
			// (physical pressure multiplied by dt), hence no further dt in projection.
			u.velocity.value = this.velocity.read.texture;
			this.pass(this.materials.derivatives, this.derivatives);
			u.seedMode.value = 0;
			this.pass(this.materials.seed, this.pressure.read);
			for (let i = 0; i < this.pressureIterations; i++) {
				u.pressure.value = this.pressure.read.texture;
				this.pass(this.materials.pressure, this.pressure.write);
				this.pressure.swap();
			}
			u.pressure.value = this.pressure.read.texture;
			this.pass(this.materials.project, this.velocity.write);
			this.velocity.swap();

			// Transport colour at twice the velocity field resolution.
			u.velocity.value = this.velocity.read.texture;
			// Keep the pressure solve's input derivatives intact for comparison.
			this.pass(this.materials.derivatives, this.projectedDerivatives);
			u.source.value = this.dye.read.texture;
			u.isVelocity.value = false;
			u.dissipation.value = settings.dyeDecay;
			this.pass(this.materials.advect, this.dye.write);
			this.dye.swap();
			u.dye.value = this.dye.read.texture;
			this.pass(this.materials.dye, this.dye.write);
			this.dye.swap();
		});
		this.updateDisplay();
	}

	dispose() {
		this.velocity.dispose();
		this.dye.dispose();
		this.pressure.dispose();
		this.advectedVelocity.dispose();
		this.derivatives.dispose();
		this.projectedDerivatives.dispose();
		Object.values(this.materials).forEach((material) => material.dispose());
		this.quad.geometry.dispose();
		this.surface.geometry.dispose();
		this.surface.material.dispose();
	}
}
