import { TouchId } from "./tuioProtocol";

/** Track raycast targets across touch updates. A target stays pressed until
 * its last touch leaves, even when several fingers share the same target.
 */
export class TouchTargetTracker<T> {
	private targetsByTouch = new Map<TouchId, T>();
	private touchesByTarget = new Map<T, Set<TouchId>>();

	constructor(
		private onPress: (target: T, touchId: TouchId) => void,
		private onRelease: (target: T, touchId: TouchId) => void,
	) {}

	update(touchId: TouchId, target: T | undefined): void {
		const previous = this.targetsByTouch.get(touchId);
		if (previous === target) return;
		this.remove(touchId);
		if (target === undefined) return;

		this.targetsByTouch.set(touchId, target);
		let touches = this.touchesByTarget.get(target);
		if (!touches) {
			touches = new Set();
			this.touchesByTarget.set(target, touches);
		}
		touches.add(touchId);
		if (touches.size === 1) this.onPress(target, touchId);
	}

	remove(touchId: TouchId): void {
		const target = this.targetsByTouch.get(touchId);
		if (target === undefined) return;
		this.targetsByTouch.delete(touchId);
		const touches = this.touchesByTarget.get(target)!;
		touches.delete(touchId);
		if (touches.size === 0) {
			this.touchesByTarget.delete(target);
			this.onRelease(target, touchId);
		}
	}

	clear(): void {
		for (const touchId of Array.from(this.targetsByTouch.keys())) {
			this.remove(touchId);
		}
	}
}
