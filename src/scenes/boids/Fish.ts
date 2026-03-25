import * as THREE from "three";
import { ORIGIN, PLAYER_SIZE } from "@/constants";

import fishAsset from "@/assets/fish.png";
// import sharkAsset from "@/assets/creature.png";

export class Fish extends THREE.Mesh {
	public material: THREE.MeshBasicMaterial;

	private distanceFromCenter: number;
	protected forward: THREE.Vector3;
	protected velocity: THREE.Vector3;
	protected speed: number;
	protected targetSpeed: number;

	constructor(distanceFromCenter: number, color: number) {
		const textureLoader = new THREE.TextureLoader();
		const circleTexture = textureLoader.load(fishAsset);
		const material = new THREE.MeshBasicMaterial({
			map: circleTexture,
			color,
			transparent: true,
			premultipliedAlpha: true,
			depthWrite: false,
			// side: THREE.FrontSide,
			side: THREE.DoubleSide,
		});

		const geometry = new THREE.PlaneGeometry(1, 1);
		geometry.rotateZ(Math.PI / 2);

		super(geometry, material);
		this.material = material;
		this.velocity = new THREE.Vector3();
		this.distanceFromCenter = distanceFromCenter;
		this.speed = 0.002 + Math.random() * 0.002;
		this.targetSpeed = this.speed;

		// Position on sphere
		const u = Math.random();
		const v = Math.random();
		const theta = 2 * Math.PI * u;
		const phi = Math.acos(2 * v - 1);
		const pos = new THREE.Vector3().setFromSpherical(
			new THREE.Spherical(distanceFromCenter, phi, theta),
		);
		this.position.copy(pos);

		this.forward = new THREE.Vector3(
			Math.random() * 2 - 1,
			Math.random() * 2 - 1,
			Math.random() * 2 - 1,
		).normalize();
		this.forward.projectOnPlane(this.position.clone().normalize()).normalize();
		this.velocity = this.forward.clone().multiplyScalar(0.003);

		// Scale with distance so angular size is constant
		// this.scale.setScalar(PLAYER_SIZE * distanceFromCenter);
		this.scale.setScalar(PLAYER_SIZE);
	}

	update() {
		const speed = 0.005;

		this.position.addScaledVector(this.forward, speed);
		this.position.normalize().multiplyScalar(this.distanceFromCenter);

		const normal = this.position.clone().normalize();
		this.forward.projectOnPlane(normal).normalize();

		this.up.copy(this.forward);
		this.lookAt(ORIGIN);
	}

	// update() {
	// 	const speedLoss = 0.995;
	// 	const maxSpeed = 0.01;
	// 	const minSpeed = 0.002;

	// 	// Gradually slow down
	// 	this.speed *= speedLoss;

	// 	// Clamp
	// 	this.speed = THREE.MathUtils.clamp(this.speed, minSpeed, maxSpeed);

	// 	// Move forward
	// 	this.position.addScaledVector(this.forward, this.speed);

	// 	// Stay on sphere
	// 	this.position.normalize().multiplyScalar(this.distanceFromCenter);

	// 	const normal = this.position.clone().normalize();
	// 	this.forward.projectOnPlane(normal).normalize();

	// 	this.up.copy(this.forward);
	// 	this.lookAt(ORIGIN);
	// }

	// update() {
	// 	const speedLoss = 0.985;
	// 	const minSpeed = 0.002;
	// 	const maxSpeed = 0.02;

	// 	// Apply damping (like C code)
	// 	this.velocity.multiplyScalar(speedLoss);

	// 	// Clamp speed
	// 	const speed = this.velocity.length();
	// 	const clamped = THREE.MathUtils.clamp(speed, minSpeed, maxSpeed);
	// 	this.velocity.setLength(clamped);

	// 	// Move
	// 	this.position.add(this.velocity);

	// 	// Stick to sphere
	// 	this.position.normalize().multiplyScalar(this.distanceFromCenter);

	// 	// Project velocity onto tangent plane
	// 	const normal = this.position.clone().normalize();
	// 	this.velocity.projectOnPlane(normal);

	// 	// Update forward from velocity
	// 	if (this.velocity.lengthSq() > 0) {
	// 		this.forward.copy(this.velocity).normalize();
	// 	}

	// 	this.up.copy(this.forward);
	// 	this.lookAt(ORIGIN);
	// }

	turn(angle: number) {
		const normal = this.position.clone().normalize();
		const quaternion = new THREE.Quaternion().setFromAxisAngle(normal, angle);
		this.forward.applyQuaternion(quaternion).normalize();
	}

