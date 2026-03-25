import * as THREE from "three";
import { Tile, tileManager } from "@/geometry/TileManager";
import { CLICK_DURATION } from "@/constants";

export class TouchPoint extends THREE.Group {
	private innerMesh: THREE.Mesh;
	private outerMesh: THREE.Mesh;
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

		this.innerMaterial = innerMaterial;

		this.outerMesh = new THREE.Mesh(geometry, outerMaterial.clone());
		this.innerMesh = new THREE.Mesh(geometry, innerMaterial.clone());

		this.outerMesh.position.z = -0.001;
		// this.outerMesh.renderOrder = 0;
		// this.innerMesh.renderOrder = 1;
		this.outerMesh.scale.setScalar(1.2);

		this.add(this.innerMesh);
		this.add(this.outerMesh);
	}

	setTile(tile: Tile) {
		this.tile = tile;
		this.innerMaterial.map = tileManager.getTexture(tile);
		this.innerMaterial.needsUpdate = true;
	}

	setColor(color: number) {
		this.innerMaterial.color.setHex(color);
	}

	get shouldRegisterAsClick(): boolean {
		return Date.now() - this.createdTimestamp < CLICK_DURATION;
	}
}
