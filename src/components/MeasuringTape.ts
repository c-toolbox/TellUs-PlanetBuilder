import * as THREE from "three";
import TextLabel from "@/components/TextLabel";
import SphericalOutline, { SPHERICAL_OUTLINE_WIDTH } from "@/rendering/SphericalOutline";
import { TouchInteraction } from "@/network/TouchInteraction";
import { TouchId } from "@/network/tuioProtocol";

const EARTH_CIRCUMFERENCE_KM = 40_075;
const TICK_INTERVAL_KM = 100;
const MAJOR_TICK_INTERVAL = 10;
const MAX_TICKS = Math.floor(EARTH_CIRCUMFERENCE_KM / 2 / TICK_INTERVAL_KM);
const ROPE_SEGMENTS = 128;

// Handle and text dimensions are multiples of the tape radius.
const HANDLE_VISIBLE_RADIUS = 0.02;
const HANDLE_TOUCH_RADIUS = 0.1;
const HANDLE_SEGMENTS = 48;
const LABEL_FONT_SIZE = 0.015;
const LABEL_MAX_WIDTH = 0.12;

// Ribbon/tick dimensions, label offset and outline width are angles in radians.
const ROPE_WIDTH = 0.008;
const ROPE_TOUCH_WIDTH = 0.1;
// Farther from the origin than any handle target, so handles always win the raycast.
const ROPE_TOUCH_RADIUS_SCALE = 1.03;
const MIN_TAPE_ANGLE = 1e-3;
// Pivoted expansion stops short of the antipode, where the shortest arc flips.
const MAX_PIVOT_ANGLE = Math.PI * 0.95;
const TICK_LENGTH = 0.012;
const TICK_WIDTH = 0.002;
const MAJOR_TICK_LENGTH = 0.02;
const MAJOR_TICK_WIDTH = 0.004;
// Clear space between the tick end and the label's hook, the middle of its near end.
const LABEL_GAP_ANGLE = 0.014;
const LABEL_RADIUS_SCALE = 1.01;
// Max rotation about the hook away from reading perpendicular to the tape.
const LABEL_MAX_TILT = THREE.MathUtils.degToRad(30);
const NORTH = new THREE.Vector3(0, 1, 0);

type HandleMesh = THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

interface HandleState {
	mesh: HandleMesh;
	interaction: TouchInteraction;
	dragOffset: THREE.Quaternion;
	activeTouchId?: TouchId;
}

export interface MeasuringTapeOptions {
	/** Directions in tape space. Keep the tape centered on the display origin. */
	start: THREE.Vector3;
	end: THREE.Vector3;
	color: THREE.ColorRepresentation;
	radius?: number;
}

/** A freely draggable measuring tape following the shortest great-circle arc. */
export default class MeasuringTape extends THREE.Group {
	readonly startHandle: HandleMesh;
	readonly endHandle: HandleMesh;
	readonly touchInteractions: readonly TouchInteraction[];
	private readonly handleStates: readonly [HandleState, HandleState];
	private readonly ropeTouches = new Map<TouchId, THREE.Vector3>();
	private readonly ropeHitGeometry: THREE.BufferGeometry;
	private readonly ropeHit: THREE.Mesh<
		THREE.BufferGeometry,
		THREE.MeshBasicMaterial
	>;
	private readonly material: THREE.MeshBasicMaterial;
	private readonly outlinedShapes = new THREE.Group();
	private readonly handleGeometry = new THREE.CircleGeometry(
		HANDLE_VISIBLE_RADIUS,
		HANDLE_SEGMENTS,
	);
	private readonly handleTouchGeometry = new THREE.CircleGeometry(
		HANDLE_TOUCH_RADIUS,
		HANDLE_SEGMENTS,
	);
	private readonly handleTouchMaterial = new THREE.MeshBasicMaterial({
		visible: false,
		side: THREE.FrontSide,
	});
	private readonly ropeGeometry: THREE.BufferGeometry;
	private readonly tickGeometry: THREE.BufferGeometry;
	private readonly rope: THREE.Mesh<
		THREE.BufferGeometry,
		THREE.MeshBasicMaterial
	>;
	private readonly ticks: THREE.Mesh<
		THREE.BufferGeometry,
		THREE.MeshBasicMaterial
	>;
	private readonly labels: TextLabel[];
	private readonly radius: number;
	private readonly outline: SphericalOutline;
	private readonly start = new THREE.Vector3();
	private readonly end = new THREE.Vector3();
	private readonly normal = new THREE.Vector3(0, 1, 0);
	private readonly cross = new THREE.Vector3();
	private readonly tangent = new THREE.Vector3();
	private readonly point = new THREE.Vector3();
	private readonly edge = new THREE.Vector3();
	private readonly along = new THREE.Vector3();
	private readonly facing = new THREE.Vector3();
	private readonly textRight = new THREE.Vector3();
	private readonly textUp = new THREE.Vector3();
	private readonly textNorth = new THREE.Vector3();
	private readonly textSpin = new THREE.Vector3();
	private readonly labelDirection = new THREE.Vector3();
	private readonly zAxis = new THREE.Vector3(0, 0, 1);
	private readonly inverseWorld = new THREE.Matrix4();
	private readonly labelBasis = new THREE.Matrix4();
	private readonly touchDirection = new THREE.Vector3();
	private readonly nextDirection = new THREE.Vector3();
	private readonly pivotAxis = new THREE.Vector3();
	private readonly pivotFrom = new THREE.Vector3();
	private readonly pivotTo = new THREE.Vector3();
	private readonly moveRotation = new THREE.Quaternion();
	private readonly frameBefore = new THREE.Matrix4();
	private readonly frameAfter = new THREE.Matrix4();
	private readonly frameMid = new THREE.Vector3();
	private readonly frameSide = new THREE.Vector3();
	private readonly frameUp = new THREE.Vector3();
	private currentDistanceKm = 0;

