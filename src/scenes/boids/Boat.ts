import * as THREE from "three";
import { createNoise3D } from "simplex-noise";
import { TouchPoint } from "@/network/TouchPoint";
import { ORIGIN, UP } from "@/constants";
import { BOAT_BOIDS_CONFIG, FISH_SIZE } from "./constants";

import boatAsset from "@/assets/boat.png";

const noise = createNoise3D();

export class Boat extends THREE.Mesh {
	public material: THREE.MeshBasicMaterial;
	public color: number;

	private distanceFromCenter: number;
	private speed: number;
	private facing: THREE.Vector3;
	private velocity: THREE.Vector3;

	constructor(distanceFromCenter: number, color: number) {
		const textureLoader = new THREE.TextureLoader();
		const material = new THREE.MeshBasicMaterial({
			map: textureLoader.load(boatAsset),
			color,
			transparent: true,
			premultipliedAlpha: true,
			depthWrite: false,
			side: THREE.FrontSide,
		});

		const geometry = new THREE.PlaneGeometry(1, 1);

		super(geometry, material);
		this.material = material;
		this.distanceFromCenter = distanceFromCenter;
		this.color = color;

		this.speed = 0.002 + Math.random() * 0.002;

		// Position on sphere
		const u = Math.random();
		const v = Math.random();
		const theta = 2 * Math.PI * u;
		const phi = Math.acos(2 * v - 1);
		const pos = new THREE.Vector3().setFromSpherical(
			new THREE.Spherical(distanceFromCenter, phi, theta),
		);
		this.position.copy(pos);

		this.facing = new THREE.Vector3(
			Math.random() * 2 - 1,
			Math.random() * 2 - 1,
			Math.random() * 2 - 1,
		);
		this.facing.projectOnPlane(this.position.clone()).normalize();

		// Initialize velocity based on facing and initial speed
		this.velocity = this.facing.clone().multiplyScalar(this.speed);

		// Keep constant visual size
		this.scale.setScalar(FISH_SIZE);
	}

	update() {
		// Update speed from velocity
		this.speed = this.velocity.length();

		// If below calmSpeed, slowly recover toward calmSpeed
		const { calmSpeed, damping, speedRecovery } = BOAT_BOIDS_CONFIG;
		if (this.speed < calmSpeed) {
			this.velocity.setLength(
				THREE.MathUtils.lerp(this.speed, calmSpeed, speedRecovery),
			);
		}

		this.velocity.multiplyScalar(damping);

		this.position.add(this.velocity.clone());
		this.position.normalize().multiplyScalar(this.distanceFromCenter);

		const normal = this.position.clone().normalize();
		// Update facing from velocity where possible
		if (this.velocity.lengthSq() > 1e-8) {
			this.facing.copy(this.velocity).projectOnPlane(normal).normalize();
		} else {
			this.facing.projectOnPlane(normal).normalize();
		}

		// Boats should face up (world +Y) rather than the direction of travel.
		this.up.copy(UP);
		this.lookAt(ORIGIN);
	}

	applyBoids(boats: Boat[], touchPoints: TouchPoint[]) {
		const {
			sightRadius,
			neighborRadius,
			separationRadius,
			alignmentWeight,
			separationWeight,
			sightAngle,
			calmSpeed,
			panicSpeed,
			windRadius,
			steeringStrength,
			windStrength,
		} = BOAT_BOIDS_CONFIG;

		const alignment = new THREE.Vector3();
		const separation = new THREE.Vector3();
		// Aggregate wind vector from touch points (world-space)
		const wind = new THREE.Vector3();

		let count = 0;

		for (const other of boats) {
			if (other === this) continue;

			const distance = this.position.distanceTo(other.position);

			// If within separation radius
			if (distance < separationRadius) {
				const diff = this.position.clone().sub(other.position);
				separation.add(
					diff.normalize().multiplyScalar(1 - distance / separationRadius),
				);
			}

			// If within sight range, check sight angle
			if (distance < sightRadius) {
				const toOther = other.position.clone().sub(this.position).normalize();
				const angleBetween = this.facing.angleTo(toOther);

				// If within sight cone, or alignment radius
				if (distance < neighborRadius || angleBetween < sightAngle) {
					const factor = Math.pow(other.speed, 2);

					alignment.add(other.facing.clone().multiplyScalar(factor));
					count += factor;
				}
			}
		}

		for (const point of touchPoints) {
			const touchPosition = point.position
				.clone()
				.normalize()
				.multiplyScalar(this.distanceFromCenter);
			const distance = this.position.distanceTo(touchPosition);

			// Treat touch velocity as a gust of wind that changes direction.
			if (distance < windRadius) {
				const proximity = 1 - distance / windRadius;
				const normal = this.position.clone().normalize();
				const contribution = point.velocity
					.clone()
					.projectOnPlane(normal)
					.multiplyScalar(proximity);
				wind.add(contribution);
			}
		}

		if (count > 0) {
			alignment.divideScalar(count);
		}

		const steering = new THREE.Vector3();
		steering
			.addScaledVector(alignment, alignmentWeight)
			.addScaledVector(separation, separationWeight);

		const normal = this.position.clone().normalize();
		steering.projectOnPlane(normal).normalize();

		// Add some noise-sideways
		const value = noise(
			4.5 * this.position.x,
			4.5 * this.position.y,
			4.5 * this.position.z,
		);
		const sideways = new THREE.Vector3()
			.crossVectors(this.facing, normal)
			.normalize()
			.multiplyScalar(0.02 * calmSpeed * value);
		steering.add(sideways);

		// Steering affects direction: add scaled steering to velocity.
		this.velocity.addScaledVector(steering, steeringStrength);
		// Wind adds directly to velocity (projected to tangent plane earlier).
		this.velocity.addScaledVector(wind, windStrength);

		// Ensure velocity remains on the sphere tangent plane
		this.velocity.projectOnPlane(normal);

		// Cap gust-driven speed; damping and recovery happen in update().
		const MAX_SAFE = 2 * panicSpeed;
		if (this.velocity.length() > MAX_SAFE) this.velocity.setLength(MAX_SAFE);
	}

	public boost(boostAmount: number = 0.005) {
		// Boost velocity in current facing direction
		const currentSpeed = this.velocity.length();
		const targetSpeed = Math.min(
			currentSpeed + boostAmount,
			BOAT_BOIDS_CONFIG.panicSpeed * 0.7, // Keep below full panic cap
		);

		if (this.facing.lengthSq() > 0) {
			this.velocity.copy(this.facing).setLength(targetSpeed);
		}
	}
}
