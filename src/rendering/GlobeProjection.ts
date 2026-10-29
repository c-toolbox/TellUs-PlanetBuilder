import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import pufferTouchUrl from "@/assets/models/puffertouch.glb?url";
import silhouettesUrl from "@/assets/textures/silhouettes.png?url";
import azimuthalVertexShader from "./shaders/basic.vert?raw";
import azimuthalFragmentShader from "./shaders/azimuthal.frag?raw";
import globeVertexShader from "./shaders/globeDisplay.vert?raw";
import globeFragmentShader from "./shaders/globeDisplay.frag?raw";
import { GLOBE_FOV_DEGREES } from "@/constants";

const CUBE_RESOLUTION = 4096;
const PROJECTION_RESOLUTION = 4096;

export interface ProjectionTransition {
	progress: number;
	origin: THREE.Vector3;
}

export class GlobeProjection {
	private azimuthalMaterial!: THREE.ShaderMaterial;
	private transitionCubeCamera?: THREE.CubeCamera;
	private readonly cubeCamera: THREE.CubeCamera;
	private readonly screenCamera = new THREE.OrthographicCamera(
		-1,
		1,
		1,
		-1,
		0,
		1,
	);
	private readonly azimuthalScene = new THREE.Scene();
	readonly globePreviewTarget: THREE.WebGLRenderTarget;
	readonly globePreviewScene = new THREE.Scene();
	readonly globePreviewMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

	constructor() {
		this.cubeCamera = this.createCubeCamera();
		this.globePreviewTarget = this.createGlobePreviewTarget();
		this.setupAzimuthalProjection();
		this.globePreviewMesh = this.createGlobePreviewMesh();
		this.setupGlobePreviewScene();
	}

	render(
		renderer: THREE.WebGLRenderer,
		scene: THREE.Scene,
		camera: THREE.PerspectiveCamera,
		target: THREE.WebGLRenderTarget | null,
	) {
		this.captureScene(renderer, scene, camera);
		this.renderOutput(renderer, target);
	}

	private createCubeCamera() {
		const target = new THREE.WebGLCubeRenderTarget(CUBE_RESOLUTION, {
			generateMipmaps: true,
			minFilter: THREE.LinearMipmapLinearFilter,
		});
		target.texture.colorSpace = THREE.SRGBColorSpace;
		return new THREE.CubeCamera(0.01, 1000, target);
	}

	private createGlobePreviewTarget() {
		const target = new THREE.WebGLRenderTarget(
			PROJECTION_RESOLUTION,
			PROJECTION_RESOLUTION,
			{ depthBuffer: false },
		);
		// The projection shader already applies display gamma. Preserve it in the preview.
		target.texture.colorSpace = THREE.NoColorSpace;
		return target;
	}

	private setupAzimuthalProjection() {
		this.azimuthalMaterial = new THREE.ShaderMaterial({
			uniforms: {
				envMap: { value: this.cubeCamera.renderTarget.texture },
				globeFovDegrees: { value: GLOBE_FOV_DEGREES },
				transitionEnvMap: { value: this.cubeCamera.renderTarget.texture },
				transitionEnabled: { value: false },
				transitionProgress: { value: 0 },
				transitionOrigin: { value: new THREE.Vector3(0, 0, 1) },
				transitionBorderWidth: { value: THREE.MathUtils.degToRad(1) },
			},
			vertexShader: azimuthalVertexShader,
			fragmentShader: azimuthalFragmentShader,
			depthTest: false,
			depthWrite: false,
		});
		this.azimuthalScene.add(new THREE.Mesh(
			new THREE.PlaneGeometry(2, 2),
			this.azimuthalMaterial,
		));
	}

	private createGlobePreviewMesh() {
		return new THREE.Mesh(
			new THREE.SphereGeometry(1, 128, 64),
			new THREE.ShaderMaterial({
				uniforms: {
					projectionMap: { value: this.globePreviewTarget.texture },
					globeFovDegrees: { value: GLOBE_FOV_DEGREES },
				},
				vertexShader: globeVertexShader,
				fragmentShader: globeFragmentShader,
			}),
		);
	}

	private loadGlobeSupport() {
		new GLTFLoader().load(
			pufferTouchUrl,
			({ scene }) => {
				this.globePreviewScene.add(scene);
			},
			undefined,
			(error) => console.error("Failed to load globe support model", error),
		);
	}

	private createSilhouettes() {
		const pixelsPerUnit = 192;
		const height = 1000 / pixelsPerUnit;
		const radius = 3200 / (pixelsPerUnit * 2 * Math.PI);
		const groundY = -3;
		const bottomPadding = 70 / pixelsPerUnit;
		const texture = new THREE.TextureLoader().load(silhouettesUrl);
		texture.colorSpace = THREE.SRGBColorSpace;

		const silhouettes = new THREE.Mesh(
			new THREE.CylinderGeometry(radius, radius, height, 128, 1, true),
			new THREE.MeshBasicMaterial({
				map: texture,
				transparent: true,
				depthWrite: false,
				side: THREE.DoubleSide,
				opacity: 0,
			}),
		);
		silhouettes.position.y = groundY + height / 2 - bottomPadding;

		const cameraPosition = new THREE.Vector3();
		silhouettes.onBeforeRender = (_renderer, _scene, camera) => {
			camera.getWorldPosition(cameraPosition);
			silhouettes.material.opacity = (cameraPosition.length() - 4) / (10 - 4);
		};
		return silhouettes;
	}

	private setupGlobePreviewScene() {
		this.globePreviewScene.background = new THREE.Color(0x181818);
		this.globePreviewScene.add(this.globePreviewMesh, this.createSilhouettes());

		this.loadGlobeSupport();
		this.globePreviewScene.add(new THREE.AmbientLight(0xffffff, 0.8));
		const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
		keyLight.position.set(5, 8, 5);
		this.globePreviewScene.add(keyLight);
		const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
		fillLight.position.set(-5, 2, -5);
		this.globePreviewScene.add(fillLight);
	}

	captureScene(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
		this.cubeCamera.position.copy(camera.position);
		this.cubeCamera.quaternion.copy(camera.quaternion);
		this.cubeCamera.update(renderer, scene);
	}

	captureTransitionScene(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
		// Allocate a second cube map only for scenes that use a projected wipe.
		this.transitionCubeCamera ??= this.createCubeCamera();
		this.transitionCubeCamera.position.copy(camera.position);
		this.transitionCubeCamera.quaternion.copy(camera.quaternion);
		this.transitionCubeCamera.update(renderer, scene);
		this.azimuthalMaterial.uniforms.transitionEnvMap.value = this.transitionCubeCamera.renderTarget.texture;
	}

	renderOutput(
		renderer: THREE.WebGLRenderer,
		target: THREE.WebGLRenderTarget | null,
		transition?: ProjectionTransition,
	) {
		this.azimuthalMaterial.uniforms.transitionEnabled.value = Boolean(transition && this.transitionCubeCamera);
		if (transition) {
			this.azimuthalMaterial.uniforms.transitionProgress.value = transition.progress;
			this.azimuthalMaterial.uniforms.transitionOrigin.value.copy(transition.origin);
		}
		renderer.setRenderTarget(target);
		renderer.render(this.azimuthalScene, this.screenCamera);
	}
}
