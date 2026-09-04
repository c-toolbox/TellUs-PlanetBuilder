import * as THREE from "three";
import { createNoise3D } from "simplex-noise";
import { TouchPoint } from "@/network/TouchPoint";
import { FISH_SIZE, ORIGIN, UP } from "@/constants";

import boatAsset from "@/assets/boat.png";
import { BoidsUiConfig } from "./BoidsScene";

const noise = createNoise3D();

export class Boat extends THREE.Mesh {
	public material: THREE.MeshBasicMaterial;
	public color: number;

	private boidsConfig: BoidsUiConfig;
	private distanceFromCenter: number;
	private speed: number;
	private facing: THREE.Vector3;
	private velocity: THREE.Vector3;

	constructor(
		boidsConfig: BoidsUiConfig,
		distanceFromCenter: number,
		color: number,
		friendlyColors: number[],
	) {
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
		// geometry.rotateZ(Math.PI / 2);

		super(geometry, material);
		this.boidsConfig = boidsConfig;
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
		const calmSpeed = this.boidsConfig.calmSpeed;
		const panicSpeed = this.boidsConfig.panicSpeed;
		if (this.speed < calmSpeed) {
			this.velocity.setLength(THREE.MathUtils.lerp(this.speed, calmSpeed, 0.1));
		}

		this.velocity.multiplyScalar(0.97);

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
		// Orient so the plane faces toward the world-up direction from its position.
		// const localNorth = UP.clone().projectOnPlane(normal).normalize();
		this.up.copy(UP);
		this.lookAt(ORIGIN);

		const clampedT = Math.max(
			this.boidsConfig.calmSpeed,
			Math.min(this.boidsConfig.panicSpeed, this.speed),
		);
		const alpha =
			(clampedT - this.boidsConfig.calmSpeed) /
			(this.boidsConfig.panicSpeed - this.boidsConfig.calmSpeed);
		this.material.color
			.copy(new THREE.Color(0xffffff))
			.lerp(new THREE.Color(0xccffbb), alpha);
	}

	applyBoids(boats: Boat[], touchPoints: TouchPoint[]) {
		const sightRadius = this.boidsConfig.sightRadius;
		const neighborRadius = this.boidsConfig.neighborRadius;
		const separationRadius = this.boidsConfig.separationRadius;

		const cohesionWeight = this.boidsConfig.cohesionWeight * 0;
		const alignmentWeight = this.boidsConfig.alignmentWeight * 0.01;
		const separationWeight = this.boidsConfig.separationWeight / 2;

		const sightAngle = Math.PI * 0.35;
		const baseTurn = this.boidsConfig.baseTurn;
		const panicTurn = this.boidsConfig.panicTurn;
		const calmSpeed = this.boidsConfig.calmSpeed;
		const panicSpeed = this.boidsConfig.panicSpeed;

		let cohesion = new THREE.Vector3();
		let alignment = new THREE.Vector3();
		let separation = new THREE.Vector3();
		// Aggregate wind vector from touch points (world-space)
		let wind = new THREE.Vector3();

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
			if (distance < sightRadius / 2) {
				const toOther = other.position.clone().sub(this.position).normalize();
				const angleBetween = this.facing.angleTo(toOther);

				// If within sight cone, or cohesion/alignment radius
				if (distance < neighborRadius / 2 || angleBetween < sightAngle) {
					let factor = Math.pow(other.speed, 2);

					cohesion.add(other.position.clone().multiplyScalar(factor));
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
			if (distance < sightRadius) {
				const proximity = 1 - distance / sightRadius;
				const normal = this.position.clone().normalize();
				const contribution = point.velocity
					.clone()
					.projectOnPlane(normal)
					.multiplyScalar(proximity);
				wind.add(contribution);
			}
		}

		if (count > 0) {
			cohesion.divideScalar(count);
			cohesion.sub(this.position);

			alignment.divideScalar(count);
		}

		const steering = new THREE.Vector3();
		steering
			.addScaledVector(cohesion, cohesionWeight)
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
		const STEER_SCALE = 0.00004;
		const steerContribution = steering.clone().multiplyScalar(STEER_SCALE);

		// Wind adds directly to velocity (projected to tangent plane earlier).
		const WIND_SCALE = 0.0006;

		// Apply steering and wind to velocity (they act as instantaneous impulses).
		this.velocity.add(steerContribution);
		this.velocity.add(wind.multiplyScalar(WIND_SCALE));

		// Ensure velocity remains on the sphere tangent plane
		this.velocity.projectOnPlane(normal);

		// Keep a sane upper cap; real speed clamping/recovery happens in update().
		const MAX_SAFE = 2 * panicSpeed;
		if (this.velocity.length() > MAX_SAFE) this.velocity.setLength(MAX_SAFE);
	}
}
