import * as THREE from "three";
import { Tile, tileManager } from "./TileManager";
import type { TileMesh } from "./TileMesh";

const TILE_TYPES = Object.values(Tile);

interface PickNode {
	bounds: THREE.Box3;
	left?: PickNode;
	right?: PickNode;
	tiles?: number[];
}

/** One shared vertex buffer, with at most one draw per biome texture. */
export class TileBatch extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial[]> {
	private readonly firstVertex: number[] = [];
	private readonly firstIndex: number[] = [];
	private readonly sourceIndices: Uint32Array;
	private readonly triangleTiles: Uint32Array;
	private readonly slots: Uint8Array;
	private readonly colors: THREE.BufferAttribute;
	private readonly pickTree: PickNode;
	private readonly pickRay = new THREE.Ray();
	private readonly pickInverse = new THREE.Matrix4();
	private dirty = true;

	constructor(private readonly tiles: TileMesh[]) {
		const materials = TILE_TYPES.map(() => new THREE.MeshBasicMaterial({
			map: tileManager.getTexture(Tile.None),
			vertexColors: true,
			transparent: true,
			side: THREE.FrontSide,
		}));
		super(new THREE.BufferGeometry(), materials);
		this.name = "Batched planet tiles";
		// Its origin is the camera, so depth sorting cannot order this merged mesh
		// against individual overlays. Draw the base before painting animations.
		this.renderOrder = -1;
		this.frustumCulled = false;
		this.slots = new Uint8Array(tiles.length);

		let vertexCount = 0;
		let indexCount = 0;
		for (const tile of tiles) {
			this.firstVertex.push(vertexCount);
			this.firstIndex.push(indexCount);
			vertexCount += tile.geometry.getAttribute("position").count;
			indexCount += tile.geometry.index!.count;
		}
		this.firstVertex.push(vertexCount);
		this.firstIndex.push(indexCount);
		const positions = new Float32Array(vertexCount * 3);
		const uvs = new Float32Array(vertexCount * 2);
		this.colors = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
		this.colors.setUsage(THREE.DynamicDrawUsage);
		this.sourceIndices = new Uint32Array(indexCount);
		this.triangleTiles = new Uint32Array(indexCount / 3);
		const point = new THREE.Vector3();

		tiles.forEach((tile, tileIndex) => {
			tile.updateMatrix();
			const position = tile.geometry.getAttribute("position");
			const uv = tile.geometry.getAttribute("uv");
			const index = tile.geometry.index!;
			const start = this.firstVertex[tileIndex];
			for (let i = 0; i < position.count; i++) {
				point.fromBufferAttribute(position, i).applyMatrix4(tile.matrix);
				point.toArray(positions, (start + i) * 3);
				uvs[(start + i) * 2] = uv.getX(i);
				uvs[(start + i) * 2 + 1] = uv.getY(i);
			}
			for (let i = 0; i < index.count; i++) {
				this.sourceIndices[this.firstIndex[tileIndex] + i] = start + index.getX(i);
			}
			// Picking uses the original tile order, independent of texture grouping.
			this.triangleTiles.fill(tileIndex, this.firstIndex[tileIndex] / 3, this.firstIndex[tileIndex + 1] / 3);
			tile.onAppearanceChange = () => this.updateTile(tileIndex);
		});

		const bounds = tiles.map(tile => {
			tile.geometry.computeBoundingBox();
			return tile.geometry.boundingBox!.clone().applyMatrix4(tile.matrix);
		});
		this.pickTree = this.buildPickTree(tiles.map((_, index) => index), bounds);

		this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		this.geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
		this.geometry.setAttribute("color", this.colors);
		this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexCount), 1).setUsage(THREE.DynamicDrawUsage));
		this.geometry.computeBoundingSphere();
		tiles.forEach((_, i) => this.updateTile(i));
		this.flush();
	}

	private updateTile(index: number) {
		const tile = this.tiles[index];
		const slot = tile.material.map === tileManager.getTexture(Tile.None)
			? 0 : TILE_TYPES.indexOf(tile.tile);
		if (this.slots[index] !== slot) {
			this.slots[index] = slot;
			this.dirty = true;
		}
		this.material[slot].map = tile.material.map;
		const color = tile.material.color;
		for (let v = this.firstVertex[index]; v < this.firstVertex[index + 1]; v++) {
			this.colors.setXYZ(v, color.r, color.g, color.b);
		}
		this.colors.needsUpdate = true;
	}

	/** Reorder only the index buffer when texture assignments change, once per frame. */
	flush() {
		if (!this.dirty) return;
		this.dirty = false;
		const counts = new Uint32Array(this.material.length);
		this.slots.forEach((slot, i) => counts[slot] += this.firstIndex[i + 1] - this.firstIndex[i]);
		let start = 0;
		const offsets = new Uint32Array(this.material.length);
		this.geometry.clearGroups();
		counts.forEach((count, slot) => {
			offsets[slot] = start;
			if (count > 0) this.geometry.addGroup(start, count, slot);
			start += count;
		});
		const index = this.geometry.index!;
		const indices = index.array as Uint32Array;
		this.slots.forEach((slot, tile) => {
			const source = this.sourceIndices.subarray(this.firstIndex[tile], this.firstIndex[tile + 1]);
			const offset = offsets[slot];
			indices.set(source, offset);
			offsets[slot] += source.length;
		});
		index.needsUpdate = true;
	}

	override updateMatrixWorld(force?: boolean) {
		this.flush();
		super.updateMatrixWorld(force);
	}

	override raycast(raycaster: THREE.Raycaster, intersections: THREE.Intersection[]) {
		// Painting changes texture groups, but never the geometry used for picking.
		// Keep those buffer rebuilds out of the input path.
		this.pickInverse.copy(this.matrixWorld).invert();
		this.pickRay.copy(raycaster.ray).applyMatrix4(this.pickInverse);
		this.raycastNode(this.pickTree, raycaster, intersections);
	}

	private buildPickTree(tiles: number[], bounds: THREE.Box3[]): PickNode {
		const box = new THREE.Box3();
		for (const tile of tiles) box.union(bounds[tile]);
		if (tiles.length <= 8) return { bounds: box, tiles };

		const size = box.getSize(new THREE.Vector3());
		const axis = size.x >= size.y && size.x >= size.z ? "x" : size.y >= size.z ? "y" : "z";
		tiles.sort((a, b) =>
			(bounds[a].min[axis] + bounds[a].max[axis])
			- (bounds[b].min[axis] + bounds[b].max[axis]),
		);
		const middle = Math.floor(tiles.length / 2);
		return {
			bounds: box,
			left: this.buildPickTree(tiles.slice(0, middle), bounds),
			right: this.buildPickTree(tiles.slice(middle), bounds),
		};
	}

	private raycastNode(node: PickNode, raycaster: THREE.Raycaster, intersections: THREE.Intersection[]) {
		if (!this.pickRay.intersectsBox(node.bounds)) return;
		if (node.tiles) {
			for (const index of node.tiles) {
				const tile = this.tiles[index];
				tile.matrixWorld.multiplyMatrices(this.matrixWorld, tile.matrix);
				const start = intersections.length;
				tile.raycast(raycaster, intersections);
				for (let i = start; i < intersections.length; i++) {
					const hit = intersections[i];
					hit.object = this;
					hit.faceIndex = this.firstIndex[index] / 3 + (hit.faceIndex ?? 0);
				}
			}
		} else {
			if (node.left) this.raycastNode(node.left, raycaster, intersections);
			if (node.right) this.raycastNode(node.right, raycaster, intersections);
		}
	}

	pick(raycaster: THREE.Raycaster): TileMesh | undefined {
		this.updateWorldMatrix(true, false);
		const hit = raycaster.intersectObject(this, false)[0];
		return hit?.faceIndex == null ? undefined : this.tiles[this.triangleTiles[hit.faceIndex]];
	}

	dispose() {
		this.tiles.forEach(tile => tile.onAppearanceChange = undefined);
		this.geometry.dispose();
		this.material.forEach(material => material.dispose());
	}
}
