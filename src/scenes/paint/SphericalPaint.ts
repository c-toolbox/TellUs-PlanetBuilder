import * as THREE from "three";
import vertexShader from "./shaders/sphere.vert?raw";
import copyVertex from "./shaders/copy.vert?raw";
import copyFragment from "./shaders/copy.frag?raw";
import feedbackFragment from "./shaders/feedback.frag?raw";
import displayFragment from "./shaders/display.frag?raw";

const BLUR_RADIUS = 2 / 512;

/** Keep paint in world-space directions, independently of the output camera. */
export class SphericalPaint {
	readonly surface: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
	private read: THREE.WebGLCubeRenderTarget;
	private write: THREE.WebGLCubeRenderTarget;
	private readonly input: THREE.WebGLCubeRenderTarget;
	private readonly strokeTarget: THREE.WebGLRenderTarget;
	private readonly inputCamera: THREE.CubeCamera;
	private readonly copyScene = new THREE.Scene();
	private readonly copyCamera = new THREE.Camera();
	private readonly copyQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
	private readonly feedbackCamera: THREE.CubeCamera;
	private readonly feedbackScene = new THREE.Scene();
	private readonly feedbackMaterial: THREE.ShaderMaterial;
	private readonly byteFeedback: boolean;

	constructor(private readonly renderer: THREE.WebGLRenderer, resolution = 1024) {
		const halfFloat = renderer.extensions.has("EXT_color_buffer_float") ||
			renderer.extensions.has("EXT_color_buffer_half_float");
		this.byteFeedback = !halfFloat;
		const options = {
			type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			depthBuffer: false,
			stencilBuffer: false,
			generateMipmaps: false,
		};
		this.read = new THREE.WebGLCubeRenderTarget(resolution, options);
		this.write = new THREE.WebGLCubeRenderTarget(resolution, options);
		this.input = new THREE.WebGLCubeRenderTarget(resolution, {
			...options,
			type: THREE.UnsignedByteType,
		});
		// Cube render targets cannot use MSAA in Three.js. Resolve each face in a
		// multisampled 2D target, then copy its color and coverage into the cube.
		this.strokeTarget = new THREE.WebGLRenderTarget(resolution, resolution, {
			...options,
			type: THREE.UnsignedByteType,
			samples: 4,
		});
		this.inputCamera = new THREE.CubeCamera(0.01, 10, this.input);
		this.inputCamera.coordinateSystem = renderer.coordinateSystem;
		this.inputCamera.updateCoordinateSystem();
		this.inputCamera.updateMatrixWorld(true);
		this.copyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
			name: "Paint stroke copy",
			uniforms: { stroke: { value: this.strokeTarget.texture } },
			vertexShader: copyVertex,
			fragmentShader: copyFragment,
			depthTest: false,
			depthWrite: false,
			blending: THREE.NoBlending,
			toneMapped: false,
		}));
		this.copyQuad.frustumCulled = false;
		this.copyScene.add(this.copyQuad);
		this.feedbackCamera = new THREE.CubeCamera(0.01, 10, this.write);
		this.feedbackMaterial = new THREE.ShaderMaterial({
			name: "Paint feedback",
			uniforms: {
				textureOld: { value: this.read.texture },
				textureNew: { value: this.input.texture },
				hasInput: { value: false },
				blurRadius: { value: 0 },
				fade: { value: 1 },
				fadeFloor: { value: 0 },
			},
			vertexShader,
			fragmentShader: feedbackFragment,
			side: THREE.BackSide,
			depthTest: false,
			depthWrite: false,
			blending: THREE.NoBlending,
			toneMapped: false,
		});
		const geometry = new THREE.SphereGeometry(5, 64, 48);
		this.feedbackScene.add(new THREE.Mesh(geometry, this.feedbackMaterial));
		this.surface = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
			name: "Paint display",
			uniforms: { painting: { value: this.read.texture } },
			vertexShader,
			fragmentShader: displayFragment,
			side: THREE.DoubleSide,
			blending: THREE.NoBlending,
			toneMapped: false,
		}));
		this.clear();
	}

	private offscreen(work: () => void) {
		const renderer = this.renderer;
		const target = renderer.getRenderTarget();
		const face = renderer.getActiveCubeFace();
		const mip = renderer.getActiveMipmapLevel();
		const viewport = renderer.getViewport(new THREE.Vector4());
		const scissor = renderer.getScissor(new THREE.Vector4());
		const scissorTest = renderer.getScissorTest();
		const clearColor = renderer.getClearColor(new THREE.Color());
		const clearAlpha = renderer.getClearAlpha();
		const autoClear = renderer.autoClear;
		const xr = renderer.xr.enabled;
		try {
			renderer.autoClear = false;
			renderer.xr.enabled = false;
			renderer.setScissorTest(false);
			work();
		} finally {
			renderer.setRenderTarget(target, face, mip);
			renderer.setViewport(viewport);
			renderer.setScissor(scissor);
			renderer.setScissorTest(scissorTest);
			renderer.setClearColor(clearColor, clearAlpha);
			renderer.autoClear = autoClear;
			renderer.xr.enabled = xr;
		}
	}

	clear() {
		this.offscreen(() => {
			this.renderer.setClearColor(0x000000, 1);
			this.read.clear(this.renderer, true, false, false);
			this.write.clear(this.renderer, true, false, false);
			this.renderer.setClearColor(0x000000, 0);
			this.input.clear(this.renderer, true, false, false);
		});
	}

	private captureStrokes(strokes: THREE.Scene) {
		const renderer = this.renderer;
		renderer.setClearColor(0x000000, 0);
		for (let face = 0; face < 6; face++) {
			renderer.setRenderTarget(this.strokeTarget);
			renderer.clear(true, false, false);
			renderer.render(strokes, this.inputCamera.children[face] as THREE.PerspectiveCamera);
			renderer.setRenderTarget(this.input, face);
			renderer.render(this.copyScene, this.copyCamera);
		}
	}

	step(strokes: THREE.Scene, blur: boolean, delta: number) {
		const hasInput = strokes.children.length > 0;
		if (!hasInput && !blur) return;
		const frames = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta * 60, 0, 2) : 0;
		const uniforms = this.feedbackMaterial.uniforms;
		uniforms.textureOld.value = this.read.texture;
		uniforms.hasInput.value = hasInput;
		// Keep the blur's angular spread independent of the paint resolution.
		uniforms.blurRadius.value = blur ? BLUR_RADIUS * Math.sqrt(frames) : 0;
		uniforms.fade.value = blur ? Math.pow(0.998, frames) : 1;
		// On the byte fallback, decay must exceed a quantization step to reach black.
		uniforms.fadeFloor.value = blur && this.byteFeedback && frames > 0 ? Math.max(1, frames) / 255 : 0;
		this.offscreen(() => {
			if (hasInput) this.captureStrokes(strokes);
			this.feedbackCamera.renderTarget = this.write;
			this.feedbackCamera.update(this.renderer, this.feedbackScene);
		});
		[this.read, this.write] = [this.write, this.read];
		this.surface.material.uniforms.painting.value = this.read.texture;
	}

	dispose() {
		this.read.dispose();
		this.write.dispose();
		this.input.dispose();
		this.strokeTarget.dispose();
		this.copyQuad.geometry.dispose();
		this.copyQuad.material.dispose();
		this.feedbackMaterial.dispose();
		this.surface.geometry.dispose();
		this.surface.material.dispose();
	}
}