	constructor({ start, end, color, radius = 1 }: MeasuringTapeOptions) {
		super();
		if (
			![...start.toArray(), ...end.toArray(), radius].every(Number.isFinite) ||
			start.lengthSq() === 0 ||
			end.lengthSq() === 0 ||
			radius <= 0
		) {
			throw new Error("Invalid measuring tape directions or radius");
		}
		this.radius = radius;
		this.add(this.outlinedShapes);
		this.material = new THREE.MeshBasicMaterial({
			color,
			side: THREE.DoubleSide,
		});
		this.ropeGeometry = this.createGeometry(
			(ROPE_SEGMENTS + 1) * 2,
			radius * 1.02,
		);
		const ropeIndices: number[] = [];
		for (let i = 0; i < ROPE_SEGMENTS; i++) {
			const vertex = i * 2;
			ropeIndices.push(
				vertex,
				vertex + 1,
				vertex + 2,
				vertex + 1,
				vertex + 3,
				vertex + 2,
			);
		}
		this.ropeGeometry.setIndex(ropeIndices);
		this.rope = new THREE.Mesh(this.ropeGeometry, this.material);
		this.rope.name = "Measuring tape ribbon";

		this.ropeHitGeometry = this.createGeometry(
			(ROPE_SEGMENTS + 1) * 2,
			radius * ROPE_TOUCH_RADIUS_SCALE,
		);
		this.ropeHitGeometry.setIndex(ropeIndices);
		this.ropeHit = new THREE.Mesh(
			this.ropeHitGeometry,
			new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
		);
		this.ropeHit.name = "Measuring tape touch area";
		this.add(this.ropeHit);

		this.tickGeometry = this.createGeometry(MAX_TICKS * 4, radius * 1.019);
		const tickIndices: number[] = [];
		for (let i = 0; i < MAX_TICKS; i++) {
			const vertex = i * 4;
			tickIndices.push(
				vertex,
				vertex + 1,
				vertex + 2,
				vertex + 1,
				vertex + 3,
				vertex + 2,
			);
		}
		this.tickGeometry.setIndex(tickIndices);
		this.ticks = new THREE.Mesh(this.tickGeometry, this.material);
		this.ticks.name = "Measuring tape ticks";
		this.outlinedShapes.add(this.rope, this.ticks);

		// A shortest arc is at most half the circumference: one reusable label per major tick.
		this.labels = Array.from(
			{ length: Math.floor(MAX_TICKS / MAJOR_TICK_INTERVAL) },
			(_, i) => {
				const distance = (i + 1) * MAJOR_TICK_INTERVAL * TICK_INTERVAL_KM;
				const label = new TextLabel(
					`${distance.toLocaleString("en-US")} km`,
					radius * LABEL_FONT_SIZE,
					"center",
					radius * LABEL_MAX_WIDTH,
				);
				label.material.color.set(0xffffff);
				label.visible = false;
				// Extents are unknown until the font loads.
				label.onLayout = () => this.updateTape();
				this.add(label);
				return label;
			},
		);

		this.handleStates = [this.createHandle(start), this.createHandle(end)];
		this.startHandle = this.handleStates[0].mesh;
		this.endHandle = this.handleStates[1].mesh;
		this.startHandle.name = "Measuring tape start";
		this.endHandle.name = "Measuring tape end";
		this.touchInteractions = [
			this.handleStates[0].interaction,
			this.handleStates[1].interaction,
			this.createRopeInteraction(),
		];
		this.updateTape();
		// Outline the ribbon, ticks and handles; labels remain plain white.
		this.outline = new SphericalOutline(
			this.outlinedShapes,
			radius * 1.04,
			SPHERICAL_OUTLINE_WIDTH,
			0xffffff,
		);
	}

