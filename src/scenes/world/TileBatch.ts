import * as THREE from "three";
import { Tile, tileManager } from "./TileManager";
import type { TileMesh } from "./TileMesh";

const TILE_TYPES = Object.values(Tile);

/** One shared vertex buffer, with at most one draw per biome texture. */
export class TileBatch extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial[]> {
	private readonly firstVertex: number[] = [];
	private readonly firstIndex: number[] = [];
	private readonly sourceIndices: Uint32Array;
	private readonly triangleTiles: Uint32Array;
	private readonly slots: Uint8Array;
	private readonly colors: THREE.BufferAttribute;
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
			tile.onAppearanceChange = () => this.updateTile(tileIndex);
		});

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
			this.triangleTiles.fill(tile, offset / 3, (offset + source.length) / 3);
			offsets[slot] += source.length;
		});
		index.needsUpdate = true;
	}

	override updateMatrixWorld(force?: boolean) {
		this.flush();
		super.updateMatrixWorld(force);
	}

	override raycast(raycaster: THREE.Raycaster, intersections: THREE.Intersection[]) {
		this.flush();
		super.raycast(raycaster, intersections);
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
