import * as THREE from "three";
import { Easing, Tween } from "@tweenjs/tween.js";
import { PhysicsNode, PhysicsWorld, NODE_RADIUS, ROD_RADIUS, edgeKey } from "./PhysicsWorld";
import { arcNormal } from "./sphericalGeometry";
import { edgeThickness } from "./PhysicsTouches";

// Dots on a body or rod are joints; only a loose node is drawn at its full collision size.
const JOINT_RADIUS = 0.028;
export const HIT_RADIUS = 0.072;
const ORIGIN = new THREE.Vector3();
const EDGE_RADIUS = 1.006;
const OUTLINE_HALF_WIDTH = 0.009;
const SEAM_HALF_WIDTH = 0.0025;
const FILL_RADIUS = 1.002;
const SKY_RADIUS = 2;
const FLOOR_RADIUS = 1.9;
const SKY_HORIZON = new THREE.Color(0xbfe4f8);
const SKY_ZENITH = new THREE.Color(0x7ec1ee);
const FLOOR_COLOR = new THREE.Color(0x2c2c30);
const DELETE_COLOR = new THREE.Color(0xff3b30);
// Angular size of one fill sub-triangle, so flat faces follow the sphere.
const FILL_STEP = 0.12;
const MAX_FILL_DIVISIONS = 6;

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

/** Light blue sky, with a dark gray floor below the floor latitude. */
class Environment extends THREE.Group {
	private readonly geometries: THREE.BufferGeometry[] = [];
	private readonly materials: THREE.Material[] = [];
	private readonly floorMaterial = new THREE.MeshBasicMaterial({
		color: FLOOR_COLOR, side: THREE.BackSide, toneMapped: false,
	});
	private readonly floorMesh = new THREE.Mesh(undefined, this.floorMaterial);
	private floorHeight?: number;

	constructor() {
		super();
		const sky = new THREE.SphereGeometry(SKY_RADIUS, 64, 48);
		const positions = sky.getAttribute("position");
		const colors = new Float32Array(positions.count * 3);
		const color = new THREE.Color();
		for (let i = 0; i < positions.count; i++) {
			const height = positions.getY(i) / SKY_RADIUS;
			color.lerpColors(SKY_HORIZON, SKY_ZENITH, THREE.MathUtils.clamp(height, 0, 1));
			color.toArray(colors, i * 3);
		}
		sky.setAttribute("color", new THREE.BufferAttribute(colors, 3));
		const skyMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, toneMapped: false });
		this.geometries.push(sky);
		this.materials.push(skyMaterial, this.floorMaterial);
		this.add(new THREE.Mesh(sky, skyMaterial), this.floorMesh);
	}

	/** Moves the floor to a height (y of its edge). */
	setFloor(height: number) {
		if (height === this.floorHeight) return;
		this.floorHeight = height;
		this.floorMesh.geometry.dispose();
		// A cap closer than the sky hides it below the floor latitude.
		const start = Math.acos(height);
		this.floorMesh.geometry = new THREE.SphereGeometry(FLOOR_RADIUS, 64, 8, 0, Math.PI * 2, start, Math.PI - start);
	}

	dispose() {
		this.geometries.forEach((geometry) => geometry.dispose());
		this.floorMesh.geometry.dispose();
		this.materials.forEach((material) => material.dispose());
		this.clear();
	}
}