	get distanceKm(): number {
		return this.currentDistanceKm;
	}

	/** Release touch ownership without moving either endpoint. */
	resetInteraction() {
		this.handleStates.forEach((handle) => {
			handle.activeTouchId = undefined;
		});
		this.ropeTouches.clear();
	}

	private createRopeInteraction(): TouchInteraction {
		const interaction = new TouchInteraction(this.ropeHit, {
			enabled: () => this.rope.visible,
		});
		interaction.on("press", ({ touchId, direction }) => {
			if (!this.setTouchDirection(direction)) return;
			this.ropeTouches.set(touchId, this.touchDirection.clone());
		});
		const drag = ({
			touchId,
			direction,
		}: {
			touchId: TouchId;
			direction: THREE.Vector3;
		}) => {
			const previous = this.ropeTouches.get(touchId);
			if (!previous || !this.setTouchDirection(direction)) return;
			if (previous.distanceToSquared(this.touchDirection) < 1e-16) return;
			this.moveFromRope(touchId, previous, this.touchDirection);
			previous.copy(this.touchDirection);
		};
		interaction.on("hold", drag);
		interaction.on("drag", drag);
		interaction.on("release", (event) => {
			if (!this.ropeTouches.has(event.touchId)) return;
			drag(event);
			this.ropeTouches.delete(event.touchId);
		});
		return interaction;
	}

	/** Pivot around a held handle, rigidly follow two rope touches, or slide with one. */
	private moveFromRope(
		touchId: TouchId,
		previous: THREE.Vector3,
		current: THREE.Vector3,
	) {
		const pivot = this.handleStates.find(
			(handle) => handle.activeTouchId !== undefined,
		);
		if (pivot) {
			const free =
				pivot === this.handleStates[0]
					? this.handleStates[1]
					: this.handleStates[0];
			// Only the earliest rope touch steers the pivoted rotation.
			if (
				free.activeTouchId !== undefined ||
				this.ropeTouches.keys().next().value !== touchId
			)
				return;
			this.pivotAxis.copy(pivot.mesh.position).normalize();
			this.pivotFrom
				.copy(previous)
				.addScaledVector(this.pivotAxis, -previous.dot(this.pivotAxis));
			this.pivotTo
				.copy(current)
				.addScaledVector(this.pivotAxis, -current.dot(this.pivotAxis));
			if (this.pivotFrom.lengthSq() < 1e-8 || this.pivotTo.lengthSq() < 1e-8)
				return;
			const angle = Math.atan2(
				this.pivotAxis.dot(this.cross.crossVectors(this.pivotFrom, this.pivotTo)),
				this.pivotFrom.dot(this.pivotTo),
			);
			this.moveRotation.setFromAxisAngle(this.pivotAxis, angle);

			// Scale the length with the finger's distance from the pivot, so the fingers stay on the rope.
			const fromDistance = Math.atan2(
				this.pivotFrom.length(),
				previous.dot(this.pivotAxis),
			);
			const toDistance = Math.atan2(
				this.pivotTo.length(),
				current.dot(this.pivotAxis),
			);
			const scale =
				fromDistance > 1e-3
					? THREE.MathUtils.clamp(toDistance / fromDistance, 0.5, 2)
					: 1;
			const freePosition = free.mesh.position;
			this.along
				.copy(freePosition)
				.normalize()
				.addScaledVector(
					this.pivotAxis,
					-freePosition.dot(this.pivotAxis) / this.radius,
				);
			if (this.along.lengthSq() < 1e-12) return;
			this.along.normalize().applyQuaternion(this.moveRotation);
			const currentLength = Math.acos(
				THREE.MathUtils.clamp(
					freePosition.dot(this.pivotAxis) / this.radius,
					-1,
					1,
				),
			);
			let length = currentLength * scale;
			if (scale > 1) {
				// Growth gets stiffer near the cap and never passes it.
				const friction = Math.max(0, 1 - (currentLength / MAX_PIVOT_ANGLE) ** 2);
				length = Math.min(
					currentLength + (length - currentLength) * friction,
					Math.max(currentLength, MAX_PIVOT_ANGLE),
				);
			}
			length = Math.max(length, MIN_TAPE_ANGLE);
			freePosition
				.copy(this.pivotAxis)
				.multiplyScalar(Math.cos(length))
				.addScaledVector(this.along, Math.sin(length))
				.multiplyScalar(this.radius);
			this.orientHandle(free.mesh);
			this.updateTape();
			return;
		}

		let otherTouch: THREE.Vector3 | undefined;
		for (const [id, direction] of this.ropeTouches) {
			if (id !== touchId) {
				otherTouch = direction;
				break;
			}
		}
		if (
			otherTouch &&
			this.setFrame(this.frameBefore, previous, otherTouch) &&
			this.setFrame(this.frameAfter, current, otherTouch)
		) {
			this.moveRotation.setFromRotationMatrix(
				this.frameAfter.multiply(this.frameBefore.transpose()),
			);
		} else {
			this.moveRotation.setFromUnitVectors(previous, current);
		}
		this.rotateHandles(this.handleStates);
	}

