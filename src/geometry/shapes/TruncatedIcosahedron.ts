import * as THREE from "three";
import { BaseSolid } from "./BaseSolid";
import { getRandomColor } from "@/utils/functions";

export class TruncatedIcosahedron extends BaseSolid {
	public vertices: THREE.Vector3[];
	public edges: [number, number][];
	public adjacency: number[][];
	public pentGroup: THREE.Group;
	public hexGroup: THREE.Group;

	constructor() {
		super();

		this.vertices = this.generateVerticesAndEdges();

		//
		// Build edge list by thresholding the minimum non-zero distance (edge length).
		//
		let minDist = Infinity;
		for (let i = 0; i < this.vertices.length; i++) {
			for (let j = i + 1; j < this.vertices.length; j++) {
				const d = this.vertices[i].distanceTo(this.vertices[j]);
				if (d > 1e-9 && d < minDist) minDist = d;
			}
		}
		const edgeThresh = minDist * 1.2; // 20% tolerance
		this.edges = [];
		for (let i = 0; i < this.vertices.length; i++) {
			for (let j = i + 1; j < this.vertices.length; j++) {
				const d = this.vertices[i].distanceTo(this.vertices[j]);
				if (d <= edgeThresh) this.edges.push([i, j]);
			}
		}
		// edges.length should be 90
		console.assert(
			this.edges.length == 90,
			`Expected 90 edges, not ${this.edges.length}`
		);

		//
		// Build adjacency lists
		//
		this.adjacency = Array.from({ length: this.vertices.length }, () => []);
		for (const [a, b] of this.edges) {
			this.adjacency[a].push(b);
			this.adjacency[b].push(a);
		}

		//
		// Helper: given a vertex index v, sort its neighbor indices in CCW order around the vertex
		// using a local tangent basis (u,v) and angle = atan2(dot(nbr, vBasisV), dot(nbr, vBasisU))
		// where nbr vector is neighbor position projected onto plane orthogonal to normal.
		//

		const sortedAdj: number[][] = this.adjacency.map((_, i) =>
			this.sortedNeighborsAroundVertex(i)
		);

		//
		// Face-walking: for each directed edge (a -> b), the next edge is (b -> c) where c is the neighbor
		// after 'a' in b's sorted neighbor list. Walk until we return to the starting directed edge.
		// This extracts each face exactly once (or twice with opposite orientation): we dedupe by canonical sorted key.
		//
		const faceSet = new Map<string, number[]>(); // canonicalKey -> face vertex indices in order

		for (let a = 0; a < this.vertices.length; a++) {
			for (const b of sortedAdj[a]) {
				// walk face starting from directed edge a->b
				const startA = a,
					startB = b;
				const face: number[] = [startA];
				let currA = startA,
					currB = startB;
				const maxIter = 30;
				let it = 0;
				while (true) {
					it++;
					if (it > 200) break;
					// append currB if it's not the starting vertex
					if (face[face.length - 1] !== currB) face.push(currB);

					// find index of currA in sortedAdj[currB]
					const nbrsOfB = sortedAdj[currB];
					const idx = nbrsOfB.indexOf(currA);
					if (idx === -1) break; // shouldn't happen
					// next neighbor is the neighbor before currA in the CCW list (to walk the face in consistent direction)
					// we choose previous neighbor to follow face around; pick (idx - 1 + len) % len
					const nextIdx = (idx - 1 + nbrsOfB.length) % nbrsOfB.length;
					const nextC = nbrsOfB[nextIdx];

					// advance
					const nextA = currB;
					const nextB = nextC;

					// if we've returned to starting directed edge, stop
					if (nextA === startA && nextB === startB) break;

					currA = nextA;
					currB = nextB;
					// safety stop for very long loops
					if (face.length > maxIter) break;
				}

				// normalize face representation (rotate so smallest index first, and canonical orientation)
				// produce canonical key as sorted sequence string (unique for same set)
				const key = [...face].sort((x, y) => x - y).join(",");
				if (!faceSet.has(key) && face.length >= 3) {
					faceSet.set(key, face);
				}
			}
		}

		const faces = Array.from(faceSet.values());
		// We expect 32 faces (12 pentagons + 20 hexagons)
		console.assert(
			faces.length == 32,
			`Expected 32 faces, got ${faces.length}`
		);

		// Separate pentagon/hexagon faces and build triangularized meshes
		const pentFaces: number[][] = [];
		const hexFaces: number[][] = [];
		for (const f of faces) {
			if (f.length === 6) pentFaces.push(f);
			else if (f.length === 7) hexFaces.push(f);
			else {
				// in case the algorithm produced reversed or duplicate orientation, try to ignore
				// console.warn("unexpected face length", f.length, f);
			}
		}
		console.assert(
			pentFaces.length == 12,
			`Expected 12 pentagons, got ${pentFaces.length}`
		);
		console.assert(
			hexFaces.length == 20,
			`Expected 20 hexagons, got ${hexFaces.length}`
		);

		this.pentGroup = new THREE.Group();
		this.pentGroup.name = "pentagons";
		pentFaces.forEach((f, idx) => {
			const col = getRandomColor();
			const m = this.createPolygonMesh(f, 0xdddddd);
			// slight push outward/inward to sit nicely (optional)
			// compute centroid direction to nudge by a tiny epsilon to avoid z-fighting with edges
			const centroid = new THREE.Vector3();
			f.forEach((i) => centroid.add(this.vertices[i]));
			centroid.multiplyScalar(1 / f.length).normalize();
			m.position.addScaledVector(centroid, 0); // already in world positions; no shift
			m.renderOrder = 1;
			(m.userData as any).faceType = "pentagon";
			(m.userData as any).tileIndex = Math.floor(Math.random() * 4);
			this.pentGroup.add(m);
		});

		this.hexGroup = new THREE.Group();
		this.hexGroup.name = "hexagons";
		hexFaces.forEach((f) => {
			const col = getRandomColor();
			const mesh = this.createPolygonMesh(f, 0xdddddd);
			mesh.renderOrder = 1;
			(mesh.userData as any).faceType = "hexagon";
			(mesh.userData as any).tileIndex = Math.floor(Math.random() * 4);
			this.hexGroup.add(mesh);
		});
	}

