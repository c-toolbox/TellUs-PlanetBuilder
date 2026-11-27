import * as THREE from "three";
import earcut from "earcut";

import circle from "@/assets/textures/circle.png";
import { Tile } from "./TileManager";

import { VERTEX_DISTANCE, EDGE_DISTANCE, FACE_DISTANCE } from "./constants";
import { TileMesh } from "./TileMesh";
import { TileBatch } from "./TileBatch";
import type { TileEdge } from "./WorldSceneConfig";

export class Polyhedra {
	private vertices: THREE.Vector3[];
	private edges: [number, number][];
	private faces: number[][];

	private edgeMap: Map<string, number> = new Map<string, number>();
	private readonly tiles: TileMesh[] = [];
	private faceBatch!: TileBatch;
	private vertexInstances!: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
	private edgeInstances!: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
	private vertexTransforms!: Float32Array;
	private edgeTransforms!: Float32Array;
	private visibleEdges!: Uint8Array;
	private visibleVertices!: Uint8Array;
	private visibleEdgeCounts!: Int32Array;
	private visibleEdgeTotal = 0;
	private edgeFaces: number[][] = [];

	private edgeSize: number;
	private edgeColor: string;
	private vertexSize: number;
	private vertexColor: string;

	public vertexGroup: THREE.Group;
	public edgeGroup: THREE.Group;
	public faceGroup: THREE.Group;

	private circleTexture: THREE.Texture | null = null;

	constructor({
		vertices,
		edges,
		faces,
		edgeSize,
		edgeColor,
	}: {
		vertices: number[][];
		edges: number[][];
		faces: number[][];
		edgeSize: number;
		edgeColor: string;
	}) {
		this.vertices = vertices.map((v) => new THREE.Vector3(v[0], v[1], v[2]));
		this.edges = edges as [number, number][];
		this.faces = faces;

		this.edgeSize = edgeSize;
		this.edgeColor = edgeColor;
		this.vertexSize = edgeSize;
		this.vertexColor = edgeColor;

		this.vertexGroup = new THREE.Group();
		this.edgeGroup = new THREE.Group();
		this.faceGroup = new THREE.Group();

		this.initVertices();
		this.initEdges();
		this.initFaces();
		this.buildNeighbors();
	}

	// Every dot shares one geometry, material, and instanced draw.
	initVertices() {
		const textureLoader = new THREE.TextureLoader();
		const circleTexture = textureLoader.load(circle);
		this.circleTexture = circleTexture;
		const material = new THREE.MeshBasicMaterial({
			map: circleTexture,
			color: this.vertexColor,
			transparent: true,
			premultipliedAlpha: true,
			depthWrite: false, // keeps edges from z-fighting
			side: THREE.FrontSide,
		});

		const geometry = new THREE.PlaneGeometry(1, 1);

		this.vertexInstances = new THREE.InstancedMesh(geometry, material, this.vertices.length);
		this.vertexInstances.frustumCulled = false;
		this.vertexInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.vertexTransforms = new Float32Array(this.vertices.length * 16);
		this.visibleVertices = new Uint8Array(this.vertices.length).fill(1);
		this.visibleEdgeCounts = new Int32Array(this.vertices.length);
		const temporary = new THREE.Object3D();
		this.vertices.forEach((vertex, i) => {
			temporary.position.copy(vertex).setLength(VERTEX_DISTANCE);
			temporary.lookAt(0, 0, 0);
			temporary.updateMatrix();
			temporary.matrix.toArray(this.vertexTransforms, i * 16);
		});
		this.vertexInstances.instanceMatrix.array.set(this.vertexTransforms);
		this.updateVertexSizes();
		this.vertexGroup.add(this.vertexInstances);
	}

