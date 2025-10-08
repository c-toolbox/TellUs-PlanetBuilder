import * as THREE from "three";

const vertexShader = `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;
uniform samplerCube envMap;
varying vec2 vUv;

void main() {
	vec2 p = vUv * 2.0 - 1.0;
	float r = length(p);
	if (r > 1.0) {
		gl_FragColor = vec4(0.0);
		return;
	}

	float c = r * 3.141592653589793 * (360.0 / 360.0);
	float theta = atan(p.y, p.x);
	float sin_c = sin(c);
	float cos_c = cos(c);
	vec3 dir = vec3(
		-sin_c * cos(theta),
		sin_c * sin(theta),
		cos_c
	);

	gl_FragColor = textureCube(envMap, dir);
}
`;

export class ProjectionScene extends THREE.Scene {
	public cubeCamera: THREE.CubeCamera;
	public screenCamera: THREE.OrthographicCamera;

	constructor() {
		super();

		// Cube render target + cube camera for sampling into the AEP shader
		const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(1024);
		// const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(2 * 1024, {
		// 	generateMipmaps: true,
		// 	minFilter: THREE.LinearMipmapLinearFilter,
		// 	// minFilter: THREE.LinearMipMapNearestFilter,
		// });
		this.cubeCamera = new THREE.CubeCamera(0.01, 1000, cubeRenderTarget);

		// AEP full-screen quad
		this.screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

		const aepMaterial = new THREE.ShaderMaterial({
			uniforms: { envMap: { value: cubeRenderTarget.texture } },
			vertexShader,
			fragmentShader,
			depthTest: false,
			depthWrite: false,
		});
		const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), aepMaterial);
		this.add(quad);
	}
}