	applyBoids(fishes: Fish[], sharks: Shark[]) {
		const sightRadius = 0.3;
		const neighborRadius = 0.15;
		const separationRadius = 0.08;
		const cohesionWeight = 0.3;
		const alignmentWeight = 0.1;
		const separationWeight = 0.3;
		const maxTurn = 0.04;
		const viewAngle = Math.PI * 0.5;

		let cohesion = new THREE.Vector3();
		let alignment = new THREE.Vector3();
		let separation = new THREE.Vector3();

		let count = 0;

		for (const other of fishes) {
			if (other === this) continue;

			const distance = this.position.distanceTo(other.position);

			// 1. Separation is strictly distance-based (safety first!)
			if (distance < separationRadius) {
				const diff = this.position.clone().sub(other.position);
				separation.add(diff.normalize().divideScalar(distance));
			}

			// 2. Check if the fish is within the neighbor radius
			if (distance < sightRadius) {
				// Calculate vector to the other fish
				const toOther = other.position.clone().sub(this.position).normalize();

				// Calculate angle between current forward direction and other fish
				const angleBetween = this.forward.angleTo(toOther);

				// 3. Only apply Cohesion and Alignment if within Field of View
				if (distance < neighborRadius || angleBetween < viewAngle) {
					cohesion.add(other.position);
					alignment.add(other.forward);
					count++;
				}
			}
		}

		// const sharkFearRadius = 0.1;
		// const panicBoost = 0.01;

		// for (const shark of sharks) {
		// 	const dist = this.position.distanceTo(shark.position);

		// 	if (dist < sharkFearRadius) {
		// 		const flee = this.position.clone().sub(shark.position);

		// 		separation.add(
		// 			flee
		// 				.normalize()
		// 				.multiplyScalar(((sharkFearRadius - dist) / sharkFearRadius) ** 2),
		// 		);

		// 		this.speed += panicBoost;
		// 	}
		// }

		const fearRadius = 0.25;
		const panicBoost = 0.02;

		// for (const shark of sharks) {
		// 	const distance = this.position.distanceTo(shark.position);

		// 	if (distance < fearRadius) {
		// 		const away = this.position.clone().sub(shark.position).normalize();

		// 		// Turn away from shark
		// 		this.forward.lerp(away, 0.2).normalize();

		// 		// Speed boost when scared
		// 		this.speed += panicBoost * (1 - distance / fearRadius);
		// 	}
		// }

		for (const shark of sharks) {
			const dist = this.position.distanceTo(shark.position);

			if (dist < fearRadius) {
				const flee = this.position.clone().sub(shark.position);

				const factor = Math.pow((fearRadius - dist) / fearRadius, 2);

				this.velocity.addScaledVector(
					flee.normalize(),
					factor * 0.05, // strong impulse
				);
			}
		}

		if (count > 0) {
			// --- Cohesion ---
			cohesion.divideScalar(count);
			cohesion.sub(this.position);

			// --- Alignment ---
			alignment.divideScalar(count);
		}

		// Combine forces
		const steering = new THREE.Vector3();

		steering
			.addScaledVector(cohesion, cohesionWeight)
			.addScaledVector(alignment, alignmentWeight)
			.addScaledVector(separation, separationWeight);

		// Project onto sphere tangent
		const normal = this.position.clone().normalize();
		steering.projectOnPlane(normal).normalize();

		// Apply steering
		this.forward
			.lerp(this.forward.clone().add(steering).normalize(), maxTurn)
			.normalize();

		// const noise = new THREE.Vector3(
		// 	Math.random() - 0.5,
		// 	Math.random() - 0.5,
		// 	Math.random() - 0.5,
		// ).multiplyScalar(0.02);

		// this.forward.add(noise).normalize();
		// this.forward.projectOnPlane(normal).normalize();

		this.velocity.addScaledVector(cohesion, cohesionWeight * 5);
		this.velocity.addScaledVector(alignment, alignmentWeight);
		this.velocity.addScaledVector(separation, separationWeight * 5);

		// const accel = steering.length();
		// this.speed += accel * 0.001;
	}
}

export class Shark extends Fish {
	constructor(distanceFromCenter: number, color: number) {
		super(distanceFromCenter, color);

		const textureLoader = new THREE.TextureLoader();
		const sharkTexture = textureLoader.load(fishAsset);
		this.material.map = sharkTexture;
		this.scale.setScalar(3 * PLAYER_SIZE);
	}

	update() {
		this.speed = 0.006;
		super.update();
	}

	applyBoids(sharks: Shark[], fishes: Fish[]) {
		const chaseWeight = 0.6;
		const avoidWeight = 0.3;

		let chase = new THREE.Vector3();
		let avoid = new THREE.Vector3();

		for (const fish of fishes) {
			const dist = this.position.distanceTo(fish.position);
			if (dist < 0.5) {
				chase.add(fish.position);
			}
		}

		for (const shark of sharks) {
			if (shark === this) continue;
			const dist = this.position.distanceTo(shark.position);
			if (dist < 0.2) {
				const diff = this.position.clone().sub(shark.position);
				avoid.add(diff.normalize());
			}
		}

		if (chase.lengthSq() > 0) {
			chase.divideScalar(fishes.length);
			chase.sub(this.position);
		}

		const steering = new THREE.Vector3()
			.addScaledVector(chase, chaseWeight)
			.addScaledVector(avoid, avoidWeight);

		const normal = this.position.clone().normalize();
		steering.projectOnPlane(normal).normalize();

		this.forward
			.lerp(this.forward.clone().add(steering).normalize(), 0.05)
			.normalize();
	}

	// applyBoids(sharks: Shark[], fishes: Fish[]) {
	// 	const chaseRadius = 0.35;

	// 	let chase = new THREE.Vector3();

	// 	for (const fish of fishes) {
	// 		const dist = this.position.distanceTo(fish.position);

	// 		if (dist < chaseRadius) {
	// 			chase.add(fish.position);
	// 		}
	// 	}

	// 	if (chase.lengthSq() > 0) {
	// 		chase.divideScalar(fishes.length);
	// 		chase.sub(this.position).normalize();

	// 		this.forward.lerp(chase, 0.05).normalize();
	// 	}
	// }
}