/** One draw for all dots, one for the filled shapes and one for all spherical edge ribbons. */
export class PhysicsView extends THREE.Group {
	private readonly environment = new Environment();
	private readonly texture = circleTexture();
	private readonly dotGeometry = new THREE.PlaneGeometry(1, 1);
	private readonly hitGeometry = new THREE.CircleGeometry(1, 32);
	private readonly dotMaterial = new THREE.MeshBasicMaterial({
		map: this.texture, transparent: true, alphaTest: 0.01, depthWrite: false, toneMapped: false,
	});
	private readonly hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
	private readonly edgeGeometry = new THREE.BufferGeometry();
	private readonly edgeMaterial = new THREE.MeshBasicMaterial({
		vertexColors: true, transparent: true, opacity: 1, depthWrite: false,
		side: THREE.DoubleSide, toneMapped: false,
	});
	private readonly edgeMesh = new THREE.Mesh(this.edgeGeometry, this.edgeMaterial);
	private readonly fillGeometry = new THREE.BufferGeometry();
	private readonly fillMaterial = new THREE.MeshBasicMaterial({
		vertexColors: true, transparent: true, opacity: 1, depthWrite: false,
		side: THREE.DoubleSide, toneMapped: false,
	});
	private readonly fillMesh = new THREE.Mesh(this.fillGeometry, this.fillMaterial);
	private fillCapacity = 0;
	private dots?: THREE.InstancedMesh;
	private hits?: THREE.InstancedMesh;
	private capacity = 0;
	private nodeIds: number[] = [];
	private readonly raycaster = new THREE.Raycaster();
	private readonly transform = new THREE.Object3D();
	private edgeCapacity = 0;
	private readonly creationAnimations = new Map<PhysicsNode, {
		state: { scale: number };
		tween: Tween<{ scale: number }>;
	}>();

	constructor(private readonly world: PhysicsWorld) {
		super();
		this.edgeMesh.frustumCulled = false;
		this.fillMesh.frustumCulled = false;
		this.fillMesh.renderOrder = -1;
		this.add(this.environment, this.fillMesh, this.edgeMesh);
		this.sync();
	}