	// Build truncated-icosahedron vertex set via canonical closed-form coordinates
	// (even permutations of three base triples). This yields 60 vertices.
	// We'll then detect edges by nearest neighbor distance and extract faces.
	generateVerticesAndEdges() {
		const phi = (1 + Math.sqrt(5)) / 2;

		function pushPermutations(base: number[], out: THREE.Vector3[]) {
			// even (cyclic) permutations: (a,b,c), (b,c,a), (c,a,b)
			const perms = [
				[base[0], base[1], base[2]],
				[base[1], base[2], base[0]],
				[base[2], base[0], base[1]],
			];
			for (const p of perms) {
				// discover non-zero indices so we can sign-flip them
				const nonzeroIdxs = p
					.map((v, i) => (Math.abs(v) > 1e-9 ? i : -1))
					.filter((i) => i >= 0);
				const combos = 1 << nonzeroIdxs.length;
				for (let mask = 0; mask < combos; mask++) {
					const q = p.slice();
					for (let bit = 0; bit < nonzeroIdxs.length; bit++) {
						const idx = nonzeroIdxs[bit];
						if ((mask >> bit) & 1) q[idx] = -q[idx];
					}
					out.push(new THREE.Vector3(q[0], q[1], q[2]));
				}
			}
		}

		const vertices: THREE.Vector3[] = [];
		pushPermutations([0, 1, 3 * phi], vertices); // (0, ±1, ±3φ)
		pushPermutations([1, 2 + phi, 2 * phi], vertices); // (±1, ±(2+φ), ±2φ)
		pushPermutations([phi, 2, 2 * phi + 1], vertices); // (±φ, ±2, ±(2φ+1))

		console.assert(
			vertices.length == 60,
			`Expected 60 vertices, got ${vertices.length}`
		);

		// Scale vertices to desired radius (distance from origin)
		// const desiredRadius = 10;
		// let avgR = 0;
		// for (const v of vertices) avgR += Math.hypot(v.x, v.y, v.z);
		// avgR /= vertices.length;
		// const scale = desiredRadius / avgR;
		// vertices.forEach((v) => v.multiplyScalar(scale));

		return vertices;
	}

	sortedNeighborsAroundVertex(vi: number): number[] {
		const center = this.vertices[vi].clone().normalize(); // normal direction of vertex on unit sphere
		// build orthonormal basis (ux, uy) on the tangent plane
		const arbitrary =
			Math.abs(center.x) < 0.9
				? new THREE.Vector3(1, 0, 0)
				: new THREE.Vector3(0, 1, 0);
		const ux = new THREE.Vector3().crossVectors(center, arbitrary).normalize();
		const uy = new THREE.Vector3().crossVectors(center, ux).normalize();
		const nbrs = this.adjacency[vi].slice();
		nbrs.sort((ia, ib) => {
			const va = this.vertices[ia].clone().sub(this.vertices[vi]).normalize();
			const vb = this.vertices[ib].clone().sub(this.vertices[vi]).normalize();
			const ax = va.dot(ux),
				ay = va.dot(uy);
			const bx = vb.dot(ux),
				by = vb.dot(uy);
			const aa = Math.atan2(ay, ax);
			const bb = Math.atan2(by, bx);
			return aa - bb;
		});
		return nbrs;
	}

	//
	// Create Meshes: triangulate each polygon by centroid fan. Use 50% alpha materials.
	// We set depthWrite=false on transparent meshes and set renderOrder to avoid sorting flicker.
	//
	createPolygonMesh(indices: number[], colorHex: number, opacity = 0.5) {
		// compute centroid
		const centroid = new THREE.Vector3();
		indices.forEach((i) => centroid.add(this.vertices[i]));
		centroid.multiplyScalar(1 / indices.length);

		// build triangle positions (centroid, vi, vnext)
		const pos: number[] = [];
		for (let k = 0; k < indices.length; k++) {
			const i0 = indices[k];
			const i1 = indices[(k + 1) % indices.length];
			const c = centroid;
			const v0 = this.vertices[i0],
				v1 = this.vertices[i1];
			pos.push(c.x, c.y, c.z, v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
		}
		const geom = new THREE.BufferGeometry();
		geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
		geom.computeVertexNormals();

		const mat = new THREE.MeshBasicMaterial({
			color: colorHex,
			transparent: true,
			opacity,
			side: THREE.DoubleSide,
			depthWrite: false,
		});

		const mesh = new THREE.Mesh(geom, mat);
		// store metadata for interaction
		(mesh.userData as any).faceIndices = indices.slice();
		return mesh;
	}
}
