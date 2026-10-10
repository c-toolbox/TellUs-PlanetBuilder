import * as THREE from "three";
import { TouchInteraction } from "@/network/TouchInteraction";
import { TouchId } from "@/network/tuioProtocol";

export interface SphericalSliderEventMap extends THREE.Object3DEventMap {
	change: { value: number };
}

export interface SphericalSliderOptions {
	/** Directions in slider space. Keep the slider centered on the display origin. */
	start: THREE.Vector3;
	end: THREE.Vector3;
	radius?: number;
	knobRadius?: number;
	color?: THREE.ColorRepresentation;
	min?: number;
	max?: number;
	value?: number;
	/** Set to zero to hide the background while keeping it interactive. */
	backgroundOpacity?: number;
	onChange?: (value: number) => void;
}

/** A single-touch slider following the shortest great-circle arc between endpoints. */
export default class SphericalSlider extends THREE.Group<SphericalSliderEventMap> {
	readonly touchInteraction: TouchInteraction;
	readonly knob: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
	readonly background: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
	readonly min: number;
	readonly max: number;
	private readonly start: THREE.Vector3;
	private readonly tangent: THREE.Vector3;
	private readonly arcAngle: number;
	private readonly radius: number;
	private readonly onChange?: (value: number) => void;
	private readonly inverseWorld = new THREE.Matrix4();
	private readonly touchDirection = new THREE.Vector3();
	private activeTouchId?: TouchId;
	private currentValue: number;
	private displayedValue: number;

	constructor({
		start, end, radius = 1, knobRadius = 0.11, color = 0xffffff,
		min = 0, max = 1, value = (min + max) / 2,
		backgroundOpacity = 0, onChange,
	}: SphericalSliderOptions) {
		super();
		if (![...start.toArray(), ...end.toArray(), radius, knobRadius, min, max, value,
			backgroundOpacity].every(Number.isFinite) ||
			start.lengthSq() === 0 || end.lengthSq() === 0 ||
			knobRadius <= 0 || radius <= knobRadius || max <= min ||
			backgroundOpacity < 0 || backgroundOpacity > 1) {
			throw new Error("Invalid spherical slider directions, dimensions or range");
		}
		this.start = start.clone().normalize();
		const endDirection = end.clone().normalize();
		this.arcAngle = this.start.angleTo(endDirection);
		if (this.arcAngle < 1e-6 || Math.PI - this.arcAngle < 1e-6) {
			throw new Error("Slider endpoints must be distinct and not antipodal");
		}
		const normal = new THREE.Vector3().crossVectors(this.start, endDirection).normalize();
		this.tangent = new THREE.Vector3().crossVectors(normal, this.start).normalize();
		this.radius = radius;
		this.min = min;
		this.max = max;
		this.onChange = onChange;
		this.currentValue = THREE.MathUtils.clamp(value, min, max);
		this.displayedValue = this.currentValue;

		// Match the knob's apparent diameter, independent of the backing's distance.
		const halfWidth = Math.asin(knobRadius / radius);
		const bar = new THREE.Mesh(
			this.createRibbon(normal, radius + knobRadius * 1.1, halfWidth * 0.25),
			new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
		);
		this.background = new THREE.Mesh(
			// Extend the hitbox past both endpoints so the entire knob remains pressable.
			this.createRibbon(normal, radius + knobRadius * 1.2, halfWidth, halfWidth),
			new THREE.MeshBasicMaterial({
				color, side: THREE.DoubleSide, transparent: true,
				opacity: backgroundOpacity, depthWrite: false,
			}),
		);
		this.knob = new THREE.Mesh(
			new THREE.SphereGeometry(knobRadius, 32, 16),
			new THREE.MeshBasicMaterial({ color }),
		);
		this.add(this.background, bar, this.knob);
		this.updateKnob();

		// Raycast only the background; the visual bar and knob never intercept input.
		this.touchInteraction = new TouchInteraction(this.background);
		this.touchInteraction.on("press", ({ touchId, direction }) => {
			if (this.activeTouchId !== undefined) return;
			this.activeTouchId = touchId;
			this.setFromDirection(direction);
		});
		this.touchInteraction.on("hold", ({ touchId, direction }) => {
			if (this.activeTouchId !== touchId) return;
			this.setFromDirection(direction);
		});
		this.touchInteraction.on("release", ({ touchId }) => {
			if (this.activeTouchId === touchId) this.resetInteraction();
		});
	}

	get value(): number {
		return this.currentValue;
	}

	set value(value: number) {
		if (!Number.isFinite(value)) return;
		const next = THREE.MathUtils.clamp(value, this.min, this.max);
		if (next === this.currentValue) return;
		this.currentValue = next;
		this.dispatchEvent({ type: "change", value: next });
		this.onChange?.(next);
	}

	/** Advance the visual knob toward the current value. Delta is in seconds. */
	update(delta: number) {
		if (!Number.isFinite(delta) || delta <= 0 || this.displayedValue === this.currentValue) return;
		this.displayedValue = THREE.MathUtils.damp(this.displayedValue, this.currentValue, 30, delta);
		if (Math.abs(this.displayedValue - this.currentValue) < (this.max - this.min) * 1e-6) {
			this.displayedValue = this.currentValue;
		}
		this.updateKnob();
	}

	/** Clear touch ownership when removing the slider or leaving its scene. */
	resetInteraction() {
		this.activeTouchId = undefined;
	}

	private updateKnob() {
		const angle = (this.displayedValue - this.min) / (this.max - this.min) * this.arcAngle;
		this.knob.position.copy(this.start).multiplyScalar(Math.cos(angle))
			.addScaledVector(this.tangent, Math.sin(angle)).multiplyScalar(this.radius);
	}

	private setFromDirection(direction: THREE.Vector3) {
		this.updateWorldMatrix(true, false);
		this.inverseWorld.copy(this.matrixWorld).invert();
		this.touchDirection.copy(direction).transformDirection(this.inverseWorld);
		const x = this.touchDirection.dot(this.start);
		const y = this.touchDirection.dot(this.tangent);
		if (x * x + y * y < 1e-12) return;
		// Unwrap around the arc midpoint, then clamp to the nearest endpoint.
		const middle = this.arcAngle / 2;
		const angle = Math.atan2(y, x) - middle;
		const alongArc = middle + Math.atan2(Math.sin(angle), Math.cos(angle));
		this.value = this.min + THREE.MathUtils.clamp(alongArc / this.arcAngle, 0, 1) *
			(this.max - this.min);
	}

	private createRibbon(
		normal: THREE.Vector3, radius: number, halfWidth: number, padding = 0,
	): THREE.BufferGeometry {
		const segments = Math.max(8, Math.ceil((this.arcAngle + 2 * padding) / 0.02));
		const positions: number[] = [];
		const indices: number[] = [];
		const point = new THREE.Vector3();
		for (let i = 0; i <= segments; i++) {
			const angle = -padding + (this.arcAngle + 2 * padding) * i / segments;
			for (const side of [-1, 1]) {
				point.copy(this.start).multiplyScalar(Math.cos(angle))
					.addScaledVector(this.tangent, Math.sin(angle))
					.multiplyScalar(Math.cos(halfWidth))
					.addScaledVector(normal, side * Math.sin(halfWidth))
					.multiplyScalar(radius);
				positions.push(point.x, point.y, point.z);
			}
			if (i < segments) {
				const vertex = i * 2;
				indices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2);
			}
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
		geometry.setIndex(indices);
		geometry.computeBoundingSphere();
		return geometry;
	}
}
