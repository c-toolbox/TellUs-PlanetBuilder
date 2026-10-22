import * as THREE from "three";
import { Easing, Tween } from "@tweenjs/tween.js";
import { ForceGraph, GraphNode } from "./ForceGraph";
import { arcNormal } from "./sphericalGraph";

export const DOT_RADIUS = 0.018;
export const HIT_RADIUS = 0.072;
const ORIGIN = new THREE.Vector3();
const EDGE_RADIUS = 1.006;
const EDGE_HALF_WIDTH = 0.0015;

/** Small circular texture shared by every instance; no image asset or DOM needed. */
function circleTexture() {
	const size = 64;
	const pixels = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const distance = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
			const offset = (y * size + x) * 4;
			pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255;
			pixels[offset + 3] = Math.round(255 * THREE.MathUtils.clamp((1 - distance) * 24, 0, 1));
		}
	}
	const texture = new THREE.DataTexture(pixels, size, size);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.needsUpdate = true;
	return texture;
}

/** One draw for all dots and one for all spherical edge ribbons. */
export class GraphView extends THREE.Group {
	private readonly texture = circleTexture();
	private readonly dotGeometry = new THREE.PlaneGeometry(1, 1);
	private readonly hitGeometry = new THREE.CircleGeometry(1, 32);
	private readonly dotMaterial = new THREE.MeshBasicMaterial({
		map: this.texture, transparent: true, alphaTest: 0.01, depthWrite: false, toneMapped: false,
	});
	private readonly hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
	private readonly edgeGeometry = new THREE.BufferGeometry();
	private readonly edgeMaterial = new THREE.MeshBasicMaterial({
		vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false,
		side: THREE.DoubleSide, toneMapped: false,
	});
	private readonly edgeMesh = new THREE.Mesh(this.edgeGeometry, this.edgeMaterial);
	private dots?: THREE.InstancedMesh;
	private hits?: THREE.InstancedMesh;
	private capacity = 0;
	private nodeIds: number[] = [];
	private readonly raycaster = new THREE.Raycaster();
	private readonly transform = new THREE.Object3D();
	private edgeCapacity = 0;
	private readonly creationAnimations = new Map<GraphNode, {
		state: { scale: number };
		tween: Tween<{ scale: number }>;
	}>();

	constructor(private readonly graph: ForceGraph) {
		super();
		this.edgeMesh.frustumCulled = false;
		this.add(this.edgeMesh);
		this.sync();
	}

	animateCreation(
		node: GraphNode,
		createTween: <T extends object>(target: T) => Tween<T>,
	) {
		this.creationAnimations.get(node)?.tween.stop();
		const state = { scale: 0 };
		const tween = createTween(state)
			.to({ scale: 1 }, 650)
			.easing(Easing.Elastic.Out)
			.onComplete(() => this.creationAnimations.delete(node));
		this.creationAnimations.set(node, { state, tween });
		tween.start();
	}