	// Create a cylinder on every edge
	// Create billboarded quads for edges (always face the origin)
	initEdges() {
		this.visibleEdges = new Uint8Array(this.edges.length).fill(1);
		this.visibleEdgeTotal = this.edges.length;
		this.edgeFaces = this.edges.map(() => []);
		for (let i = 0; i < this.edges.length; i++) {
			const [ia, ib] = this.edges[i];

			this.visibleEdgeCounts[ia]++;
			this.visibleEdgeCounts[ib]++;
		}

		/* Set up edge instanced mesh */

		const material = new THREE.MeshBasicMaterial({
			color: this.edgeColor,
			depthWrite: true,
			side: THREE.FrontSide,
		});

		const quad = new THREE.PlaneGeometry(1, 1);
		const instanced = new THREE.InstancedMesh(
			quad,
			material,
			this.edges.length,
		);
		this.edgeInstances = instanced;
		instanced.frustumCulled = false;
		instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

		const tmp = new THREE.Object3D();

		for (let i = 0; i < this.edges.length; i++) {
			const [ia, ib] = this.edges[i];

			// Store for neighbor check later
			const key = ia < ib ? `${ia}_${ib}` : `${ib}_${ia}`;
			this.edgeMap.set(key, i);

			// Place endpoints on the sphere of radius EDGE_DISTANCE
			const a = this.vertices[ia].clone().setLength(EDGE_DISTANCE);
			const b = this.vertices[ib].clone().setLength(EDGE_DISTANCE);

			// Midpoint in world space
			const mid = a.clone().add(b).multiplyScalar(0.5);

			// Vector along the edge
			const edgeDir = b.clone().sub(a);
			const length = edgeDir.length();
			if (length === 0) continue;

			// Radial direction (outward from origin)
			const radial = mid.clone().normalize();

			// Project edge direction into tangent plane at midpoint
			let tangent = edgeDir.clone().projectOnPlane(radial);
			if (tangent.lengthSq() < 1e-10) {
				// Fallback if edge is nearly radial
				tangent = new THREE.Vector3(1, 0, 0).projectOnPlane(radial);
				if (tangent.lengthSq() < 1e-10) {
					tangent = new THREE.Vector3(0, 1, 0).projectOnPlane(radial);
				}
			}
			tangent.normalize();

			// Construct an orthonormal basis:
			const x = tangent;
			const z = radial.clone().negate();
			const y = new THREE.Vector3().crossVectors(z, x).normalize();

			// Fix x = y × z to ensure orthogonality
			x.copy(new THREE.Vector3().crossVectors(y, z).normalize());

			// Apply transform to temp object
			tmp.position.copy(mid);
			tmp.quaternion.setFromRotationMatrix(
				new THREE.Matrix4().makeBasis(x, y, z),
			);

			// Scale: width = edge length, height = angular thickness
			tmp.scale.set(length, 1, 1);

			tmp.updateMatrix();
			instanced.setMatrixAt(i, tmp.matrix);
		}

		this.edgeTransforms = new Float32Array(instanced.instanceMatrix.array);
		this.updateEdgeSizes();
		this.edgeGroup.add(instanced);
	}

	// Create textured polygons for every face
	initFaces() {
		this.faces.forEach((face) => {
			const vertices = face.map((i) => this.vertices[i]);

			const mesh = this.createMesh(vertices);

			mesh.setTile(Tile.None);

			this.tiles.push(mesh);
		});
		this.faceBatch = new TileBatch(this.tiles);
		this.faceGroup.add(this.faceBatch);
	}