	/** Orthonormal frame from the midpoint and heading of two directions. */
	private setFrame(
		matrix: THREE.Matrix4,
		a: THREE.Vector3,
		b: THREE.Vector3,
	): boolean {
		this.frameMid.addVectors(a, b);
		this.frameSide.subVectors(b, a);
		if (this.frameMid.lengthSq() < 1e-8) return false;
		this.frameMid.normalize();
		this.frameSide.addScaledVector(
			this.frameMid,
			-this.frameSide.dot(this.frameMid),
		);
		if (this.frameSide.lengthSq() < 1e-8) return false;
		this.frameSide.normalize();
		this.frameUp.crossVectors(this.frameMid, this.frameSide);
		matrix.makeBasis(this.frameMid, this.frameSide, this.frameUp);
		return true;
	}

	private rotateHandles(handles: readonly HandleState[]) {
		handles.forEach(({ mesh }) => {
			mesh.position
				.applyQuaternion(this.moveRotation)
				.normalize()
				.multiplyScalar(this.radius);
			this.orientHandle(mesh);
		});
		this.updateTape();
	}

	private createHandle(direction: THREE.Vector3): HandleState {
		const mesh = new THREE.Mesh(
			this.handleTouchGeometry,
			this.handleTouchMaterial,
		);
		// Hide only the target material so the visible child follows it and still renders.
		const visibleHandle = new THREE.Mesh(this.handleGeometry, this.material);
		visibleHandle.raycast = () => {};
		mesh.add(visibleHandle);
		mesh.scale.setScalar(this.radius);
		mesh.position.copy(direction).normalize().multiplyScalar(this.radius);
		this.orientHandle(mesh);
		this.outlinedShapes.add(mesh);
		const handle: HandleState = {
			mesh,
			interaction: new TouchInteraction(mesh),
			dragOffset: new THREE.Quaternion(),
		};
		handle.interaction.on("press", ({ touchId, direction }) => {
			if (
				handle.activeTouchId !== undefined ||
				!this.setTouchDirection(direction)
			)
				return;
			handle.activeTouchId = touchId;
			// Preserve where the handle was grabbed, without a jump or spring back.
			this.nextDirection.copy(mesh.position).normalize();
			handle.dragOffset.setFromUnitVectors(
				this.touchDirection,
				this.nextDirection,
			);
		});
		const drag = ({
			touchId,
			direction,
		}: {
			touchId: TouchId;
			direction: THREE.Vector3;
		}) => {
			if (
				handle.activeTouchId !== touchId ||
				!this.setTouchDirection(direction)
			)
				return;
			this.nextDirection
				.copy(this.touchDirection)
				.applyQuaternion(handle.dragOffset)
				.normalize()
				.multiplyScalar(this.radius);
			if (
				mesh.position.distanceToSquared(this.nextDirection) <
				this.radius * this.radius * 1e-16
			)
				return;
			mesh.position.copy(this.nextDirection);
			this.orientHandle(mesh);
			this.updateTape();
		};
		handle.interaction.on("hold", drag);
		handle.interaction.on("drag", drag);
		handle.interaction.on("release", (event) => {
			if (handle.activeTouchId !== event.touchId) return;
			drag(event);
			handle.activeTouchId = undefined;
		});
		return handle;
	}

