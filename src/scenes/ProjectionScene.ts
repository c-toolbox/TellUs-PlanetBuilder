import * as THREE from "three";

import vertexShader from "@/shaders/basic.vert?raw";
import fragmentShader from "@/shaders/azimuthal.frag?raw";
import { GLOBE_FOV_DEGREES } from "@/constants";

export class ProjectionScene extends THREE.Scene {
	public cubeCamera: THREE.CubeCamera;
	public screenCamera: THREE.OrthographicCamera;
	public aepTarget: THREE.WebGLRenderTarget;

	constructor() {
		super();

		const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(1024, {
			generateMipmaps: true,
			minFilter: THREE.LinearMipmapLinearFilter,
		});
		cubeRenderTarget.texture.colorSpace = THREE.SRGBColorSpace;
		this.cubeCamera = new THREE.CubeCamera(0.01, 1000, cubeRenderTarget);

		this.screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

		this.aepTarget = new THREE.WebGLRenderTarget(1024, 1024, {
			format: THREE.RGBAFormat,
			type: THREE.UnsignedByteType,
		});
		this.aepTarget.texture.colorSpace = THREE.SRGBColorSpace;

		const aepMaterial = new THREE.ShaderMaterial({
			uniforms: {
				envMap: { value: cubeRenderTarget.texture },
				globeFovDegrees: { value: GLOBE_FOV_DEGREES },
			},
			vertexShader: vertexShader,
			fragmentShader: fragmentShader,
			depthTest: false,
			depthWrite: false,
		});

		const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), aepMaterial);
		this.add(quad);
	}
}
