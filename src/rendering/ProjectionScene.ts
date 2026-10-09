import * as THREE from "three";

import vertexShader from "@/rendering/shaders/basic.vert?raw";
import fragmentShader from "@/rendering/shaders/azimuthal.frag?raw";
import sphereVertexShader from "@/rendering/shaders/sphereDisplay.vert?raw";
import sphereFragmentShader from "@/rendering/shaders/sphereDisplay.frag?raw";
import { GLOBE_FOV_DEGREES } from "@/constants";
import { Color } from "@/utils/colors";

const CUBE_RENDER_RESOLUTION = 4096;
const PROJECTION_RESOLUTION = 2048;
const PROJECTION_MSAA_SAMPLES = 4;

export class ProjectionScene extends THREE.Scene {
	public cubeCamera: THREE.CubeCamera;
	public transitionCubeCamera: THREE.CubeCamera;
	public screenCamera: THREE.OrthographicCamera;
	public aepTarget: THREE.WebGLRenderTarget;
	public sphericalDisplayScene: THREE.Scene;
	public sphericalDisplayMesh: THREE.Mesh<
		THREE.SphereGeometry,
		THREE.ShaderMaterial
	>;
	private aepMaterial: THREE.ShaderMaterial;

	constructor() {
		super();

		const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(
			CUBE_RENDER_RESOLUTION,
			{
				generateMipmaps: true,
				minFilter: THREE.LinearMipmapLinearFilter,
			},
		);
		cubeRenderTarget.texture.colorSpace = THREE.SRGBColorSpace;
		this.cubeCamera = new THREE.CubeCamera(0.01, 1000, cubeRenderTarget);

		const transitionCubeRenderTarget = new THREE.WebGLCubeRenderTarget(
			CUBE_RENDER_RESOLUTION,
			{
				generateMipmaps: true,
				minFilter: THREE.LinearMipmapLinearFilter,
			},
		);
		transitionCubeRenderTarget.texture.colorSpace = THREE.SRGBColorSpace;
		this.transitionCubeCamera = new THREE.CubeCamera(
			0.01,
			1000,
			transitionCubeRenderTarget,
		);

		this.screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

		this.aepTarget = new THREE.WebGLRenderTarget(
			PROJECTION_RESOLUTION,
			PROJECTION_RESOLUTION,
			{
				format: THREE.RGBAFormat,
				type: THREE.UnsignedByteType,
				samples: PROJECTION_MSAA_SAMPLES,
			},
		);
		this.aepTarget.texture.colorSpace = THREE.SRGBColorSpace;

		const sharedUniforms = {
			envMap: { value: cubeRenderTarget.texture },
			transitionEnvMap: { value: transitionCubeRenderTarget.texture },
			transitionProgress: { value: 0 },
			transitionBorderWidth: { value: THREE.MathUtils.degToRad(1) },
			transitionOrigin: { value: new THREE.Vector3(0, 0, 1) },
			transitionActive: { value: false },
		};
		this.aepMaterial = new THREE.ShaderMaterial({
			uniforms: {
				...sharedUniforms,
				globeFovDegrees: { value: GLOBE_FOV_DEGREES },
			},
			vertexShader: vertexShader,
			fragmentShader: fragmentShader,
			depthTest: false,
			depthWrite: false,
		});

		const quad = new THREE.Mesh(
			new THREE.PlaneGeometry(2, 2),
			this.aepMaterial,
		);
		this.add(quad);

		this.sphericalDisplayScene = new THREE.Scene();
		this.sphericalDisplayScene.background = new THREE.Color(0x181818);
		this.sphericalDisplayMesh = new THREE.Mesh(
			new THREE.SphereGeometry(1, 128, 64),
			new THREE.ShaderMaterial({
				uniforms: sharedUniforms,
				vertexShader: sphereVertexShader,
				fragmentShader: sphereFragmentShader,
				side: THREE.FrontSide,
			}),
		);
		this.sphericalDisplayScene.add(this.sphericalDisplayMesh);

		const support = new THREE.Mesh(
			new THREE.CylinderGeometry(0.68, 0.68, 0.25, 64),
			new THREE.MeshStandardMaterial({
				color: Color.Stone700,
				roughness: 0.4,
				metalness: 0.05,
			}),
		);
		support.position.y = -1;
		this.sphericalDisplayScene.add(support);

		const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
		this.sphericalDisplayScene.add(ambientLight);

		const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
		keyLight.position.set(5, 8, 5);
		this.sphericalDisplayScene.add(keyLight);

		const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
		fillLight.position.set(-5, 2, -5);
		this.sphericalDisplayScene.add(fillLight);
	}

	setTransition(active: boolean, progress = 0, origin?: THREE.Vector3) {
		this.aepMaterial.uniforms.transitionActive.value = active;
		this.aepMaterial.uniforms.transitionProgress.value = progress;
		if (origin) {
			this.aepMaterial.uniforms.transitionOrigin.value.copy(origin);
		}
	}
}
