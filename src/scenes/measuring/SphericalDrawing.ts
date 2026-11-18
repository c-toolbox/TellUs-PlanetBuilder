import * as THREE from "three";
import TextLabel from "@/components/TextLabel";
import SphericalOutline, { SPHERICAL_OUTLINE_WIDTH } from "@/rendering/SphericalOutline";
import type { DrawingPoint, LatLng } from "./protocol";

// The camera is at the origin: tapes at 1..1.04, stroke band at 1.1..1.12, outlines behind it.
export const DRAWING_RADIUS = 1.12;
const DRAWING_DEPTH_RANGE = 0.02;
const DRAWING_OUTLINE_RADIUS = 1.14;
// Color indices advance by 3: initial spacing is about 0.001, then narrows within the band.
const COLOR_INDEX_DEPTH_SCALE = 60;
const HALF_WIDTH = 0.008;
const MAX_ARC_STEP = Math.PI / 90;
const CAP_SEGMENTS = 12;
const ENDPOINT_SEGMENTS = 32;
const LABEL_RADIUS = 1.075;
const LABEL_FONT_SIZE = 0.035;
const LABEL_MAX_WIDTH = 0.35;

interface DrawingArc {
	start: THREE.Vector3;
	tangent: THREE.Vector3;
	angle: number;
}

/** Matches CountryScene and the mirrored equirectangular BackgroundSphere. North is +Y. */
export function latLngToDirection([latitude, longitude]: LatLng): THREE.Vector3 {
	const lat = THREE.MathUtils.degToRad(latitude);
	const lng = THREE.MathUtils.degToRad(longitude);
	return new THREE.Vector3(-Math.cos(lat) * Math.cos(lng), Math.sin(lat), -Math.cos(lat) * Math.sin(lng));
}