	animateCreation(
		node: PhysicsNode,
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
		this.world.refresh();
		for (const [node, animation] of this.creationAnimations) {
			if (this.world.nodes.get(node.id) !== node) {
				animation.tween.stop();
				this.creationAnimations.delete(node);
			}
		}
		const count = this.world.nodes.size;
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
		for (const node of this.world.nodes.values()) {
			this.nodeIds.push(node.id);
			this.transform.position.copy(node.position);
			this.transform.lookAt(ORIGIN);
			const creationScale = this.creationAnimations.get(node)?.state.scale ?? 1;
			const radius = node.radius === NODE_RADIUS ? NODE_RADIUS : JOINT_RADIUS;
			this.transform.scale.setScalar(radius * 2 * (node.heldBy === undefined ? 1 : 1.35) * creationScale);
			this.transform.updateMatrix();
			this.dots.setMatrixAt(index, this.transform.matrix);
			// A held dot turns red once it is deep enough in the floor to be deleted on release.
			this.dots.setColorAt(index, node.heldBy !== undefined && this.world.isBelowFloor(node) ? DELETE_COLOR : node.color);
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

	pick(direction: THREE.Vector3): PhysicsNode | undefined {
		this.syncNodes();
		this.updateWorldMatrix(true, true);
		this.raycaster.set(ORIGIN, direction.clone().normalize());
		const intersections = this.raycaster.intersectObject(this.hits!, false);
		let closest: PhysicsNode | undefined;
		let bestCosine = -Infinity;
		for (const hit of intersections) {
			if (hit.instanceId === undefined) continue;
			const node = this.world.nodes.get(this.nodeIds[hit.instanceId]);
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

	private syncFill() {
		const triangles = Array.from(this.world.bodies.values()).flatMap(({ nodes, triangles }) =>
			triangles.map((indices) => indices.map((index) => nodes[index])),
		).map((corners) => {
			const [a, b, c] = corners.map((node) => node.position);
			const widest = Math.max(a.angleTo(b), b.angleTo(c), a.angleTo(c));
			const divisions = THREE.MathUtils.clamp(Math.ceil(widest / FILL_STEP), 1, MAX_FILL_DIVISIONS);
			return { nodes: corners, divisions };
		});
		const required = triangles.reduce((sum, { divisions }) => sum + divisions * divisions * 3, 0);
		if (required > this.fillCapacity || !this.fillGeometry.hasAttribute("position")) {
			this.fillCapacity = Math.max(1024, 2 ** Math.ceil(Math.log2(Math.max(1, required))));
			this.fillGeometry.dispose();
			for (const name of ["position", "color"]) {
				this.fillGeometry.setAttribute(name,
					new THREE.BufferAttribute(new Float32Array(this.fillCapacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
			}
		}
		const positions = this.fillGeometry.getAttribute("position") as THREE.BufferAttribute;
		const colors = this.fillGeometry.getAttribute("color") as THREE.BufferAttribute;
		const point = new THREE.Vector3();
		let vertex = 0;
		for (const { nodes: [a, b, c], divisions: n } of triangles) {
			// (i, j) are the grid steps towards b and c; the remainder is the weight of a.
			const write = (i: number, j: number) => {
				const k = n - i - j;
				point.set(0, 0, 0)
					.addScaledVector(a.position, k).addScaledVector(b.position, i).addScaledVector(c.position, j)
					.normalize().multiplyScalar(FILL_RADIUS);
				positions.setXYZ(vertex, point.x, point.y, point.z);
				colors.setXYZ(vertex++,
					(a.fillColor.r * k + b.fillColor.r * i + c.fillColor.r * j) / n,
					(a.fillColor.g * k + b.fillColor.g * i + c.fillColor.g * j) / n,
					(a.fillColor.b * k + b.fillColor.b * i + c.fillColor.b * j) / n);
			};
			for (let i = 0; i < n; i++) {
				for (let j = 0; j < n - i; j++) {
					write(i, j); write(i + 1, j); write(i, j + 1);
					if (j < n - i - 1) { write(i + 1, j); write(i + 1, j + 1); write(i, j + 1); }
				}
			}
		}
		this.fillGeometry.setDrawRange(0, vertex);
		positions.needsUpdate = colors.needsUpdate = true;
	}

	sync() {
		this.environment.setFloor(this.world.floorHeight);
		this.syncNodes();
		this.syncFill();
		// The diagonals that cut shapes into triangles are drawn thin; the other hidden edges stay hidden.
		const seams = new Set<string>();
		for (const { nodes, triangles } of this.world.bodies.values()) {
			for (const triangle of triangles) {
				triangle.forEach((index, k) => {
					const next = triangle[(k + 1) % triangle.length];
					const gap = Math.abs(index - next);
					if (gap !== 1 && gap !== nodes.length - 1) seams.add(edgeKey(nodes[index].id, nodes[next].id));
				});
			}
		}
		const edges = Array.from(this.world.edges.values())
			.filter((edge) => !edge.internal || seams.has(edge.key))
			.map((edge) => {
				const angle = edge.source.position.angleTo(edge.target.position);
				// Only edges with both ends held can snap, so only they thin out.
				const held = edge.source.heldBy !== undefined && edge.target.heldBy !== undefined;
				const thickness = held ? edgeThickness(edge, angle) : 1;
				return {
					...edge,
					angle,
					halfWidth: (edge.internal ? SEAM_HALF_WIDTH : edge.body ? OUTLINE_HALF_WIDTH : ROD_RADIUS) * thickness,
				};
			});
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
				nextLeft.copy(point).multiplyScalar(Math.cos(edge.halfWidth)).addScaledVector(normal, Math.sin(edge.halfWidth)).multiplyScalar(EDGE_RADIUS);
				nextRight.copy(point).multiplyScalar(Math.cos(edge.halfWidth)).addScaledVector(normal, -Math.sin(edge.halfWidth)).multiplyScalar(EDGE_RADIUS);
				nextColor.copy(edge.source.edgeColor).lerp(edge.target.edgeColor, t);
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
		this.environment.dispose();
		this.dots?.dispose();
		this.hits?.dispose();
		this.dotGeometry.dispose();
		this.hitGeometry.dispose();
		this.edgeGeometry.dispose();
		this.fillGeometry.dispose();
		this.dotMaterial.dispose();
		this.hitMaterial.dispose();
		this.edgeMaterial.dispose();
		this.fillMaterial.dispose();
		this.texture.dispose();
		this.clear();
	}
}
