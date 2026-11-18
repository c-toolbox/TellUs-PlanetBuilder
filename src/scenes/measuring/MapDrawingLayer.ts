import * as THREE from "three";
import type { OmniUser } from "@/network/omniProtocol";
import type { DrawingPoint } from "./protocol";
import SphericalDrawing from "./SphericalDrawing";

/** Drawing meshes only. MeasuringScene owns the protocol, subscriptions, and saved points. */
export default class MapDrawingLayer extends THREE.Group {
	private readonly drawings = new Map<string, SphericalDrawing>();

	constructor() {
		super();
		this.name = "Map drawings";
	}

	setDrawing(
		user: OmniUser,
		points: readonly DrawingPoint[],
		color: THREE.ColorRepresentation,
		colorIndex: number,
	): void {
		if (!points.some((point) => point !== null)) { this.removeDrawing(user.id); return; }
		let drawing = this.drawings.get(user.id);
		if (!drawing) {
			drawing = new SphericalDrawing(color, user.name, colorIndex);
			drawing.userData.omniUserId = user.id;
			this.drawings.set(user.id, drawing);
			this.add(drawing);
		}
		drawing.name = `Map drawing: ${user.name}`;
		drawing.setPoints(points);
	}

	removeDrawing(userId: string): void {
		this.drawings.get(userId)?.dispose();
		this.drawings.delete(userId);
	}

	clearDrawings(): void {
		for (const drawing of this.drawings.values()) drawing.dispose();
		this.drawings.clear();
	}
}
