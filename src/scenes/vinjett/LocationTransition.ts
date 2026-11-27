import * as THREE from "three";
import type { Renderer } from "@/rendering/Renderer";
import { GLOBE_FOV_DEGREES } from "@/constants";
import vertexShader from "@/rendering/shaders/basic.vert?raw";
import fragmentShader from "./shaders/locationTransition.frag?raw";

/** Composite Vinjett's location wipe after the shared globe projection. */
export class LocationTransition {
	private readonly currentTarget = this.createTarget();
	private readonly incomingTarget = this.createTarget();
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	private readonly size = new THREE.Vector2();
	private readonly material = new THREE.ShaderMaterial({
		uniforms: {
			currentMap: { value: this.currentTarget.texture },
			incomingMap: { value: this.incomingTarget.texture },
			globeFovDegrees: { value: GLOBE_FOV_DEGREES },
			progress: { value: 0 },
			origin: { value: new THREE.Vector3() },
			borderWidth: { value: THREE.MathUtils.degToRad(1) },
		},
		vertexShader,
		fragmentShader,
		depthTest: false,
		depthWrite: false,
		blending: THREE.NoBlending,
		toneMapped: false,
	});
	private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);

	constructor() {
		this.scene.add(this.quad);
	}

	private createTarget() {
		const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
		// The projection already applies display gamma; composite these pixels unchanged.
		target.texture.colorSpace = THREE.NoColorSpace;
		return target;
	}

	render(
		renderer: Renderer,
		scene: THREE.Scene,
		background: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial[]>,
		incomingBackground: THREE.MeshBasicMaterial[],
		origin: THREE.Vector3,
		progress: number,
	) {
		const target = renderer.projectionOutputTarget;
		if (target) {
			this.size.set(target.width, target.height);
		} else {
			renderer.getDrawingBufferSize(this.size);
		}
		this.currentTarget.setSize(this.size.x, this.size.y);
		this.incomingTarget.setSize(this.size.x, this.size.y);

		renderer.renderProjection(scene, this.currentTarget);
		const currentBackground = background.material;
		try {
			background.material = incomingBackground;
			renderer.renderProjection(scene, this.incomingTarget);
		} finally {
			background.material = currentBackground;
		}

		this.material.uniforms.progress.value = progress;
		this.material.uniforms.origin.value.copy(origin).applyQuaternion(
			renderer.projectionCamera.quaternion.clone().invert(),
		);
		renderer.setRenderTarget(target);
		renderer.render(this.scene, this.camera);
	}

	dispose() {
		this.currentTarget.dispose();
		this.incomingTarget.dispose();
		this.quad.geometry.dispose();
		this.material.dispose();
	}
}