/** A constant-width spherical ribbon with round joins, caps, and single-point dots. */
export default class SphericalDrawing extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
	private readonly radius: number;
	private readonly outline: SphericalOutline;
	private readonly nameLabel?: TextLabel;
	private readonly nameOutline?: SphericalOutline;

	constructor(color: THREE.ColorRepresentation, userName = "", colorIndex = 0) {
		super(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
		// Keep later assignments closer even after palette wrap, without ever reaching the tapes.
		this.radius = DRAWING_RADIUS - DRAWING_DEPTH_RANGE * colorIndex / (colorIndex + COLOR_INDEX_DEPTH_SCALE);
		this.visible = false;
		this.outline = new SphericalOutline(
			this, DRAWING_OUTLINE_RADIUS, SPHERICAL_OUTLINE_WIDTH, 0x000000,
		);
		// Add the label after the stroke outline so each shape gets only its own outline.
		if (userName) {
			this.nameLabel = new TextLabel(userName, LABEL_FONT_SIZE, "center", LABEL_MAX_WIDTH);
			this.nameLabel.name = "Drawing name";
			this.nameLabel.visible = false;
			this.add(this.nameLabel);
			this.nameOutline = new SphericalOutline(
				this.nameLabel, DRAWING_OUTLINE_RADIUS, SPHERICAL_OUTLINE_WIDTH, 0x000000,
			);
		}
	}

	setPoints(points: readonly DrawingPoint[]): void {
		const positions: number[] = [];
		const arcs: DrawingArc[] = [];
		let firstDirection: THREE.Vector3 | undefined;
		const write = (...vertices: THREE.Vector3[]) => {
			for (const vertex of vertices) positions.push(...vertex.toArray());
		};
		const offset = (point: THREE.Vector3, normal: THREE.Vector3, sign: number) => point.clone()
			.multiplyScalar(Math.cos(HALF_WIDTH))
			.addScaledVector(normal, sign * Math.sin(HALF_WIDTH)).multiplyScalar(this.radius);
		let previous: THREE.Vector3 | null = null;
		for (const [index, coordinate] of points.entries()) {
			if (coordinate === null) { previous = null; continue; }
			const direction = latLngToDirection(coordinate);
			firstDirection ??= direction;
			const endpoint = !points[index - 1] || !points[index + 1];
			const capRadius = endpoint ? HALF_WIDTH * 2 : HALF_WIDTH;
			const capSegments = endpoint ? ENDPOINT_SEGMENTS : CAP_SEGMENTS;
			const axis = Math.abs(direction.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
			const right = new THREE.Vector3().crossVectors(direction, axis).normalize();
			const up = new THREE.Vector3().crossVectors(direction, right).normalize();
			const center = direction.clone().multiplyScalar(this.radius);
			const capPoint = (angle: number) => direction.clone().multiplyScalar(Math.cos(capRadius))
				.addScaledVector(right, Math.sin(capRadius) * Math.cos(angle))
				.addScaledVector(up, Math.sin(capRadius) * Math.sin(angle)).multiplyScalar(this.radius);
			for (let i = 0; i < capSegments; i++) {
				write(center, capPoint(i / capSegments * Math.PI * 2), capPoint((i + 1) / capSegments * Math.PI * 2));
			}

			if (previous && previous.distanceToSquared(direction) > 1e-16) {
				const normal = new THREE.Vector3().crossVectors(previous, direction);
				// Exact antipodes have no unique shortest path. Pick a stable great-circle plane.
				if (normal.lengthSq() < 1e-20) {
					const fallback = Math.abs(previous.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
					normal.crossVectors(previous, fallback);
				}
				normal.normalize();
				const tangent = new THREE.Vector3().crossVectors(normal, previous);
				const angle = previous.angleTo(direction);
				arcs.push({ start: previous, tangent, angle });
				const segments = Math.max(1, Math.ceil(angle / MAX_ARC_STEP));
				let left = offset(previous, normal, 1), rightEdge = offset(previous, normal, -1);
				for (let i = 1; i <= segments; i++) {
					const point = i === segments ? direction : previous.clone().multiplyScalar(Math.cos(angle * i / segments))
						.addScaledVector(tangent, Math.sin(angle * i / segments)).normalize();
					const nextLeft = offset(point, normal, 1), nextRight = offset(point, normal, -1);
					write(left, rightEdge, nextLeft, rightEdge, nextRight, nextLeft);
					left = nextLeft;
					rightEdge = nextRight;
				}
			}
			previous = direction;
		}

		// Replacing a drawing releases its previous GPU buffers.
		this.geometry.dispose();
		this.geometry = new THREE.BufferGeometry();
		this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
		this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), this.radius);
		this.visible = positions.length > 0;
		this.positionName(arcs, firstDirection);
	}

	private positionName(arcs: readonly DrawingArc[], firstDirection?: THREE.Vector3): void {
		const label = this.nameLabel;
		if (!label) return;
		label.visible = firstDirection !== undefined;
		if (!firstDirection) return;

		let remaining = arcs.reduce((length, arc) => length + arc.angle, 0) / 2;
		const direction = firstDirection.clone();
		for (const arc of arcs) {
			if (remaining <= arc.angle) {
				direction.copy(arc.start).multiplyScalar(Math.cos(remaining))
					.addScaledVector(arc.tangent, Math.sin(remaining)).normalize();
				break;
			}
			remaining -= arc.angle;
		}
		label.position.copy(direction).multiplyScalar(LABEL_RADIUS);
		// Face the origin and keep the text upright relative to geographic north.
		const facing = direction.clone().negate();
		const up = new THREE.Vector3(0, 1, 0).addScaledVector(direction, -direction.y);
		if (up.lengthSq() < 1e-12) up.set(0, 0, 1);
		up.normalize();
		const right = new THREE.Vector3().crossVectors(up, facing).normalize();
		up.crossVectors(facing, right).normalize();
		label.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, facing));
	}

	dispose(): void {
		this.nameOutline?.dispose();
		this.nameLabel?.dispose();
		this.outline.dispose();
		this.geometry.dispose();
		this.material.dispose();
		this.removeFromParent();
	}
}
