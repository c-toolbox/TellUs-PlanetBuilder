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
	public previousPosition: THREE.Vector3;
	public hasPreviousPosition: boolean;
	public cameraLocalDirection: THREE.Vector3;
	// Latest world-space velocity (units per second)
	public velocity: THREE.Vector3;
	// Timestamp (ms) of the last position update
	public lastUpdateTimestamp: number;

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

		this.previousPosition = new THREE.Vector3();
		this.hasPreviousPosition = false;
		this.cameraLocalDirection = new THREE.Vector3(0, 0, 1);

		this.velocity = new THREE.Vector3(0, 0, 0);
		this.lastUpdateTimestamp = Date.now();

		this.add(this.innerMesh);
		this.add(this.outerMesh);

		this.setTile(Tile.None);
	}

	setTile(tile: Tile) {
		this.tile = tile;
		this.innerMaterial.map = tileManager.getTexture(tile);
		this.innerMaterial.color.setHex(0xffffff);
		this.innerMaterial.needsUpdate = true;

		const size = tile != Tile.None ? 0.8 : 0.4;
		this.innerMesh.scale.setScalar(size * 1.0);
		this.outerMesh.scale.setScalar(size * 1.2);
	}

	setColor(color: number) {
		this.innerMaterial.map = tileManager.getTexture(Tile.None);
		this.innerMaterial.color.setHex(color);
	}

	get shouldRegisterAsClick(): boolean {
		return Date.now() - this.createdTimestamp < CLICK_DURATION;
	}
}
