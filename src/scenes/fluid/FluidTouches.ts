import * as THREE from "three";

export const MAX_FLUID_TOUCHES = 16;

export interface FluidSplat {
	direction: THREE.Vector3;
	impulse: THREE.Vector3;
	color: THREE.Color;
	dyeAmount: number;
}

interface FluidTouch {
	direction: THREE.Vector3;
	impulse: THREE.Vector3;
	color: THREE.Color;
	fresh: boolean;
	pending: boolean;
	released: boolean;
}

/** Accumulate angular displacement rather than repeatedly applying stale touch velocity. */
export class FluidTouches {
	private touches = new Map<number, FluidTouch>();
	private hue = 0.52;

	update(id: number, vector: THREE.Vector3) {
		if (!Number.isFinite(vector.lengthSq()) || vector.lengthSq() < 1e-12) return;
		const direction = vector.clone().normalize();
		let touch = this.touches.get(id);
		if (!touch) {
			if (this.touches.size >= MAX_FLUID_TOUCHES) return;
			this.hue = (this.hue + 0.61803398875) % 1;
			touch = {
				direction,
				impulse: new THREE.Vector3(),
				color: new THREE.Color().setHSL(this.hue, 0.9, 0.55),
				fresh: true,
				pending: true,
				released: false,
			};
			this.touches.set(id, touch);
			return;
		}

		const previous = touch.direction;
		const cosine = THREE.MathUtils.clamp(previous.dot(direction), -1, 1);
		if (cosine > -0.98) {
			// Transport any displacement accumulated since the previous GPU step.
			touch.impulse.addScaledVector(
				previous.clone().add(direction),
				-touch.impulse.dot(direction) / (1 + cosine),
			);
			const angle = Math.acos(cosine);
			const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
			if (sine > 1e-7) {
				// Arrival tangent of the great-circle arc, scaled by its angular length.
				touch.impulse.add(
					direction.clone().multiplyScalar(cosine).sub(previous)
						.multiplyScalar(Math.min(angle, 0.35) / sine),
				);
			}
		} else {
			// A hardware teleport has no useful shortest-arc velocity.
			touch.impulse.set(0, 0, 0);
		}
		touch.direction.copy(direction);
		touch.impulse.addScaledVector(direction, -touch.impulse.dot(direction));
		touch.impulse.clampLength(0, 0.5);
		touch.pending = true;
		touch.released = false;
	}

	release(id: number) {
		const touch = this.touches.get(id);
		if (touch) touch.released = true;
	}

	consume(dt: number): FluidSplat[] {
		const splats: FluidSplat[] = [];
		for (const [id, touch] of this.touches) {
			if (!touch.released || touch.pending) {
				splats.push({
					direction: touch.direction.clone(),
					impulse: touch.impulse.clone(),
					color: touch.color,
					dyeAmount: touch.fresh ? Math.max(dt, 0.045) : dt,
				});
			}
			touch.impulse.set(0, 0, 0);
			touch.fresh = false;
			touch.pending = false;
			if (touch.released) this.touches.delete(id);
		}
		return splats;
	}

	clear() {
		this.touches.clear();
	}
}
