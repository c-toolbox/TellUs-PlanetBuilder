import * as THREE from "three";
import TextLabel from "@/components/TextLabel";
import { TouchInteraction } from "@/network/TouchInteraction";
import { TouchId } from "@/network/tuioProtocol";

const EARTH_CIRCUMFERENCE_KM = 40_075;
const TICK_INTERVAL_KM = 100;
const MAJOR_TICK_INTERVAL = 10;
const MAX_TICKS = Math.floor(EARTH_CIRCUMFERENCE_KM / 2 / TICK_INTERVAL_KM);
const ROPE_SEGMENTS = 128;

// Handle and text dimensions are multiples of the tape radius.
const HANDLE_VISIBLE_RADIUS = 0.02;
const HANDLE_TOUCH_RADIUS = 0.06;
const HANDLE_SEGMENTS = 48;
const LABEL_FONT_SIZE = 0.02;
const LABEL_MAX_WIDTH = 0.12;

// Full ribbon/tick dimensions and label offset are angles in radians.
const ROPE_WIDTH = 0.008;
const TICK_LENGTH = 0.02;
const TICK_WIDTH = 0.002;
const MAJOR_TICK_LENGTH = 0.04;
const MAJOR_TICK_WIDTH = 0.004;
const LABEL_OFFSET_ANGLE = 0.08;

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
	readonly touchInteractions: readonly [TouchInteraction, TouchInteraction];
	private readonly handleStates: readonly [HandleState, HandleState];
	private readonly material: THREE.MeshBasicMaterial;
	private readonly handleGeometry = new THREE.CircleGeometry(HANDLE_VISIBLE_RADIUS, HANDLE_SEGMENTS);
	private readonly handleTouchGeometry = new THREE.CircleGeometry(HANDLE_TOUCH_RADIUS, HANDLE_SEGMENTS);
	private readonly handleTouchMaterial = new THREE.MeshBasicMaterial({
		visible: false,
		side: THREE.FrontSide,
	});
	private readonly ropeGeometry: THREE.BufferGeometry;
	private readonly tickGeometry: THREE.BufferGeometry;
	private readonly rope: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
	private readonly ticks: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
	private readonly labels: TextLabel[];
	private readonly radius: number;
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
	private readonly labelDirection = new THREE.Vector3();
	private readonly zAxis = new THREE.Vector3(0, 0, 1);
	private readonly inverseWorld = new THREE.Matrix4();
	private readonly labelBasis = new THREE.Matrix4();
	private readonly touchDirection = new THREE.Vector3();
	private readonly nextDirection = new THREE.Vector3();
	private currentDistanceKm = 0;

	constructor({ start, end, color, radius = 1 }: MeasuringTapeOptions) {
		super();
		if (![...start.toArray(), ...end.toArray(), radius].every(Number.isFinite) ||
			start.lengthSq() === 0 || end.lengthSq() === 0 || radius <= 0) {
			throw new Error("Invalid measuring tape directions or radius");
		}
		this.radius = radius;
		this.material = new THREE.MeshBasicMaterial({ color, side: THREE.FrontSide });
		this.ropeGeometry = this.createGeometry((ROPE_SEGMENTS + 1) * 2, radius * 1.02);
		const ropeIndices: number[] = [];
		for (let i = 0; i < ROPE_SEGMENTS; i++) {
			const vertex = i * 2;
			ropeIndices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2);
		}
		this.ropeGeometry.setIndex(ropeIndices);
		this.rope = new THREE.Mesh(this.ropeGeometry, this.material);
		this.rope.name = "Measuring tape ribbon";

		this.tickGeometry = this.createGeometry(MAX_TICKS * 4, radius * 1.019);
		const tickIndices: number[] = [];
		for (let i = 0; i < MAX_TICKS; i++) {
			const vertex = i * 4;
			tickIndices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2);
		}
		this.tickGeometry.setIndex(tickIndices);
		this.ticks = new THREE.Mesh(this.tickGeometry, this.material);
		this.ticks.name = "Measuring tape ticks";
		this.add(this.rope, this.ticks);

		// A shortest arc is at most half the circumference: one reusable label per major tick.
		this.labels = Array.from({ length: Math.floor(MAX_TICKS / MAJOR_TICK_INTERVAL) }, (_, i) => {
			const distance = (i + 1) * MAJOR_TICK_INTERVAL * TICK_INTERVAL_KM;
			const label = new TextLabel(`${distance.toLocaleString("en-US")} km`, radius * LABEL_FONT_SIZE, radius * LABEL_MAX_WIDTH);
			label.material.color.set(color);
			label.visible = false;
			this.add(label);
			return label;
		});

		this.handleStates = [this.createHandle(start), this.createHandle(end)];
		this.startHandle = this.handleStates[0].mesh;
		this.endHandle = this.handleStates[1].mesh;
		this.startHandle.name = "Measuring tape start";
		this.endHandle.name = "Measuring tape end";
		this.touchInteractions = [this.handleStates[0].interaction, this.handleStates[1].interaction];
		this.updateTape();
	}

	get distanceKm(): number {
		return this.currentDistanceKm;
	}

	/** Release touch ownership without moving either endpoint. */
	resetInteraction() {
		this.handleStates.forEach((handle) => { handle.activeTouchId = undefined; });
	}

	private createHandle(direction: THREE.Vector3): HandleState {
		const mesh = new THREE.Mesh(this.handleTouchGeometry, this.handleTouchMaterial);
		// Hide only the target material so the visible child follows it and still renders.
		const visibleHandle = new THREE.Mesh(this.handleGeometry, this.material);
		visibleHandle.raycast = () => {};
		mesh.add(visibleHandle);
		mesh.scale.setScalar(this.radius);
		mesh.position.copy(direction).normalize().multiplyScalar(this.radius);
		this.orientHandle(mesh);
		this.add(mesh);
		const handle: HandleState = {
			mesh,
			interaction: new TouchInteraction(mesh),
			dragOffset: new THREE.Quaternion(),
		};
		handle.interaction.on("press", ({ touchId, direction }) => {
			if (handle.activeTouchId !== undefined || !this.setTouchDirection(direction)) return;
			handle.activeTouchId = touchId;
			// Preserve where the handle was grabbed, without a jump or spring back.
			this.nextDirection.copy(mesh.position).normalize();
			handle.dragOffset.setFromUnitVectors(this.touchDirection, this.nextDirection);
		});
		const drag = ({ touchId, direction }: { touchId: TouchId; direction: THREE.Vector3 }) => {
			if (handle.activeTouchId !== touchId || !this.setTouchDirection(direction)) return;
			this.nextDirection.copy(this.touchDirection).applyQuaternion(handle.dragOffset).normalize()
				.multiplyScalar(this.radius);
			if (mesh.position.distanceToSquared(this.nextDirection) < this.radius * this.radius * 1e-16) return;
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
		if (![direction.x, direction.y, direction.z].every(Number.isFinite) || direction.lengthSq() === 0) return false;
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
		this.currentDistanceKm = angle * EARTH_CIRCUMFERENCE_KM / (2 * Math.PI);
		this.rope.visible = angle > 1e-8;
		this.ticks.visible = this.rope.visible;
		if (!this.rope.visible) {
			this.tickGeometry.setDrawRange(0, 0);
			this.labels.forEach((label) => { label.visible = false; });
			return;
		}

		if (sine > 1e-10) {
			this.normal.copy(this.cross).divideScalar(sine);
		} else {
			// Antipodes have many shortest paths. Retain the previous plane if possible.
			this.normal.addScaledVector(this.start, -this.normal.dot(this.start));
			if (this.normal.lengthSq() < 1e-12) {
				this.cross.set(Math.abs(this.start.x) < 0.9 ? 1 : 0, Math.abs(this.start.x) < 0.9 ? 0 : 1, 0);
				this.normal.crossVectors(this.start, this.cross);
			}
			this.normal.normalize();
		}
		this.tangent.crossVectors(this.normal, this.start).normalize();
		const ropePositions = this.ropeGeometry.getAttribute("position");
		const halfWidth = ROPE_WIDTH / 2;
		for (let i = 0; i <= ROPE_SEGMENTS; i++) {
			this.pointAt(angle * i / ROPE_SEGMENTS);
			for (let side = 0; side < 2; side++) {
				this.edge.copy(this.point).multiplyScalar(Math.cos(halfWidth))
					.addScaledVector(this.normal, (side === 0 ? -1 : 1) * Math.sin(halfWidth))
					.multiplyScalar(this.radius * 1.02);
				ropePositions.setXYZ(i * 2 + side, this.edge.x, this.edge.y, this.edge.z);
			}
		}
		ropePositions.needsUpdate = true;

		const tickCount = Math.min(MAX_TICKS, Math.floor((this.currentDistanceKm + 1e-7) / TICK_INTERVAL_KM));
		const tickPositions = this.tickGeometry.getAttribute("position");
		for (let i = 1; i <= tickCount; i++) {
			this.pointAt(i * TICK_INTERVAL_KM * 2 * Math.PI / EARTH_CIRCUMFERENCE_KM);
			this.along.crossVectors(this.normal, this.point).normalize();
			const isMajorTick = i % MAJOR_TICK_INTERVAL === 0;
			const halfLength = (isMajorTick ? MAJOR_TICK_LENGTH : TICK_LENGTH) / 2;
			const halfStroke = (isMajorTick ? MAJOR_TICK_WIDTH : TICK_WIDTH) / 2;
			for (let corner = 0; corner < 4; corner++) {
				this.edge.copy(this.point).multiplyScalar(Math.cos(halfLength))
					.addScaledVector(this.normal, (corner < 2 ? -1 : 1) * Math.sin(halfLength))
					.multiplyScalar(Math.cos(halfStroke))
					.addScaledVector(this.along, (corner % 2 === 0 ? -1 : 1) * Math.sin(halfStroke))
					.multiplyScalar(this.radius * 1.019);
				tickPositions.setXYZ((i - 1) * 4 + corner, this.edge.x, this.edge.y, this.edge.z);
			}
		}
		tickPositions.needsUpdate = true;
		this.tickGeometry.setDrawRange(0, tickCount * 6);

		this.labels.forEach((label, index) => {
			const tick = (index + 1) * MAJOR_TICK_INTERVAL;
			label.visible = tick <= tickCount;
			if (!label.visible) return;
			this.pointAt(tick * TICK_INTERVAL_KM * 2 * Math.PI / EARTH_CIRCUMFERENCE_KM);
			this.along.crossVectors(this.normal, this.point).normalize();
			// Leave room for a handle even when it sits directly on a labelled tick.
			this.labelDirection.copy(this.point).multiplyScalar(Math.cos(LABEL_OFFSET_ANGLE))
				.addScaledVector(this.normal, -Math.sin(LABEL_OFFSET_ANGLE));
			label.position.copy(this.labelDirection).multiplyScalar(this.radius * 1.01);
			// Run the baseline across the tape and face the camera inside the globe.
			this.facing.copy(this.labelDirection).negate();
			this.textUp.copy(this.along);
			this.textRight.crossVectors(this.textUp, this.facing).normalize();
			// textUp.y is its dot product with north (+Y). Flip both axes to stay upright.
			if (this.textUp.y < 0) {
				this.textRight.negate();
				this.textUp.negate();
			}
			this.labelBasis.makeBasis(this.textRight, this.textUp, this.facing);
			label.quaternion.setFromRotationMatrix(this.labelBasis);
		});
	}

	private pointAt(angle: number) {
		this.point.copy(this.start).multiplyScalar(Math.cos(angle))
			.addScaledVector(this.tangent, Math.sin(angle));
	}

	private createGeometry(vertexCount: number, radius: number): THREE.BufferGeometry {
		const geometry = new THREE.BufferGeometry();
		const positions = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
		positions.setUsage(THREE.DynamicDrawUsage);
		geometry.setAttribute("position", positions);
		geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
		return geometry;
	}

	dispose() {
		this.resetInteraction();
		this.touchInteractions.forEach((interaction) => {
			interaction.enabled = false;
			interaction.removeAllListeners();
		});
		this.handleGeometry.dispose();
		this.handleTouchGeometry.dispose();
		this.handleTouchMaterial.dispose();
		this.ropeGeometry.dispose();
		this.tickGeometry.dispose();
		this.material.dispose();
		this.labels.forEach((label) => label.dispose());
	}
}
