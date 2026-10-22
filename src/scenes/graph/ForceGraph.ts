import * as THREE from "three";
import { arcNormal } from "./sphericalGraph";

export interface GraphModel {
	vertices: readonly (readonly number[])[];
	edges: readonly (readonly number[])[];
}

export interface GraphSettings {
	repulsion: number;
	springStrength: number;
	springLength: number;
	friction: number;
}

export interface GraphNode {
	readonly id: number;
	readonly position: THREE.Vector3;
	readonly velocity: THREE.Vector3;
	readonly force: THREE.Vector3;
	readonly color: THREE.Color;
	heldBy?: number;
}

export interface GraphEdge {
	readonly key: string;
	readonly source: GraphNode;
	readonly target: GraphNode;
}

export function edgeKey(a: number, b: number) {
	return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** CPU force solver on the unit sphere. Distances/rest lengths are angular. */
export class ForceGraph {
	readonly nodes = new Map<number, GraphNode>();
	readonly edges = new Map<string, GraphEdge>();
	readonly settings: GraphSettings = {
		repulsion: 0.06,
		springStrength: 8,
		springLength: 1,
		friction: 4,
	};
	baseLength = 0.3;
	private nextId = 0;
	private readonly delta = new THREE.Vector3();
	private readonly tangent = new THREE.Vector3();
	private readonly normal = new THREE.Vector3();

	load(model: GraphModel) {
		this.nodes.clear();
		this.edges.clear();
		this.nextId = 0;
		model.vertices.forEach((vertex) => this.addNode(new THREE.Vector3(...vertex)));
		model.edges.forEach(([a, b]) => this.addEdge(a, b));
		let totalLength = 0;
		for (const edge of this.edges.values()) totalLength += edge.source.position.angleTo(edge.target.position);
		this.baseLength = this.edges.size ? totalLength / this.edges.size : 0.3;
	}

	addNode(direction: THREE.Vector3) {
		if (!Number.isFinite(direction.lengthSq()) || direction.lengthSq() < 1e-12) return;
		const position = direction.clone().normalize();
		const node: GraphNode = {
			id: this.nextId++, position,
			velocity: new THREE.Vector3(), force: new THREE.Vector3(),
			// Treat the requested XYZ -> RGB mapping as display (sRGB) colour.
			color: new THREE.Color().setRGB(
				(position.x + 1) / 2, (position.y + 1) / 2, (position.z + 1) / 2,
				THREE.SRGBColorSpace,
			),
		};
		this.nodes.set(node.id, node);
		return node;
	}

	removeNode(id: number) {
		if (!this.nodes.delete(id)) return;
		for (const [key, edge] of this.edges) {
			if (edge.source.id === id || edge.target.id === id) this.edges.delete(key);
		}
	}

	addEdge(a: number, b: number) {
		const source = this.nodes.get(a), target = this.nodes.get(b);
		const key = edgeKey(a, b);
		if (!source || !target || a === b || this.edges.has(key)) return false;
		this.edges.set(key, { key, source, target });
		return true;
	}

	step(dt: number) {
		if (!Number.isFinite(dt) || dt <= 0) return;
		// Bound individual steps even when called outside the scene's accumulator.
		dt = Math.min(dt, 1 / 60);
		const nodes = Array.from(this.nodes.values());
		nodes.forEach((node) => node.force.set(0, 0, 0));
		const repulsion = this.settings.repulsion / Math.sqrt(Math.max(1, nodes.length));
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const a = nodes[i], b = nodes[j];
				this.delta.subVectors(a.position, b.position);
				if (this.delta.lengthSq() < 1e-12) {
					// Coincident dots still need a deterministic separating force.
					arcNormal(a.position, b.position, this.normal);
					this.delta.crossVectors(this.normal, a.position).multiplyScalar(0.01);
				}
				const distanceSq = Math.max(this.delta.lengthSq(), 0.0025);
				const strength = repulsion / (distanceSq * Math.sqrt(distanceSq));
				a.force.addScaledVector(this.delta, strength);
				b.force.addScaledVector(this.delta, -strength);
			}
		}

		const restLength = Math.min(Math.PI - 0.01, this.baseLength * this.settings.springLength);
		for (const { source: a, target: b } of this.edges.values()) {
			const cosine = THREE.MathUtils.clamp(a.position.dot(b.position), -1, 1);
			const strength = this.settings.springStrength * (Math.acos(cosine) - restLength);
			this.tangent.copy(b.position).addScaledVector(a.position, -cosine);
			if (this.tangent.lengthSq() < 1e-12) {
				arcNormal(a.position, b.position, this.normal);
				this.tangent.crossVectors(this.normal, a.position);
			}
			a.force.addScaledVector(this.tangent.normalize(), strength);
			this.tangent.copy(a.position).addScaledVector(b.position, -cosine);
			if (this.tangent.lengthSq() < 1e-12) this.tangent.crossVectors(this.normal, a.position);
			b.force.addScaledVector(this.tangent.normalize(), strength);
		}

		const damping = Math.exp(-this.settings.friction * dt);
		for (const node of nodes) {
			if (node.heldBy !== undefined) {
				node.velocity.set(0, 0, 0);
				continue;
			}
			node.force.addScaledVector(node.position, -node.force.dot(node.position)).clampLength(0, 30);
			node.velocity.addScaledVector(node.force, dt).multiplyScalar(damping).clampLength(0, 2);
			node.position.addScaledVector(node.velocity, dt).normalize();
			node.velocity.addScaledVector(node.position, -node.velocity.dot(node.position));
		}
	}
}
