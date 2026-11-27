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

export class GlobeProjection {
	private azimuthalMaterial!: THREE.ShaderMaterial;
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
	readonly globePreviewScene = new THREE.Scene();
	readonly globePreviewMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

	constructor() {
		this.cubeCamera = this.createCubeCamera();
		this.setupAzimuthalProjection();
		this.globePreviewMesh = this.createGlobePreviewMesh();
		this.setupGlobePreviewScene();
	}

	capture(
		renderer: THREE.WebGLRenderer,
		scene: THREE.Scene,
		camera: THREE.PerspectiveCamera,
	) {
		this.cubeCamera.position.copy(camera.position);
		this.cubeCamera.quaternion.copy(camera.quaternion);
		this.cubeCamera.update(renderer, scene);
	}

	/** Draw the captured cube map as the projector's azimuthal image. */
	renderAzimuthal(renderer: THREE.WebGLRenderer) {
		renderer.setRenderTarget(null);
		renderer.render(this.azimuthalScene, this.screenCamera);
	}

	private createCubeCamera() {
		const target = new THREE.WebGLCubeRenderTarget(CUBE_RESOLUTION, {
			generateMipmaps: true,
			minFilter: THREE.LinearMipmapLinearFilter,
		});
		target.texture.colorSpace = THREE.SRGBColorSpace;
		return new THREE.CubeCamera(0.01, 1000, target);
	}

	private setupAzimuthalProjection() {
		this.azimuthalMaterial = new THREE.ShaderMaterial({
			uniforms: {
				envMap: { value: this.cubeCamera.renderTarget.texture },
				globeFovDegrees: { value: GLOBE_FOV_DEGREES },
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
					envMap: { value: this.cubeCamera.renderTarget.texture },
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
}
