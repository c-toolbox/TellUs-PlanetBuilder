import * as THREE from "three";
import earcut from "earcut";
import { createNoise3D } from "simplex-noise";

import circle from "@/assets/circle.png";

// import tileBeach from "@/assets/tile_beach.png";
// import tileDesert from "@/assets/tile_desert.png";
// import tileForest from "@/assets/tile_forest.png";
// import tileMountain from "@/assets/tile_mountain.png";
// import tileOcean from "@/assets/tile_ocean.png";
// import tileRainforest from "@/assets/tile_rainforest.png";
// import tileSea from "@/assets/tile_sea.png";
// import tileSnow from "@/assets/tile_snow.png";
// import tileWheat from "@/assets/tile_wheat.png";
// import arrow from "@/assets/arrow1.png";
import tileForest from "@/assets/ai_forest.png";
import tileOcean from "@/assets/ai_ocean.png";

const tiles = [
	tileForest,
	tileOcean,
	// arrow,
	// tileBeach,
	// tileDesert,
	// tileForest,
	// tileMountain,
	// tileOcean,
	// tileRainforest,
	// tileSea,
	// tileSnow,
	// tileWheat,
];

const VERTEX_RADIUS = 0.01;
const VERTEX_COLOR = 0xff0000;
const VERTEX_OFFSET = -0.005;

const EDGE_RADIUS = 0.005;
const EDGE_COLOR = 0xffff00;
const EDGE_OFFSET = 0.0;

const FACE_COLOR = 0xffffff;
const FACE_OFFSET = 1.0;

const TEXTURE_SCALE = 1.0;

export class Polyhedra {
	private vertices: THREE.Vector3[];
	private edges: [number, number][];
	private faces: number[][];

	public vertexGroup: THREE.Group;
	public edgeGroup: THREE.Group;
	public faceGroup: THREE.Group;

	constructor({
		vertices,
		edges,
		faces,
	}: {
		vertices: number[][];
		edges: number[][];
		faces: number[][];
	}) {
		this.vertices = vertices.map((v) => new THREE.Vector3(v[0], v[1], v[2]));
		this.edges = edges as [number, number][];
		this.faces = faces;

		this.vertexGroup = new THREE.Group();
		this.edgeGroup = new THREE.Group();
		this.faceGroup = new THREE.Group();

		this.initVertices();
		this.initEdges();
		this.initFaces();
	}

	// Create a sphere on every vertex
	initVertices() {
		const textureLoader = new THREE.TextureLoader();
		const circleTexture = textureLoader.load(circle); // your drawn circle texture

		const material = new THREE.SpriteMaterial({
			map: circleTexture,
			color: VERTEX_COLOR,
			transparent: true,
			// depthWrite: false,
		});

		for (const vertex of this.vertices) {
			const sprite = new THREE.Sprite(material);

			// offset so the billboard is pushed away from the vertex
			const offsetDir = vertex
				.clone()
				.normalize()
				.multiplyScalar(VERTEX_OFFSET * 10);

			sprite.position.copy(vertex).add(offsetDir);

			// scale the sprite so it looks like the sphere would
			sprite.scale.setScalar(VERTEX_RADIUS * 2);

			this.vertexGroup.add(sprite);
		}
	}

	// Create a cylinder on every edge
	initEdges() {
		function createEdgeCylinder(a: THREE.Vector3, b: THREE.Vector3) {
			const vector = new THREE.Vector3().subVectors(b, a);
			const length = vector.length();
			const geometry = new THREE.CylinderGeometry(
				EDGE_RADIUS,
				EDGE_RADIUS,
				length,
				4
			);
			const material = new THREE.MeshBasicMaterial({ color: EDGE_COLOR });
			const mesh = new THREE.Mesh(geometry, material);

			const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

			const offsetDir = mid.clone().normalize().multiplyScalar(EDGE_OFFSET);
			mesh.position.copy(mid).add(offsetDir);

			mesh.quaternion.setFromUnitVectors(
				new THREE.Vector3(0, 1, 0),
				vector.clone().normalize()
			);

			return mesh;
		}

		for (const [ia, ib] of this.edges) {
			const cylinder = createEdgeCylinder(this.vertices[ia], this.vertices[ib]);
			this.edgeGroup.add(cylinder);
		}
	}

	// Create textured polygons for every face
	initFaces() {
		const worldUp = new THREE.Vector3(0, 1, 0);

		const tileTextures: { [key: string]: THREE.Texture } = {};
		tiles.forEach((tile) => {
			const texture = new THREE.TextureLoader().load(tile);
			texture.wrapS = THREE.ClampToEdgeWrapping;
			texture.wrapT = THREE.ClampToEdgeWrapping;
			tileTextures[tile] = texture;
		});

		const noise3D = createNoise3D();

		for (const face of this.faces) {
			const faceVerts = face.map((i) => this.vertices[i]);

			const tile = tiles[Math.floor(Math.random() * tiles.length)];

			const material = new THREE.MeshBasicMaterial({
				map: tileTextures[tile],
				// color: 0xff0000,
				side: THREE.DoubleSide,
				transparent: true,
				opacity: 1,
			});

			const mesh = this.createMesh(faceVerts, material);

			// const c = new THREE.Vector3();
			// mesh.geometry.computeBoundingBox();
			// mesh.geometry.boundingBox!.getCenter(c);
			// c.normalize();
			// const value = 0.5 + 0.5 * noise3D(c.x, c.y, c.z);
			// const color = new THREE.Color(value, value, value);
			// material.color = color;

			this.faceGroup.add(mesh);
		}
	}

	createMesh(vertices: THREE.Vector3[], material: THREE.Material): THREE.Mesh {
		if (vertices.length < 3)
			throw new Error("At least 3 vertices are required.");

		// Step 1: Compute the plane normal (faces the center of vertices)
		const center = new THREE.Vector3();
		vertices.forEach((v) => center.add(v));
		center.divideScalar(vertices.length);
		const normal = center.clone().normalize().negate();

		const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
			normal,
			new THREE.Vector3(0, 0, 0)
		);

		// Step 2: Create 2D plane coordinate system
		let tangentY = new THREE.Vector3(0, 1, 0);
		if (Math.abs(normal.dot(tangentY)) > 0.999) tangentY.set(0, 1, 0);
		tangentY = tangentY.clone().projectOnPlane(normal).normalize();
		const tangentX = new THREE.Vector3()
			.crossVectors(tangentY, normal)
			.normalize();

		// Step 3: Project vertices to plane and compute 2D coordinates
		const points2D: THREE.Vector2[] = vertices.map((v) => {
			const projected = new THREE.Vector3();
			plane.projectPoint(v, projected);
			const x = projected.dot(tangentX);
			const y = projected.dot(tangentY);
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
		const scale = Math.max(rangeX, rangeY) * TEXTURE_SCALE;

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
		geometry.computeVertexNormals();

		// Step 7: Create mesh
		const mesh = new THREE.Mesh(geometry, material);
		mesh.position.add(normal.clone().negate().multiplyScalar(FACE_OFFSET));

		return mesh;
	}
}