	private setTouchDirection(direction: THREE.Vector3): boolean {
		if (
			![direction.x, direction.y, direction.z].every(Number.isFinite) ||
			direction.lengthSq() === 0
		)
			return false;
		this.updateWorldMatrix(true, false);
		this.inverseWorld.copy(this.matrixWorld).invert();
		this.touchDirection.copy(direction).transformDirection(this.inverseWorld);
		return true;
	}

	private orientHandle(mesh: HandleMesh) {
		this.facing.copy(mesh.position).normalize().negate();
		mesh.quaternion.setFromUnitVectors(this.zAxis, this.facing);
	}

	private updateTape() {
		this.start.copy(this.startHandle.position).normalize();
		this.end.copy(this.endHandle.position).normalize();
		this.cross.crossVectors(this.start, this.end);
		const sine = this.cross.length();
		const cosine = THREE.MathUtils.clamp(this.start.dot(this.end), -1, 1);
		const angle = Math.atan2(sine, cosine);
		this.currentDistanceKm = (angle * EARTH_CIRCUMFERENCE_KM) / (2 * Math.PI);
		this.rope.visible = angle > 1e-8;
		this.ticks.visible = this.rope.visible;
		if (!this.rope.visible) {
			this.tickGeometry.setDrawRange(0, 0);
			this.labels.forEach((label) => {
				label.visible = false;
			});
			return;
		}

		if (sine > 1e-10) {
			this.normal.copy(this.cross).divideScalar(sine);
		} else {
			// Antipodes have many shortest paths. Retain the previous plane if possible.
			this.normal.addScaledVector(this.start, -this.normal.dot(this.start));
			if (this.normal.lengthSq() < 1e-12) {
				this.cross.set(
					Math.abs(this.start.x) < 0.9 ? 1 : 0,
					Math.abs(this.start.x) < 0.9 ? 0 : 1,
					0,
				);
				this.normal.crossVectors(this.start, this.cross);
			}
			this.normal.normalize();
		}
		this.tangent.crossVectors(this.normal, this.start).normalize();
		const ropePositions = this.ropeGeometry.getAttribute("position");
		const hitPositions = this.ropeHitGeometry.getAttribute("position");
		const halfWidth = ROPE_WIDTH / 2;
		const halfTouchWidth = ROPE_TOUCH_WIDTH / 2;
		for (let i = 0; i <= ROPE_SEGMENTS; i++) {
			this.pointAt((angle * i) / ROPE_SEGMENTS);
			for (let side = 0; side < 2; side++) {
				this.edge
					.copy(this.point)
					.multiplyScalar(Math.cos(halfWidth))
					.addScaledVector(
						this.normal,
						(side === 0 ? -1 : 1) * Math.sin(halfWidth),
					)
					.multiplyScalar(this.radius * 1.02);
				ropePositions.setXYZ(
					i * 2 + side,
					this.edge.x,
					this.edge.y,
					this.edge.z,
				);
				this.edge
					.copy(this.point)
					.multiplyScalar(Math.cos(halfTouchWidth))
					.addScaledVector(
						this.normal,
						(side === 0 ? -1 : 1) * Math.sin(halfTouchWidth),
					)
					.multiplyScalar(this.radius * ROPE_TOUCH_RADIUS_SCALE);
				hitPositions.setXYZ(
					i * 2 + side,
					this.edge.x,
					this.edge.y,
					this.edge.z,
				);
			}
		}
		ropePositions.needsUpdate = true;
		hitPositions.needsUpdate = true;

		const tickCount = Math.min(
			MAX_TICKS,
			Math.floor((this.currentDistanceKm + 1e-7) / TICK_INTERVAL_KM),
		);
		const tickPositions = this.tickGeometry.getAttribute("position");
		for (let i = 1; i <= tickCount; i++) {
			this.pointAt(
				(i * TICK_INTERVAL_KM * 2 * Math.PI) / EARTH_CIRCUMFERENCE_KM,
			);
			this.along.crossVectors(this.normal, this.point).normalize();
			const isMajorTick = i % MAJOR_TICK_INTERVAL === 0;
			const halfLength = (isMajorTick ? MAJOR_TICK_LENGTH : TICK_LENGTH) / 2;
			const halfStroke = (isMajorTick ? MAJOR_TICK_WIDTH : TICK_WIDTH) / 2;
			for (let corner = 0; corner < 4; corner++) {
				this.edge
					.copy(this.point)
					.multiplyScalar(Math.cos(halfLength))
					.addScaledVector(
						this.normal,
						(corner < 2 ? -1 : 1) * Math.sin(halfLength),
					)
					.multiplyScalar(Math.cos(halfStroke))
					.addScaledVector(
						this.along,
						(corner % 2 === 0 ? -1 : 1) * Math.sin(halfStroke),
					)
					.multiplyScalar(this.radius * 1.019);
				tickPositions.setXYZ(
					(i - 1) * 4 + corner,
					this.edge.x,
					this.edge.y,
					this.edge.z,
				);
			}
		}
		tickPositions.needsUpdate = true;
		this.tickGeometry.setDrawRange(0, tickCount * 6);

		this.labels.forEach((label, index) => {
			const tick = (index + 1) * MAJOR_TICK_INTERVAL;
			label.visible = tick <= tickCount;
			if (!label.visible) return;
			this.pointAt(
				(tick * TICK_INTERVAL_KM * 2 * Math.PI) / EARTH_CIRCUMFERENCE_KM,
			);
			this.along.crossVectors(this.normal, this.point).normalize();
			const hookAngle = MAJOR_TICK_LENGTH / 2 + LABEL_GAP_ANGLE;
			this.labelDirection
				.copy(this.point)
				.multiplyScalar(Math.cos(hookAngle))
				.addScaledVector(this.normal, -Math.sin(hookAngle));
			this.orientLabel(this.labelDirection);
			// Hang the text from its hook: the end nearer the tape sits on the anchor, the rest extends away.
			const away = this.textRight.dot(this.normal) <= 0 ? 1 : -1;
			label.position
				.copy(this.labelDirection)
				.multiplyScalar(this.radius * LABEL_RADIUS_SCALE)
				.addScaledVector(this.textRight, away * label.halfExtents.x);
			this.labelBasis.makeBasis(this.textRight, this.textUp, this.facing);
			label.quaternion.setFromRotationMatrix(this.labelBasis);
		});
	}

