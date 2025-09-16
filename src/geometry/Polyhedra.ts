import * as THREE from "three";
import earcut from "earcut";

import circle from "@/assets/circle.png";
import fish from "@/assets/fish.png";
import { getCenterOfMesh, getPitchFromVector } from "@/utils/functions";
import { Tile, tileManager } from "./TileMap";

import {
	VERTEX_SIZE,
	VERTEX_COLOR,
	VERTEX_DISTANCE,
	EDGE_SIZE,
	EDGE_COLOR,
	EDGE_DISTANCE,
	FACE_DISTANCE,
	TEXTURE_SCALE,
	DOUBLE_SIDE,
	FACE_OPACITY,
} from "@/constants";
import { TileMesh } from "./TileMesh";

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
		const material = new THREE.MeshBasicMaterial({
			map: circleTexture,
			color: VERTEX_COLOR,
			transparent: true,
			premultipliedAlpha: true,
			depthWrite: false, // keeps edges from z-fighting
			side: DOUBLE_SIDE ? THREE.DoubleSide : THREE.FrontSide,
		});

		const geometry = new THREE.PlaneGeometry(1, 1);

		for (const vertex of this.vertices) {
			const mesh = new THREE.Mesh(geometry, material);

			// Position on sphere
			const pos = vertex.clone().setLength(VERTEX_DISTANCE);
			mesh.position.copy(pos);

			// Make it face origin
			mesh.lookAt(new THREE.Vector3(0, 0, 0));

			// Scale with distance so angular size is constant
			mesh.scale.setScalar(VERTEX_SIZE * VERTEX_DISTANCE);

			this.vertexGroup.add(mesh);
		}
	}

	// Create a cylinder on every edge
	// Create billboarded quads for edges (always face the origin)
	initEdges() {
		const material = new THREE.MeshBasicMaterial({
			color: EDGE_COLOR,
			depthWrite: true,
			side: DOUBLE_SIDE ? THREE.DoubleSide : THREE.FrontSide,
		});

		const quad = new THREE.PlaneGeometry(1, 1);
		const instanced = new THREE.InstancedMesh(
			quad,
			material,
			this.edges.length
		);

		const tmp = new THREE.Object3D();

		for (let i = 0; i < this.edges.length; i++) {
			const [ia, ib] = this.edges[i];

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
				new THREE.Matrix4().makeBasis(x, y, z)
			);

			// Scale: width = edge length, height = angular thickness
			const thickness = EDGE_SIZE * EDGE_DISTANCE;
			tmp.scale.set(length, thickness, 1);

			tmp.updateMatrix();
			instanced.setMatrixAt(i, tmp.matrix);
		}

		instanced.instanceMatrix.needsUpdate = true;
		this.edgeGroup.add(instanced);
	}

	// Create textured polygons for every face
	initFaces() {
		const worldUp = new THREE.Vector3(0, 1, 0);

		for (const face of this.faces) {
			const vertices = face.map((i) => this.vertices[i]);

			const mesh = this.createMesh(vertices);

			const center = getCenterOfMesh(mesh);
			const tile = tileManager.getTileAt(center);
			mesh.setTile(tile);

			this.faceGroup.add(mesh);
		}
	}

	createMesh(vertices: THREE.Vector3[]): TileMesh {
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
		const material = new THREE.MeshBasicMaterial({
			transparent: true,
			opacity: FACE_OPACITY,
			side: DOUBLE_SIDE ? THREE.DoubleSide : THREE.FrontSide,
		});
		const mesh = new TileMesh(geometry, material);
		mesh.position.setLength(FACE_DISTANCE);
		mesh.scale.multiplyScalar(FACE_DISTANCE);

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
