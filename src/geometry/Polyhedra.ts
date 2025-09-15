import * as THREE from "three";
import earcut from "earcut";
import { createNoise3D } from "simplex-noise";

import circle from "@/assets/circle.png";

import tileBeach from "@/assets/tile_beach.png";
import tileDesert from "@/assets/tile_desert.png";
import tileForest from "@/assets/tile_forest.png";
import tileMountain from "@/assets/tile_mountain.png";
import tileOcean from "@/assets/tile_ocean.png";
import tileRainforest from "@/assets/tile_rainforest.png";
import tileSnow from "@/assets/tile_snow.png";
import tileSea from "@/assets/tile_sea.png";
// import tileWheat from "@/assets/tile_wheat.png";
// import arrow from "@/assets/arrow1.png";

// import tileDesert from "@/assets/ai_desert.png";
// import tileForest from "@/assets/ai_forest.png";
// import tileRainforest from "@/assets/ai_spruce.png";
// import tileOcean from "@/assets/ai_ocean.png";
// import tileSnow from "@/assets/ai_snow.png";
// import tileMountain from "@/assets/ai_mountain.jpg";

import fish from "@/assets/fish.png";

const tiles = [
	// tileForest,
	// tileOcean,
	// arrow,

	tileSnow,
	tileOcean,
	tileSea,
	tileBeach,
	tileForest,
	tileRainforest,
	tileMountain,
	tileDesert,

	// tileWheat,
];

const VERTEX_SIZE = 0.01;
const VERTEX_COLOR = 0x000000;
const VERTEX_DISTANCE = 1.0;

const EDGE_SIZE = 0.003;
const EDGE_COLOR = 0x000000;
const EDGE_DISTANCE = 1.25;

const FACE_DISTANCE = 1.5;

const TEXTURE_SCALE = 0.7;

export class Polyhedra {
	private vertices: THREE.Vector3[];
	private edges: [number, number][];
	private faces: number[][];

	public vertexGroup: THREE.Group;
	public edgeGroup: THREE.Group;
	public faceGroup: THREE.Group;
	public animalGroup: THREE.Group;

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
		this.animalGroup = new THREE.Group();