	/** Sets facing, textUp and textRight for a label at `direction`, using `along` as the tape heading. */
	private orientLabel(direction: THREE.Vector3) {
		// Face the camera inside the globe.
		this.facing.copy(direction).negate();
		this.textUp.copy(this.along);
		// textUp.y is its dot product with north (+Y). Flip to start on the upright side.
		if (this.textUp.y < 0) this.textUp.negate();
		// Tilt toward north within the limit, so sideways tapes stay legible.
		this.textNorth
			.copy(NORTH)
			.addScaledVector(direction, -NORTH.dot(direction));
		if (this.textNorth.lengthSq() > 1e-8) {
			this.textSpin.crossVectors(this.facing, this.textUp);
			const tilt = THREE.MathUtils.clamp(
				Math.atan2(
					this.textSpin.dot(this.textNorth),
					this.textUp.dot(this.textNorth),
				),
				-LABEL_MAX_TILT,
				LABEL_MAX_TILT,
			);
			this.textUp
				.multiplyScalar(Math.cos(tilt))
				.addScaledVector(this.textSpin, Math.sin(tilt));
		}
		this.textRight.crossVectors(this.textUp, this.facing).normalize();
	}

	private pointAt(angle: number) {
		this.point
			.copy(this.start)
			.multiplyScalar(Math.cos(angle))
			.addScaledVector(this.tangent, Math.sin(angle));
	}

	private createGeometry(
		vertexCount: number,
		radius: number,
	): THREE.BufferGeometry {
		const geometry = new THREE.BufferGeometry();
		const positions = new THREE.BufferAttribute(
			new Float32Array(vertexCount * 3),
			3,
		);
		positions.setUsage(THREE.DynamicDrawUsage);
		geometry.setAttribute("position", positions);
		geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
		return geometry;
	}

	dispose() {
		this.outline.dispose();
		this.resetInteraction();
		this.touchInteractions.forEach((interaction) => {
			interaction.enabled = false;
			interaction.removeAllListeners();
		});
		this.handleGeometry.dispose();
		this.handleTouchGeometry.dispose();
		this.handleTouchMaterial.dispose();
		this.ropeGeometry.dispose();
		this.ropeHitGeometry.dispose();
		this.ropeHit.material.dispose();
		this.tickGeometry.dispose();
		this.material.dispose();
		this.labels.forEach((label) => label.dispose());
	}
}