	createMesh(vertices: THREE.Vector3[]): TileMesh {
		if (vertices.length < 3)
			throw new Error("At least 3 vertices are required.");

		// Step 1: Compute the plane normal (faces the center of vertices)
		const center = new THREE.Vector3();
		vertices.forEach((v) => center.add(v));
		center.divideScalar(vertices.length);
		const normal = center.clone().normalize().negate();

		// Step 2: Create 2D plane coordinate system
		let tangentY = new THREE.Vector3(0, 1, 0);
		if (Math.abs(normal.dot(tangentY)) > 0.999) tangentY.set(0, 0, 1);
		tangentY = tangentY.clone().projectOnPlane(normal).normalize();
		const tangentX = new THREE.Vector3()
			.crossVectors(tangentY, normal)
			.normalize();

		// Step 3: Project vertices to plane and compute 2D coordinates
		const points2D: THREE.Vector2[] = vertices.map((v) => {
			const x = v.dot(tangentX);
			const y = v.dot(tangentY);
			return new THREE.Vector2(x, y);
		});

		// Step 4: Normalize UVs with aspect ratio preserved

		// Compute polygon centroid (area-weighted)
		let area = 0;
		let cx = 0;
		let cy = 0;
		for (let i = 0; i < points2D.length; i++) {
			const j = (i + 1) % points2D.length;
			const xi = points2D[i].x;
			const yi = points2D[i].y;
			const xj = points2D[j].x;
			const yj = points2D[j].y;

			const cross = xi * yj - xj * yi;
			area += cross;
			cx += (xi + xj) * cross;
			cy += (yi + yj) * cross;
		}
		area *= 0.5;
		if (area === 0) {
			// fallback: average of vertices
			cx = points2D.reduce((s, p) => s + p.x, 0) / points2D.length;
			cy = points2D.reduce((s, p) => s + p.y, 0) / points2D.length;
		} else {
			cx /= 6 * area;
			cy /= 6 * area;
		}
		const center2D = new THREE.Vector2(cx, cy);

		// Compute ranges for uniform scale
		let minX = Infinity,
			minY = Infinity;
		let maxX = -Infinity,
			maxY = -Infinity;
		points2D.forEach((p) => {
			if (p.x < minX) minX = p.x;
			if (p.y < minY) minY = p.y;
			if (p.x > maxX) maxX = p.x;
			if (p.y > maxY) maxY = p.y;
		});
		const rangeX = maxX - minX;
		const rangeY = maxY - minY;
		const scale = Math.max(rangeX, rangeY);

		// Map UVs so centroid → (0.5, 0.5)
		const uvCoords = points2D.map((p) => {
			const u = 0.5 + (p.x - center2D.x) / scale;
			const v = 0.5 + (p.y - center2D.y) / scale;
			return new THREE.Vector2(u, v);
		});

		// Step 5: Triangulate polygon using Earcut
		const flattened: number[] = [];
		points2D.forEach((p) => {
			flattened.push(p.x, p.y);
		});
		const indices = earcut(flattened);

		// Step 6: Build BufferGeometry
		const geometry = new THREE.BufferGeometry();
		const positions = new Float32Array(vertices.length * 3);
		for (let i = 0; i < vertices.length; i++) {
			positions[i * 3 + 0] = vertices[i].x;
			positions[i * 3 + 1] = vertices[i].y;
			positions[i * 3 + 2] = vertices[i].z;
		}
		geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

		const uvs = new Float32Array(uvCoords.length * 2);
		for (let i = 0; i < uvCoords.length; i++) {
			uvs[i * 2 + 0] = uvCoords[i].x;
			uvs[i * 2 + 1] = uvCoords[i].y;
		}
		geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

		geometry.setIndex(indices);

		// Step 7: Create mesh
		const material = new THREE.MeshBasicMaterial({
			transparent: true,
			side: THREE.FrontSide,
		});
		const mesh = new TileMesh(geometry, material);
		mesh.scale.multiplyScalar(FACE_DISTANCE);
		mesh.recenterToGeometryCenter();

		return mesh;
	}

	buildNeighbors() {
		const edgeToData = new Map<
			string,
			{ faces: number[]; edgeIndex: number }
		>();

		// Step 1: Build combined map (faces + edge index)
		for (let faceIndex = 0; faceIndex < this.faces.length; faceIndex++) {
			const face = this.faces[faceIndex];

			for (let i = 0; i < face.length; i++) {
				const a = face[i];
				const b = face[(i + 1) % face.length];

				const key = a < b ? `${a}_${b}` : `${b}_${a}`;
				const edgeIndex = this.edgeMap.get(key);

				if (edgeIndex === undefined) {
					console.warn("Edge not found in edgeMap:", key);
					continue;
				}
				this.edgeFaces[edgeIndex].push(faceIndex);

				if (!edgeToData.has(key)) {
					edgeToData.set(key, {
						faces: [],
						edgeIndex,
					});
				}

				edgeToData.get(key)!.faces.push(faceIndex);
			}
		}

		// Step 2: Assign neighbors
		const meshes = this.tiles;

		for (const { faces, edgeIndex } of edgeToData.values()) {
			if (faces.length !== 2) continue;

			const [a, b] = faces;

			meshes[a].neighbors.push({
				mesh: meshes[b],
				edgeIndex,
			});

			meshes[b].neighbors.push({
				mesh: meshes[a],
				edgeIndex,
			});
		}
	}

