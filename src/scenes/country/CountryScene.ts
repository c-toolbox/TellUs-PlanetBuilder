import * as THREE from "three";
import { TouchId } from "@/network/tuioProtocol";
import BaseScene from "../BaseScene";
import { Renderer } from "../Renderer";

import backgroundAsset from "@/assets/backgrounds/globe/standard.jpg";
import worldGeodata from "@/assets/world.json";
import { Tile } from "@/geometry/TileManager";

export default class CountryScene extends BaseScene {
	constructor() {
		super();

		this.addBackground(backgroundAsset, 0x444444);

		this.drawCountries();
	}

	override onEnter(renderer: Renderer) {
		console.log("CountryScene active");

		this.add(this.touchHandler.touchGroup);

		// Subscribe to touch events
		this.touchHandler.on("touch", this.onTouch.bind(this));
		this.touchHandler.on("click", this.onClick.bind(this));
	}

	override onExit(renderer: Renderer) {
		console.log("CountryScene exiting");

		this.clear();

		// Clean up event bindings
		this.touchHandler.off("touch", this.onTouch.bind(this));
		this.touchHandler.off("click", this.onClick.bind(this));
	}

	private onTouch(touchId: TouchId, vector: THREE.Vector3) {
		const touchPoint = this.touchHandler.getTouchPoint(touchId);
		if (touchPoint) {
			touchPoint.setTile(Tile.None);
			touchPoint.setColor(0xff0000);
		}
	}

	private onClick(touchId: TouchId, vector: THREE.Vector3) {
		const { lat, lon } = this.vectorToLatLon(vector);

		for (const feature of worldGeodata.features) {
			if (this.isInsideFeature(lon, lat, feature.geometry)) {
				console.log("Clicked country:", feature.properties.name);
				return;
			}
		}

		console.log("No country hit");
	}

	/* Coordinates */

	drawCountries() {
		worldGeodata.features.forEach((countryData) => {
			const { type, coordinates } = countryData.geometry;
			// const color = Math.random() * 0xffffff;
			const color = 0xffffff;

			if (type == "Polygon") {
				this.drawCountry(coordinates as [number, number][][], color);
			} else if (type == "MultiPolygon") {
				coordinates.forEach((coords) => {
					this.drawCountry(coords as [number, number][][], color);
				});
			}
		});
	}

	drawCountry(
		coordinates: [number, number][][],
		color: THREE.ColorRepresentation,
	) {
		const points: THREE.Vector3[] = [];

		coordinates[0].forEach(([lon, lat]) => {
			points.push(this.latLonToVector3(lat, lon, 1.001)); // slight offset to avoid z-fighting
		});

		const geometry = new THREE.BufferGeometry().setFromPoints(points);

		const material = new THREE.LineBasicMaterial({ color });

		const line = new THREE.LineLoop(geometry, material);
		this.add(line);
	}

	latLonToVector3(lat: number, lon: number, radius = 1): THREE.Vector3 {
		const phi = (90 - lat) * (Math.PI / 180); // polar angle
		const theta = (lon + 180) * (Math.PI / 180); // azimuthal

		return new THREE.Vector3(
			-1 * -radius * Math.sin(phi) * Math.cos(theta),
			radius * Math.cos(phi),
			radius * Math.sin(phi) * Math.sin(theta),
		);
	}

	vectorToLatLon(v: THREE.Vector3) {
		const lat = 90 - (Math.acos(v.y) * 180) / Math.PI;
		const lon = (Math.atan2(v.z, -v.x) * 180) / Math.PI; // Flip x

		return { lat, lon };
	}

	pointInPolygon(point: [number, number], vs: number[][]) {
		const [x, y] = point;
		let inside = false;

		for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
			const xi = vs[i][0],
				yi = vs[i][1];
			const xj = vs[j][0],
				yj = vs[j][1];

			const intersect =
				yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

			if (intersect) inside = !inside;
		}

		return inside;
	}

	isInsidePolygon(lon: number, lat: number, polygon: number[][][]) {
		const [outer, ...holes] = polygon;

		if (!this.pointInPolygon([lon, lat], outer)) return false;

		// Exclude holes
		for (const hole of holes) {
			if (this.pointInPolygon([lon, lat], hole)) return false;
		}

		return true;
	}

	isInsideFeature(lon: number, lat: number, geometry: any) {
		if (geometry.type === "Polygon") {
			return this.isInsidePolygon(lon, lat, geometry.coordinates);
		}

		if (geometry.type === "MultiPolygon") {
			return geometry.coordinates.some((polygon: any) =>
				this.isInsidePolygon(lon, lat, polygon),
			);
		}

		return false;
	}
}

type PolygonCoordinates = [number, number][][];
type MultiPolygonCoordinates = [number, number][][];