	private syncNodes() {
		for (const [node, animation] of this.creationAnimations) {
			if (this.graph.nodes.get(node.id) !== node) {
				animation.tween.stop();
				this.creationAnimations.delete(node);
			}
		}
		const count = this.graph.nodes.size;
		if (!this.dots || count > this.capacity) {
			if (this.dots && this.hits) {
				this.remove(this.dots, this.hits);
				this.dots.dispose();
				this.hits.dispose();
			}
			this.capacity = Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, count))));
			this.dots = new THREE.InstancedMesh(this.dotGeometry, this.dotMaterial, this.capacity);
			this.hits = new THREE.InstancedMesh(this.hitGeometry, this.hitMaterial, this.capacity);
			this.dots.renderOrder = 1;
			for (const mesh of [this.dots, this.hits]) {
				mesh.frustumCulled = false;
				mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
				this.add(mesh);
			}
		}
		this.dots.count = this.hits!.count = count;
		this.nodeIds = [];
		let index = 0;
		for (const node of this.graph.nodes.values()) {
			this.nodeIds.push(node.id);
			this.transform.position.copy(node.position);
			this.transform.lookAt(ORIGIN);
			const creationScale = this.creationAnimations.get(node)?.state.scale ?? 1;
			this.transform.scale.setScalar(DOT_RADIUS * 2 * (node.heldBy === undefined ? 1 : 1.35) * creationScale);
			this.transform.updateMatrix();
			this.dots.setMatrixAt(index, this.transform.matrix);
			this.dots.setColorAt(index, node.color);
			this.transform.scale.setScalar(HIT_RADIUS);
			this.transform.updateMatrix();
			this.hits!.setMatrixAt(index, this.transform.matrix);
			index++;
		}
		this.dots.instanceMatrix.needsUpdate = true;
		if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
		this.hits!.instanceMatrix.needsUpdate = true;
		// InstancedMesh caches this sphere; moving dots must invalidate it for picking.
		this.hits!.boundingSphere = null;
	}

	pick(direction: THREE.Vector3): GraphNode | undefined {
		this.syncNodes();
		this.updateWorldMatrix(true, true);
		this.raycaster.set(ORIGIN, direction.clone().normalize());
		const intersections = this.raycaster.intersectObject(this.hits!, false);
		let closest: GraphNode | undefined;
		let bestCosine = -Infinity;
		for (const hit of intersections) {
			if (hit.instanceId === undefined) continue;
			const node = this.graph.nodes.get(this.nodeIds[hit.instanceId]);
			if (!node) continue;
			// Distance to the centre on the sphere, independent of triangle hit order.
			const cosine = direction.dot(node.position);
			if (cosine > bestCosine) {
				closest = node;
				bestCosine = cosine;
			}
		}
		return closest;
	}

	sync() {
		this.syncNodes();
		const edges = Array.from(this.graph.edges.values(), (edge) => ({
			...edge, angle: edge.source.position.angleTo(edge.target.position),
		}));
		const required = edges.reduce((sum, edge) => sum + Math.max(1, Math.ceil(edge.angle / 0.07)) * 6, 0);
		if (required > this.edgeCapacity || !this.edgeGeometry.hasAttribute("position")) {
			this.edgeCapacity = Math.max(1024, 2 ** Math.ceil(Math.log2(Math.max(1, required))));
			// Dispose old GPU buffers before replacing their attributes.
			this.edgeGeometry.dispose();
			for (const name of ["position", "color"]) {
				this.edgeGeometry.setAttribute(name,
					new THREE.BufferAttribute(new Float32Array(this.edgeCapacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
			}
		}
		const positions = this.edgeGeometry.getAttribute("position") as THREE.BufferAttribute;
		const colors = this.edgeGeometry.getAttribute("color") as THREE.BufferAttribute;
		const normal = new THREE.Vector3(), tangent = new THREE.Vector3(), point = new THREE.Vector3();
		const left = new THREE.Vector3(), right = new THREE.Vector3();
		const nextLeft = new THREE.Vector3(), nextRight = new THREE.Vector3();
		const color = new THREE.Color(), nextColor = new THREE.Color();
		let vertex = 0;
		const write = (p: THREE.Vector3, c: THREE.Color) => {
			positions.setXYZ(vertex, p.x, p.y, p.z);
			colors.setXYZ(vertex++, c.r, c.g, c.b);
		};
		for (const edge of edges) {
			const a = edge.source.position, b = edge.target.position;
			arcNormal(a, b, normal);
			tangent.crossVectors(normal, a);
			const segments = Math.max(1, Math.ceil(edge.angle / 0.07));
			for (let i = 0; i <= segments; i++) {
				const t = i / segments;
				point.copy(a).multiplyScalar(Math.cos(edge.angle * t)).addScaledVector(tangent, Math.sin(edge.angle * t));
				nextLeft.copy(point).multiplyScalar(Math.cos(EDGE_HALF_WIDTH)).addScaledVector(normal, Math.sin(EDGE_HALF_WIDTH)).multiplyScalar(EDGE_RADIUS);
				nextRight.copy(point).multiplyScalar(Math.cos(EDGE_HALF_WIDTH)).addScaledVector(normal, -Math.sin(EDGE_HALF_WIDTH)).multiplyScalar(EDGE_RADIUS);
				nextColor.copy(edge.source.color).lerp(edge.target.color, t).multiplyScalar(0.7).addScalar(0.12);
				if (i > 0) {
					write(left, color); write(right, color); write(nextLeft, nextColor);
					write(right, color); write(nextRight, nextColor); write(nextLeft, nextColor);
				}
				left.copy(nextLeft); right.copy(nextRight); color.copy(nextColor);
			}
		}
		this.edgeGeometry.setDrawRange(0, vertex);
		positions.needsUpdate = colors.needsUpdate = true;
	}

	dispose() {
		for (const animation of this.creationAnimations.values()) animation.tween.stop();
		this.creationAnimations.clear();
		this.dots?.dispose();
		this.hits?.dispose();
		this.dotGeometry.dispose();
		this.hitGeometry.dispose();
		this.edgeGeometry.dispose();
		this.dotMaterial.dispose();
		this.hitMaterial.dispose();
		this.edgeMaterial.dispose();
		this.texture.dispose();
		this.clear();
	}
}
