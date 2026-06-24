import * as THREE from "three";
import { Tile, tileManager, Tiles } from "./TileManager";
import { FACE_DISTANCE } from "@/constants";

export class TileMesh extends THREE.Mesh {
	public material: THREE.MeshBasicMaterial;
	public tile: Tile;
	public center: THREE.Vector3;

	public neighbors: { mesh: TileMesh; edgeIndex: number }[] = [];

	constructor(
		geometry: THREE.BufferGeometry,
		material: THREE.MeshBasicMaterial,
	) {
		super(geometry, material);
		this.material = material;
		this.tile = Tile.None;
	}

	setTile(tile: Tile) {
		this.tile = tile;

		if (tileManager.worldConfig.tileTexture == "colored tiles") {
			this.material.map = tileManager.getTexture(Tile.None);
			this.material.color.set(Tiles[tile].color);
		} else {
			this.material.map = tileManager.getTexture(tile);
			this.material.color.set(0xffffff);

			if (tile == Tile.None) this.material.color.set(Tiles[tile].color);
		}
	}

	setColor(color: THREE.Color) {
		this.material.map = tileManager.getTexture(Tile.None);
		this.material.color.set(color);
	}

	recenterToGeometryCenter() {
		this.geometry.computeBoundingBox();

		const box = this.geometry.boundingBox;
		if (!box) return;

		const center = new THREE.Vector3();
		box.getCenter(center);

		this.geometry.translate(-center.x, -center.y, -center.z);

		this.position.add(center.multiplyScalar(FACE_DISTANCE));

		this.center = this.position.clone();
	}
}
