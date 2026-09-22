import * as THREE from "three";

import vertexShader from "@/rendering/shaders/basic.vert?raw";
import fragmentShader from "@/rendering/shaders/azimuthal.frag?raw";
import { GLOBE_FOV_DEGREES } from "@/constants";

const CUBE_RENDER_RESOLUTION = 2048;
const PROJECTION_RESOLUTION = 1024;
const PROJECTION_MSAA_SAMPLES = 4;

export class ProjectionScene extends THREE.Scene {
	public cubeCamera: THREE.CubeCamera;
	public transitionCubeCamera: THREE.CubeCamera;
	public screenCamera: THREE.OrthographicCamera;
	public aepTarget: THREE.WebGLRenderTarget;
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

		this.aepMaterial = new THREE.ShaderMaterial({
			uniforms: {
				envMap: { value: cubeRenderTarget.texture },
				transitionEnvMap: { value: transitionCubeRenderTarget.texture },
				globeFovDegrees: { value: GLOBE_FOV_DEGREES },
				transitionProgress: { value: 0 },
				transitionBorderWidth: { value: THREE.MathUtils.degToRad(1) },
				transitionOrigin: { value: new THREE.Vector3(0, 0, 1) },
				transitionActive: { value: false },
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
	}

	setTransition(active: boolean, progress = 0, origin?: THREE.Vector3) {
		this.aepMaterial.uniforms.transitionActive.value = active;
		this.aepMaterial.uniforms.transitionProgress.value = progress;
		if (origin) {
			this.aepMaterial.uniforms.transitionOrigin.value.copy(origin);
		}
	}
}
