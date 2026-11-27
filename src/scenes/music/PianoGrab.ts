import * as THREE from "three";
import type { TouchId } from "@/network/tuioProtocol";

const MAX_FINGERS = 2;
const MIN_FINGER_ANGLE = 1e-3;
// Direction from the scene origin to the piano's center, in root space.
const CENTER = new THREE.Vector3(0, 0, 1);

interface PianoGrabOptions {
	minScale: number;
	maxScale: number;
	getScale: () => number;
	setScale: (scale: number) => void;
}

/**
 * Moves a root at the scene origin over the sphere with one finger; two fingers also
 * rotate and scale it. Touch directions are in scene space, so the root's parent must
 * not be transformed.
 */
export class PianoGrab {
	private readonly fingers = new Map<TouchId, THREE.Vector3>();
	private readonly current = new THREE.Vector3();
	private readonly delta = new THREE.Quaternion();
	private readonly before = new THREE.Matrix4();
	private readonly after = new THREE.Matrix4();
	private readonly mid = new THREE.Vector3();
	private readonly side = new THREE.Vector3();
	private readonly up = new THREE.Vector3();
	private readonly center = new THREE.Vector3();
	private readonly axis = new THREE.Vector3();

	constructor(
		private readonly root: THREE.Object3D,
		private readonly options: PianoGrabOptions,
	) {}

	has(id: TouchId) {
		return this.fingers.has(id);
	}

	press(id: TouchId, direction: THREE.Vector3) {
		if (this.fingers.size >= MAX_FINGERS) return;
		this.fingers.set(id, direction.clone().normalize());
	}

	move(id: TouchId, direction: THREE.Vector3) {
		const previous = this.fingers.get(id);
		if (!previous) return;
		const current = this.current.copy(direction).normalize();
		if (current.lengthSq() < 0.5) return;
		if (previous.distanceToSquared(current) < 1e-16) return;

		let other: THREE.Vector3 | undefined;
		for (const [otherId, otherDirection] of this.fingers) {
			if (otherId !== id) {
				other = otherDirection;
				break;
			}
		}
		if (other) this.pinch(previous, current, other);
		else this.rotate(this.delta.setFromUnitVectors(previous, current));
		previous.copy(current);
	}

	release(id: TouchId, direction: THREE.Vector3) {
		this.move(id, direction);
		this.fingers.delete(id);
	}

	clear() {
		this.fingers.clear();
	}

	private rotate(rotation: THREE.Quaternion) {
		this.root.quaternion.premultiply(rotation).normalize();
	}

	/** Keep the piano points under both fingers: rotate with the fingers' frame, then scale about their midpoint. */
	private pinch(
		previous: THREE.Vector3,
		current: THREE.Vector3,
		other: THREE.Vector3,
	) {
		if (
			this.setFrame(this.before, previous, other) &&
			this.setFrame(this.after, current, other)
		) {
			this.delta.setFromRotationMatrix(
				this.after.multiply(this.before.transpose()),
			);
		} else {
			this.delta.setFromUnitVectors(previous, current);
		}
		this.rotate(this.delta);

		const previousAngle = previous.angleTo(other);
		if (previousAngle < MIN_FINGER_ANGLE) return;
		const { minScale, maxScale, getScale, setScale } = this.options;
		const scale = getScale();
		const next = THREE.MathUtils.clamp(
			(scale * current.angleTo(other)) / previousAngle,
			minScale,
			maxScale,
		);
		if (next === scale) return;
		setScale(next);

		// Scaling about the midpoint moves the piano's center along the arc between them.
		this.mid.copy(current).add(other).normalize();
		this.center.copy(CENTER).applyQuaternion(this.root.quaternion);
		const distance = this.mid.angleTo(this.center);
		if (distance < 1e-4) return;
		this.axis.crossVectors(this.mid, this.center).normalize();
		this.rotate(
			this.delta.setFromAxisAngle(this.axis, distance * (next / scale - 1)),
		);
	}

	/** Orthonormal frame from the midpoint and heading of two directions. */
	private setFrame(
		matrix: THREE.Matrix4,
		a: THREE.Vector3,
		b: THREE.Vector3,
	): boolean {
		this.mid.addVectors(a, b);
		this.side.subVectors(b, a);
		if (this.mid.lengthSq() < 1e-8) return false;
		this.mid.normalize();
		this.side.addScaledVector(this.mid, -this.side.dot(this.mid));
		if (this.side.lengthSq() < 1e-8) return false;
		this.side.normalize();
		this.up.crossVectors(this.mid, this.side);
		matrix.makeBasis(this.mid, this.side, this.up);
		return true;
	}
}
