import * as THREE from "three";

// Angular border width shared by measuring tapes and map drawings.
export const SPHERICAL_OUTLINE_WIDTH = 0.004;
const OUTLINE_SAMPLES = 32;
type OutlineSource = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

// Share the live vertex buffers and draw range, including text loaded after construction.
class OutlineMesh extends THREE.Mesh<
	THREE.InstancedBufferGeometry,
	THREE.ShaderMaterial
> {
	private sourceGeometry?: THREE.BufferGeometry;

	constructor(
		private readonly source: OutlineSource,
		material: THREE.ShaderMaterial,
		offsets: THREE.InstancedBufferAttribute,
	) {
		super(new THREE.InstancedBufferGeometry(), material);
		this.name = "Spherical outline";
		this.geometry.instanceCount = OUTLINE_SAMPLES;
		this.geometry.setAttribute("outlineOffset", offsets);
		// The shader expands beyond the source geometry's bounds.
		this.frustumCulled = false;
		this.raycast = () => {};
	}

	override updateMatrixWorld(force?: boolean) {
		const source = this.source.geometry;
		if (source !== this.sourceGeometry) {
			// Retire the old binding before a label replaces its geometry.
			this.geometry.dispose();
			this.sourceGeometry = source;
			this.geometry.setIndex(source.index);
			this.geometry.setAttribute("position", source.getAttribute("position"));
		}
		this.geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
		this.visible = this.source.material.visible;
		super.updateMatrixWorld(force);
	}
}

/** Colored borders with a constant angular width, viewed from the display origin. */
export default class SphericalOutline {
	readonly color: THREE.Color;
	private readonly meshes: OutlineMesh[] = [];
	private readonly materials = new Map<THREE.Side, THREE.ShaderMaterial>();

	constructor(
		root: THREE.Object3D,
		radius: number,
		width: number,
		color: THREE.ColorRepresentation = 0xffffff,
	) {
		this.color = new THREE.Color(color);
		const offsets = new THREE.InstancedBufferAttribute(
			new Float32Array(OUTLINE_SAMPLES * 2),
			2,
		);
		for (let i = 0; i < OUTLINE_SAMPLES; i++) {
			const angle = (i * Math.PI * 2) / OUTLINE_SAMPLES;
			offsets.setXY(i, Math.cos(angle), Math.sin(angle));
		}

		// Collect before adding children so traversal never visits its own outlines.
		const sources: OutlineSource[] = [];
		root.traverse((object) => {
			if (
				object instanceof THREE.Mesh &&
				!Array.isArray(object.material) &&
				object.material.visible
			) {
				sources.push(object as OutlineSource);
			}
		});
		for (const source of sources) {
			let material = this.materials.get(source.material.side);
			if (!material) {
				material = new THREE.ShaderMaterial({
					name: "Spherical outline",
					uniforms: {
						outlineRadius: { value: radius },
						outlineWidth: { value: width },
						outlineColor: { value: this.color },
					},
					side: source.material.side,
					toneMapped: false,
					vertexShader: `
						attribute vec2 outlineOffset;
						uniform float outlineRadius;
						uniform float outlineWidth;
						void main() {
							vec3 direction = normalize((modelMatrix * vec4(position, 1.0)).xyz);
							vec3 axis = abs(direction.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
							vec3 tangent = normalize(cross(axis, direction));
							vec3 bitangent = cross(direction, tangent);
							vec3 offset = (tangent * outlineOffset.x + bitangent * outlineOffset.y) * tan(outlineWidth);
							vec3 worldPosition = normalize(direction + offset) * outlineRadius;
							gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
						}
					`,
					fragmentShader: `
						uniform vec3 outlineColor;
						void main() {
							gl_FragColor = vec4(outlineColor, 1.0);
							#include <colorspace_fragment>
						}
					`,
				});
				this.materials.set(source.material.side, material);
			}
			const outline = new OutlineMesh(source, material, offsets);
			source.add(outline);
			this.meshes.push(outline);
		}
	}

	dispose() {
		for (const mesh of this.meshes) {
			mesh.removeFromParent();
			mesh.geometry.dispose();
		}
		this.materials.forEach((material) => material.dispose());
	}
}
