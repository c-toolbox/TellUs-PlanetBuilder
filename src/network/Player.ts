import * as THREE from "three";
import { PLAYER_DISTANCE, PLAYER_SIZE } from "@/constants";

import fishAsset from "@/assets/fish.png";
import { Color } from "@/utils/colors";

const PLAYER_COLORS = [
	Color.Red500,
	Color.Amber500,
	Color.Lime500,
	Color.Emerald500,
	Color.Cyan500,
	Color.Blue500,
	Color.Violet500,
	Color.Fuchsia500,
	Color.Rose500,
	Color.Orange500,
	Color.Yellow500,
	Color.Green500,
	Color.Teal500,
	Color.Sky500,
	Color.Indigo500,
	Color.Purple500,
	Color.Pink500,
];
let playerIndex = 0;

export default class Player extends THREE.Mesh {
	public userId: string;
	public material: THREE.MeshBasicMaterial;

	private velocity: THREE.Vector3;

	constructor(userId: string) {
		// this.material = material;

		// const material = new THREE.MeshBasicMaterial({
		// 	map: fishAsset,
		// 	color: Math.random() * 0xffffff,
		// 	premultipliedAlpha: true,
		// });

		// const sprite = new THREE.Sprite(material);

		// sprite.scale.setScalar(0.1);

		// sprite.position.copy(vertex);
		// sprite.position.setLength(0.8 * PLAYER_DISTANCE);
		// sprite.scale.multiplyScalar(0.8 * PLAYER_DISTANCE);

		const playerColor = PLAYER_COLORS[playerIndex++];

		const textureLoader = new THREE.TextureLoader();
		const circleTexture = textureLoader.load(fishAsset);
		const material = new THREE.MeshBasicMaterial({
			map: circleTexture,
			color: playerColor,
			transparent: true,
			premultipliedAlpha: true,
			depthWrite: false, // keeps edges from z-fighting
			side: THREE.DoubleSide,
		});

		const geometry = new THREE.PlaneGeometry(1, 1);

		super(geometry, material);
		this.material = material;
		this.userId = userId;
		this.velocity = new THREE.Vector3();

		// Position on sphere
		const pos = new THREE.Vector3(PLAYER_DISTANCE, 0, 0);
		this.position.copy(pos);

		// Make it face origin
		this.lookAt(new THREE.Vector3(0, 0, 0));

		// Scale with distance so angular size is constant
		this.scale.setScalar(PLAYER_SIZE * PLAYER_DISTANCE);
	}

	move(x: number, y: number) {
		this.velocity.x = x;
		this.velocity.y = y;
	}

	update() {
		// Convert current position to spherical coordinates
		const spherical = new THREE.Spherical().setFromVector3(this.position);

		// Adjust longitude (azimuthal angle) with x
		spherical.theta += this.velocity.x * 0.01; // tweak sensitivity as needed

		// Adjust latitude (polar angle) with y
		spherical.phi -= this.velocity.y * 0.01; // tweak sensitivity as needed

		// Clamp latitude so player never reaches poles (avoid gimbal lock)
		const minPhi = Math.PI / 4;
		const maxPhi = Math.PI - Math.PI / 4;
		spherical.phi = THREE.MathUtils.clamp(spherical.phi, minPhi, maxPhi);

		// Keep radius locked to PLAYER_DISTANCE
		spherical.radius = PLAYER_DISTANCE;

		// Convert back to Cartesian coordinates
		this.position.setFromSpherical(spherical);

		// Make the player face the origin
		this.lookAt(new THREE.Vector3(0, 0, 0));

		// Keep constant angular size
		this.scale.setScalar(PLAYER_SIZE * PLAYER_DISTANCE);
	}
}