		this.initVertices();
		this.initEdges();
		this.initFaces();
		this.initAnimals();
	}

	// Create a sphere on every vertex
	initVertices() {
		const textureLoader = new THREE.TextureLoader();
		const circleTexture = textureLoader.load(circle);

		const material = new THREE.SpriteMaterial({
			map: circleTexture,
			color: VERTEX_COLOR,
			premultipliedAlpha: true,
		});

		for (const vertex of this.vertices) {
			const sprite = new THREE.Sprite(material);

			sprite.scale.setScalar(VERTEX_SIZE * 1.0);

			sprite.position.copy(vertex);
			sprite.position.setLength(VERTEX_DISTANCE);
			sprite.scale.multiplyScalar(VERTEX_DISTANCE);

			this.vertexGroup.add(sprite);
		}
	}

	// Create a cylinder on every edge
	initEdges() {
		function createEdgeCylinder(a: THREE.Vector3, b: THREE.Vector3) {
			const vector = new THREE.Vector3().subVectors(b, a);
			const length = vector.length();
			const geometry = new THREE.CylinderGeometry(
				EDGE_SIZE / 2,
				EDGE_SIZE / 2,
				length,
				4
			);
			const material = new THREE.MeshBasicMaterial({ color: EDGE_COLOR });
			const mesh = new THREE.Mesh(geometry, material);

			const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

			mesh.position.copy(mid);
			mesh.position.setLength(EDGE_DISTANCE);
			mesh.scale.multiplyScalar(EDGE_DISTANCE);

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
		function getTile(temperature: number, height: number) {
			if (temperature < 0.25) return tileSnow;
			if (height < 0.01) return tileOcean;
			// if (height < 0.4) return tileSea;
			// if (height < 0.4) return tileBeach;
			if (temperature < 0.5) return tileMountain;
			if (height < 0.6) return tileRainforest;
			if (temperature < 0.5) return tileRainforest;
			if (temperature < 0.95) return tileForest;
			return tileDesert;
		}

		const worldUp = new THREE.Vector3(0, 1, 0);

		const tileTextures: { [key: string]: THREE.Texture } = {};
		tiles.forEach((tile) => {
			const texture = new THREE.TextureLoader().load(tile);
			texture.wrapS = THREE.ClampToEdgeWrapping;
			texture.wrapT = THREE.ClampToEdgeWrapping;
			tileTextures[tile] = texture;
		});

		const noise3D = createNoise3D();
		let heights: number[] = [];
		let temperatures: number[] = [];

		for (const face of this.faces) {
			const faceVerts = face.map((i) => this.vertices[i]);

			const material = new THREE.MeshBasicMaterial({
				// map: tileTextures[tile],
				color: 0xffffff,
				side: THREE.DoubleSide,
				transparent: true,
				opacity: 1.0,
			});

			const mesh = this.createMesh(faceVerts, material);

			const c = new THREE.Vector3();
			mesh.geometry.computeBoundingBox();
			mesh.geometry.boundingBox!.getCenter(c);
			c.normalize();

			const pitch =
				(2 * Math.atan2(c.y, Math.sqrt(c.x * c.x + c.z * c.z))) / Math.PI;
			const n = noise3D(3 * c.x + 3.33, 3 * c.y + 3.33, 3 * c.z + 3.33);
			const temperature = 1 - Math.abs(pitch) + 0.1 * n;
			// material.color.setHex(0x0000ff);
			// material.color.lerp(new THREE.Color(0xff0000), temperature);

			const k1 = 0.8;
			const k2 = 4.0;
			let height =
				0.8 * noise3D(k1 * c.x, k1 * c.y, k1 * c.z) +
				0.2 * noise3D(k2 * c.x+2.22, k2 * c.y+2.22, k2 * c.z+2.22);
			// height = 2 * (height - 0.8 + 0.6 * temperature);

			temperatures.push(temperature);
			heights.push(height);

			// const noise = temperature;
			// material.map = tileTextures[tiles[Math.floor(noise * tiles.length)]];

			const tile = getTile(temperature, height);
			material.map = tileTextures[tile];

			this.faceGroup.add(mesh);
		}

		console.log(
			`Temperature: ${Math.min(...temperatures).toFixed(2)} -> ${Math.max(
				...temperatures
			).toFixed(2)}`
		);
		console.log(
			`Height: ${Math.min(...heights).toFixed(2)} -> ${Math.max(
				...heights
			).toFixed(2)}`
		);
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
		// mesh.position.copy(normal);
		mesh.position.setLength(FACE_DISTANCE);
		mesh.scale.multiplyScalar(FACE_DISTANCE);
		// mesh.position.add(normal.clone().negate().multiplyScalar(FACE_OFFSET));

		return mesh;
	}

	// Create animal sprites
	initAnimals() {
		const textureLoader = new THREE.TextureLoader();
		const animalTexture = textureLoader.load(fish);

		const points: THREE.Vector3[] = [];
		for (let i = 0; i < 100; i++) {
			points.push(
				new THREE.Vector3(
					1 - 2 * Math.random(),
					1 - 2 * Math.random(),
					1 - 2 * Math.random()
				).normalize()
			);
		}

		for (const vertex of points) {
			const material = new THREE.SpriteMaterial({
				map: animalTexture,
				color: Math.random() * 0xffffff,
				premultipliedAlpha: true,
			});

			const sprite = new THREE.Sprite(material);

			sprite.scale.setScalar(0.1);

			sprite.position.copy(vertex);
			sprite.position.setLength(0.8 * VERTEX_DISTANCE);
			sprite.scale.multiplyScalar(0.8 * VERTEX_DISTANCE);

			this.animalGroup.add(sprite);
		}
	}
}
