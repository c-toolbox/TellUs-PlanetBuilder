import * as THREE from "three";
import earcut from "earcut";

import BaseScene from "@/scenes/BaseScene";
import { Renderer } from "@/scenes/Renderer";
import { Tile } from "@/geometry/TileManager";
import { TouchId } from "@/network/tuioProtocol";

import backgroundAsset from "@/assets/backgrounds/globe/standard.jpg";
import worldGeodata from "@/assets/world.json";
import { SceneKey, sceneManager, scenes } from "../SceneManager";
import { UiConfigEvent } from "@/network/uiProtocol";

export default class CountryScene extends BaseScene {
	private countryMeshes: {
		mesh: THREE.Mesh;
		feature: any;
	}[] = [];

	constructor() {
		super();

		this.addBackground(backgroundAsset, 0x888888);

		this.drawCountries();

		this.add(this.touchHandler.touchGroup);
	}

	private onTouchHandler = (touchId: TouchId, vector: THREE.Vector3) =>
		this.onTouch(touchId, vector);
	private onClickHandler = (touchId: TouchId, vector: THREE.Vector3) =>
		this.onClick(touchId, vector);

	override onEnter(renderer: Renderer) {
		console.info("CountryScene.onEnter");

		this.initializeUi();
		this.sendUiConfig();

		// Subscribe to touch events
		this.touchHandler.on("touch", this.onTouchHandler);
		this.touchHandler.on("click", this.onClickHandler);
	}

	override onExit(renderer: Renderer) {
		console.info("CountryScene.onExit");

		// this.clear();

		// Clean up event bindings
		this.touchHandler.off("touch", this.onTouchHandler);
		this.touchHandler.off("click", this.onClickHandler);
		this.uiSocket.removeAllListeners();
	}

	private onTouch(touchId: TouchId, vector: THREE.Vector3) {
		const touchPoint = this.touchHandler.getTouchPoint(touchId);
		if (touchPoint) {
			touchPoint.setTile(Tile.None);
			touchPoint.setColor(0xff0000);
		}

		this.onClick(touchId, vector);
	}

	private onClick(touchId: TouchId, vector: THREE.Vector3) {
		const { lat, lon } = this.vectorToLatLon(vector);

		for (const entry of this.countryMeshes) {
			if (this.isInsideFeature(lon, lat, entry.feature.geometry)) {
				console.log("Clicked country:", entry.feature.properties.name);

				const material = entry.mesh.material as THREE.MeshBasicMaterial;
				material.color.set(Math.random() * 0xffffff);

				return;
			}
		}

		console.log("No country hit");
	}

	/* Coordinates */

	drawCountries() {
		worldGeodata.features.forEach((countryData) => {
			const { type, coordinates } = countryData.geometry;
			const outlineColor = 0xffffff;
			const color = Math.random() * 0xffffff;

			if (type == "Polygon") {
				this.drawCountryOutline(
					coordinates as [number, number][][],
					outlineColor,
				);
				this.drawCountry(
					coordinates as [number, number][][],
					color,
					countryData,
				);
			} else if (type == "MultiPolygon") {
				coordinates.forEach((coords) => {
					this.drawCountryOutline(coords as [number, number][][], outlineColor);
					this.drawCountry(coords as [number, number][][], color, countryData);
				});
			}
		});
	}

	drawCountryOutline(
		coordinates: [number, number][][],
		color: THREE.ColorRepresentation,
	) {
		const points: THREE.Vector3[] = [];

		coordinates[0].forEach(([lon, lat]) => {
			points.push(this.latLonToVector3(lat, lon, 1.001)); // slight offset to avoid z-fighting
		});

		const geometry = new THREE.BufferGeometry().setFromPoints(points);
		geometry.scale(0.5, 0.5, 0.5);

		const material = new THREE.LineBasicMaterial({ color });

		const line = new THREE.LineLoop(geometry, material);
		this.add(line);
	}

	drawCountry(
		coordinates: [number, number][][],
		color: THREE.ColorRepresentation,
		feature: any,
	) {
		const vertices: number[] = [];
		const holes: number[] = [];
		const positions3D: THREE.Vector3[] = [];

		let holeIndex = 0;

		coordinates.forEach((ring, i) => {
			if (i > 0) {
				holeIndex += coordinates[i - 1].length;
				holes.push(holeIndex);
			}

			ring.forEach(([lon, lat]) => {
				// Store 2D for triangulation
				vertices.push(lon, lat);

				// Store 3D version
				positions3D.push(this.latLonToVector3(lat, lon, 1.001));
			});
		});

		// Triangulate
		const indices = earcut(vertices, holes, 2);

		// Build geometry
		const finalVertices: number[] = [];

		indices.forEach((i) => {
			const v = positions3D[i];
			finalVertices.push(v.x, v.y, v.z);
		});

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(finalVertices, 3),
		);
		geometry.computeVertexNormals();

		const material = new THREE.MeshBasicMaterial({
			color,
			side: THREE.DoubleSide,
		});

		const mesh = new THREE.Mesh(geometry, material);

		this.add(mesh);
		this.countryMeshes.push({ mesh, feature });
	}

	latLonToVector3(lat: number, lon: number, radius = 1): THREE.Vector3 {
		const phi = (90 - lat) * (Math.PI / 180); // polar angle
		const theta = (lon + 180) * (Math.PI / 180); // azimuthal

		return new THREE.Vector3(
			radius * Math.sin(phi) * Math.cos(theta),
			radius * Math.cos(phi),
			radius * Math.sin(phi) * Math.sin(theta),
		);
	}

	vectorToLatLon(vector: THREE.Vector3) {
		const lat = 90 - (Math.acos(vector.y) * 180) / Math.PI;
		const lon = (Math.atan2(vector.z, -vector.x) * 180) / Math.PI; // Flip x

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

	/* Socket UI */

	initializeUi() {
		super.initializeUi();
	}

	sendUiConfig() {
		this.uiSocket.send(this.uiConfig);
	}

	get uiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Country",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneKey.Country,
					options: Object.values(SceneKey),
				},
			],
		};
	}
}
