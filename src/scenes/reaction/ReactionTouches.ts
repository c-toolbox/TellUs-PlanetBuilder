import * as THREE from "three";

export const MAX_REACTION_TOUCHES = 16;

export interface ReactionStroke {
	start: THREE.Vector3;
	end: THREE.Vector3;
	exposure: number;
}

interface ReactionTouch {
	start: THREE.Vector3;
	end: THREE.Vector3;
	fresh: boolean;
	pending: boolean;
	released: boolean;
}

/** Keep quick taps until the next simulation tick and bridge drag samples on S². */
export class ReactionTouches {
	private touches = new Map<number, ReactionTouch>();

	update(id: number, vector: THREE.Vector3) {
		const lengthSquared = vector.lengthSq();
		if (!Number.isFinite(lengthSquared) || lengthSquared < 1e-12) return;
		const direction = vector.clone().normalize();
		const touch = this.touches.get(id);
		if (!touch) {
			if (this.touches.size >= MAX_REACTION_TOUCHES) return;
			this.touches.set(id, { start: direction.clone(), end: direction, fresh: true, pending: true, released: false });
			return;
		}
		// A jump larger than 0.6 radians is likely a tracking discontinuity.
		if (touch.start.dot(direction) < Math.cos(0.6)) touch.start.copy(direction);
		touch.end.copy(direction);
		touch.pending = true;
		touch.released = false;
	}

	release(id: number) {
		const touch = this.touches.get(id);
		if (touch) touch.released = true;
	}

	consume(dt: number): ReactionStroke[] {
		const strokes: ReactionStroke[] = [];
		for (const [id, touch] of this.touches) {
			if (!touch.released || touch.pending) {
				strokes.push({
					start: touch.start.clone(), end: touch.end.clone(),
					exposure: touch.fresh ? Math.max(dt, 0.05) : dt,
				});
			}
			touch.start.copy(touch.end);
			touch.fresh = false;
			touch.pending = false;
			if (touch.released) this.touches.delete(id);
		}
		return strokes;
	}

	clear() {
		this.touches.clear();
	}
}
