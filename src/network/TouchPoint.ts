import * as THREE from "three";
import { Tile, tileManager } from "@/geometry/TileMap";

export class TouchPoint extends THREE.Mesh {
	public material: THREE.MeshBasicMaterial;
	public tile: Tile;

	constructor(
		geometry: THREE.BufferGeometry,
		material: THREE.MeshBasicMaterial
	) {
		super(geometry, material);
		this.material = material;
		this.tile = Tile.None;
	}

	setTile(tile: Tile) {
		this.tile = tile;
		this.material.map = tileManager.getTexture(tile);
	}

	setColor(color: number) {
		this.material.color.setHex(color);
	}
}