	// Geometry belongs to the globe; biome textures belong to TileManager.
	dispose() {
		this.faceBatch.dispose();
		for (const tile of this.tiles) {
			tile.geometry.dispose();
			tile.material.dispose();
		}
		for (const mesh of [this.vertexInstances, this.edgeInstances]) {
			mesh.dispose();
			mesh.geometry.dispose();
			mesh.material.dispose();
		}
		for (const group of [this.vertexGroup, this.edgeGroup, this.faceGroup]) {
			group.removeFromParent();
			group.clear();
		}
		this.circleTexture?.dispose();
		this.circleTexture = null;
	}

	setVertexVisible(index: number, visible: boolean) {
		if (this.visibleVertices[index] === Number(visible)) return;
		this.visibleVertices[index] = Number(visible);
		this.writeVertexScale(index);
		this.vertexInstances.instanceMatrix.needsUpdate = true;
	}

	setEdgeVisible(index: number, visible: boolean) {
		if (this.visibleEdges[index] === Number(visible)) return;
		this.visibleEdges[index] = Number(visible);
		const delta = visible ? 1 : -1;
		this.visibleEdgeTotal += delta;
		this.writeEdgeWidth(index);
		this.edgeInstances.instanceMatrix.needsUpdate = true;
		for (const vertex of this.edges[index]) {
			this.visibleEdgeCounts[vertex] += delta;
			this.setVertexVisible(vertex, this.visibleEdgeCounts[vertex] > 0);
		}
		this.edgeInstances.visible = this.visibleEdgeTotal > 0;
		this.vertexInstances.visible = this.visibleEdgeTotal > 0;
	}

	updateEdgeVisibility(mode: TileEdge) {
		this.edgeFaces.forEach((faces, edge) => {
			const sameBiome = faces.length === 2
				&& this.tiles[faces[0]].tile !== Tile.None
				&& this.tiles[faces[0]].tile === this.tiles[faces[1]].tile;
			this.setEdgeVisible(edge, mode !== "hide all" && (mode === "show all" || !sameBiome));
		});
	}

	setEdgeSize(size: number) {
		this.edgeSize = size;
		this.vertexSize = size;
		this.updateEdgeSizes();
		this.updateVertexSizes();
	}

	setEdgeColor(color: string) {
		this.edgeColor = color;
		this.vertexColor = color;
		this.edgeInstances.material.color.setStyle(color);
		this.vertexInstances.material.color.setStyle(color);
	}

	private writeEdgeWidth(index: number) {
		const offset = index * 16;
		const width = this.visibleEdges[index] ? this.edgeSize * EDGE_DISTANCE : 0;
		const target = this.edgeInstances.instanceMatrix.array;
		for (let row = 4; row < 7; row++) {
			target[offset + row] = this.edgeTransforms[offset + row] * width;
		}
	}

	private updateEdgeSizes() {
		for (let i = 0; i < this.edges.length; i++) this.writeEdgeWidth(i);
		this.edgeInstances.instanceMatrix.needsUpdate = true;
	}

	private writeVertexScale(index: number) {
		const offset = index * 16;
		const scale = this.visibleVertices[index] ? this.vertexSize * VERTEX_DISTANCE : 0;
		const target = this.vertexInstances.instanceMatrix.array;
		for (let column = 0; column < 3; column++) {
			for (let row = 0; row < 3; row++) {
				const component = offset + column * 4 + row;
				target[component] = this.vertexTransforms[component] * scale;
			}
		}
	}

	private updateVertexSizes() {
		for (let i = 0; i < this.vertices.length; i++) this.writeVertexScale(i);
		this.vertexInstances.instanceMatrix.needsUpdate = true;
	}

	pickTile(raycaster: THREE.Raycaster): TileMesh | undefined {
		return this.faceBatch.pick(raycaster);
	}

	get tileMeshes(): TileMesh[] {
		return this.tiles;
	}
}
