import * as THREE from "three";
import { Tile, tileManager } from "@/scenes/world/TileManager";
import { CLICK_DURATION } from "@/constants";

export class TouchPoint extends THREE.Group {
	private innerMesh: THREE.Mesh;
	private outerMesh: THREE.Mesh;
	private outerMaterial: THREE.MeshBasicMaterial;
	private innerMaterial: THREE.MeshBasicMaterial;

	public tile: Tile;
	public createdTimestamp: number;

	constructor(
		geometry: THREE.BufferGeometry,
		outerMaterial: THREE.MeshBasicMaterial,
		innerMaterial: THREE.MeshBasicMaterial,
	) {
		super();
		this.tile = Tile.None;
		this.createdTimestamp = Date.now();

		this.outerMaterial = outerMaterial.clone();
		this.innerMaterial = innerMaterial.clone();

		this.outerMesh = new THREE.Mesh(geometry, this.outerMaterial);
		this.innerMesh = new THREE.Mesh(geometry, this.innerMaterial);

		this.outerMesh.position.z = -0.1;
		this.outerMesh.scale.setScalar(1.2);

		this.add(this.innerMesh);
		this.add(this.outerMesh);
	}

	setTile(tile: Tile) {
		this.tile = tile;
		this.innerMaterial.map = tileManager.getTexture(tile);
		this.innerMaterial.color.setHex(0xffffff);
		this.innerMaterial.needsUpdate = true;
	}

	setColor(color: number) {
		this.innerMaterial.map = tileManager.getTexture(Tile.None);
		this.innerMaterial.color.setHex(color);
	}

	get shouldRegisterAsClick(): boolean {
		return Date.now() - this.createdTimestamp < CLICK_DURATION;
	}
}
