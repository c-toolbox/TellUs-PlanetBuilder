import * as THREE from "three";
import { createNoise3D } from "simplex-noise";
import { TouchPoint } from "@/network/TouchPoint";
import { ORIGIN, FISH_SIZE } from "@/constants";

import fishAsset from "@/assets/fish.png";
import { BoidsUiConfig } from "./BoidsScene";
import { Color } from "@/utils/colors";

const noise = createNoise3D();

export class Fish extends THREE.Mesh {
	public material: THREE.MeshBasicMaterial;
	public color: number;
	public friendlyColors: number[];

	private boidsConfig: BoidsUiConfig;
	private distanceFromCenter: number;
	private targetSpeed: number;
	private speed: number;
	private facing: THREE.Vector3;

	constructor(
		boidsConfig: BoidsUiConfig,
		distanceFromCenter: number,
		color: number,
		friendlyColors: number[],
	) {
		const textureLoader = new THREE.TextureLoader();
		const material = new THREE.MeshBasicMaterial({
			map: textureLoader.load(fishAsset),
			color: 0x152e73,
			transparent: true,
			premultipliedAlpha: true,
			depthWrite: false,
			side: THREE.FrontSide,
			// side: THREE.DoubleSide,
		});

		const geometry = new THREE.PlaneGeometry(1, 1);
		geometry.rotateZ(Math.PI / 2);

		super(geometry, material);
		this.boidsConfig = boidsConfig;
		this.material = material;
		this.distanceFromCenter = distanceFromCenter;
		this.color = color;
		this.friendlyColors = friendlyColors;

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

		this.facing = new THREE.Vector3(
			Math.random() * 2 - 1,
			Math.random() * 2 - 1,
			Math.random() * 2 - 1,
		);
		this.facing.projectOnPlane(this.position.clone()).normalize();

		// Scale with distance so angular size is constant
		// this.scale.setScalar(FISH_SIZE * distanceFromCenter);
		this.scale.setScalar(FISH_SIZE);
	}

	update() {
		this.speed = THREE.MathUtils.lerp(
			this.speed,
			this.targetSpeed,
			this.targetSpeed > this.speed ? 0.1 : 0.06,
		);

		this.position.add(this.facing.clone().multiplyScalar(this.speed));
		this.position.normalize().multiplyScalar(this.distanceFromCenter);

		const normal = this.position.clone().normalize();
		this.facing.projectOnPlane(normal).normalize();

		this.up.copy(this.facing);
		this.lookAt(ORIGIN);
	}

	applyBoids(fishes: Fish[], touchPoints: TouchPoint[]) {
		const sightRadius = this.boidsConfig.sightRadius;
		const neighborRadius = this.boidsConfig.neighborRadius;
		const separationRadius = this.boidsConfig.separationRadius;
		const fearRadius = this.boidsConfig.fearRadius;

		const cohesionWeight = this.boidsConfig.cohesionWeight;
		const alignmentWeight = this.boidsConfig.alignmentWeight;
		const separationWeight = this.boidsConfig.separationWeight;
		const fearWeight = this.boidsConfig.fearWeight;

		const sightAngle = Math.PI * 0.35;
		const baseTurn = this.boidsConfig.baseTurn;
		const panicTurn = this.boidsConfig.panicTurn;
		const calmSpeed = this.boidsConfig.calmSpeed;
		const panicSpeed = this.boidsConfig.panicSpeed;

		let cohesion = new THREE.Vector3();
		let alignment = new THREE.Vector3();
		let separation = new THREE.Vector3();
		let fear = new THREE.Vector3();
		let speedOfNeighbors = 0;

		let count = 0;

		for (const other of fishes) {
			if (other === this) continue;

			const distance = this.position.distanceTo(other.position);

			// If within separation radius
			if (distance < separationRadius) {
				const diff = this.position.clone().sub(other.position);
				// separation.add(diff.normalize());
				separation.add(
					diff.normalize().multiplyScalar(1 - distance / separationRadius),
				);
			}

			// If within sight range, check sight angle
			if (distance < sightRadius) {
				const toOther = other.position.clone().sub(this.position).normalize();
				const angleBetween = this.facing.angleTo(toOther);

				// If within sight cone, or cohesion/alignment radius
				if (distance < neighborRadius || angleBetween < sightAngle) {
					// The influence the other fish has. Scared, faster fish are more influential.
					let factor = Math.pow(other.speed, 2);

					// Check if fish should separate by color
					if (this.boidsConfig.colorAffinity) {
						factor *= this.friendlyColors.includes(other.color) ? 1 : -1;
					}

					// Add to neighbor sums
					cohesion.add(other.position.clone().multiplyScalar(factor));
					alignment.add(other.facing.clone().multiplyScalar(factor));
					speedOfNeighbors += other.speed * factor;
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

			// If within sight range, also check within sight angle
			if (distance < sightRadius) {
				const toOther = touchPosition.clone().sub(this.position).normalize();
				const angleBetween = this.facing.angleTo(toOther);

				// If within sight cone, or general radius
				if (distance < fearRadius || angleBetween < sightAngle) {
					const diff = this.position.clone().sub(touchPosition);
					fear.add(diff.normalize().multiplyScalar(1 - distance / sightRadius));
				}
			}
		}

		// Average
		if (count > 0) {
			cohesion.divideScalar(count);
			cohesion.sub(this.position);

			alignment.divideScalar(count);

			speedOfNeighbors = (speedOfNeighbors / count) * 0.75;
		} else {
			speedOfNeighbors = calmSpeed;
		}

		// Combine
		const steering = new THREE.Vector3();
		steering
			.addScaledVector(cohesion, cohesionWeight)
			.addScaledVector(alignment, alignmentWeight)
			.addScaledVector(separation, separationWeight)
			.addScaledVector(fear, fearWeight);

		// Project onto sphere tangent
		const normal = this.position.clone().normalize();
		steering.projectOnPlane(normal).normalize();

		/* Target speed */

		const fearStrength = fear.length();
		const separationStrength = separation.length();

		this.targetSpeed =
			speedOfNeighbors + 0.05 * fearStrength + 0.0 * separationStrength;

		// Lonely
		// if (count == 0) this.targetSpeed += calmSpeed;

		this.targetSpeed = THREE.MathUtils.clamp(
			this.targetSpeed,
			calmSpeed,
			panicSpeed,
		);

		// Calculate turn speed
		const turnFactor = THREE.MathUtils.clamp(fearStrength * 10, 0, 1);
		const maxTurn = THREE.MathUtils.lerp(baseTurn, panicTurn, turnFactor);

		// const noise = new THREE.Vector3(
		// 	Math.random() - 0.5,
		// 	Math.random() - 0.5,
		// 	Math.random() - 0.5,
		// ).multiplyScalar(2);
		// steering.add(noise);
		const value = noise(
			4.5 * this.position.x,
			4.5 * this.position.y,
			4.5 * this.position.z,
		);
		const sideways = new THREE.Vector3()
			.crossVectors(this.facing, normal)
			.normalize()
			.multiplyScalar(0.4 * value);
		steering.add(sideways);

		// Apply steering
		this.facing.lerp(this.facing.clone().add(steering).normalize(), maxTurn);
	}
}
