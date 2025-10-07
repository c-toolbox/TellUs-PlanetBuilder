import * as THREE from "three";
import { Tile, tileManager } from "@/geometry/TileManager";
import { CLICK_DURATION } from "@/constants";

export class TouchPoint extends THREE.Mesh {
	public material: THREE.MeshBasicMaterial;
	public tile: Tile;

	public createdTimestamp: number;

	constructor(
		geometry: THREE.BufferGeometry,
		material: THREE.MeshBasicMaterial
	) {
		super(geometry, material);
		this.material = material;
		this.tile = Tile.None;

		this.createdTimestamp = Date.now();
	}

	setTile(tile: Tile) {
		this.tile = tile;
		this.material.map = tileManager.getTexture(tile);
	}

	setColor(color: number) {
		this.material.color.setHex(color);
	}

	get shouldRegisterAsClick(): boolean {
		return Date.now() - this.createdTimestamp < CLICK_DURATION;
	}
}
