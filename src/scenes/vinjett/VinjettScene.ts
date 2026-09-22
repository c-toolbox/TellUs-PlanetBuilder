import * as THREE from "three";
import BaseScene from "@/scenes/BaseScene";
import { SceneKey } from "@/scenes/SceneManager";
import { Renderer } from "@/rendering/Renderer";

import { TouchId } from "@/network/tuioProtocol";
import { UiConfigEvent } from "@/network/uiProtocol";
import { BACKGROUND_DISTANCE, ORIGIN } from "@/constants";
import CircularButton from "@/components/CircularButton";
import SpeciesBillboard from "@/components/SpeciesBillboard";
import pinIcon from "@/assets/icons/pin.png";
import homeIcon from "@/assets/icons/home.png";
import {
	LocationKey,
	LocationKeys,
	locations,
} from "@/scenes/vinjett/locations";
import { species, SpeciesKey } from "@/scenes/vinjett/species";

type Language = "english" | "swedish";

interface VinjettUiConfig {
	location: LocationKey; // Add in locations.ts
	language: Language;
}

interface BackgroundCacheEntry {
	materials: THREE.MeshBasicMaterial[];
	ready: Promise<THREE.MeshBasicMaterial[]>;
}

interface SpeciesImageCacheEntry {
	texture: THREE.Texture;
	ready: Promise<number>;
}

type TransitionPhase = "idle" | "loading" | "wipe" | "reveal";
type BillboardPhase = "opening" | "open" | "closing";

interface ActiveBillboard {
	speciesKey: SpeciesKey;
	billboard: SpeciesBillboard;
	phase: BillboardPhase;
	elapsed: number;
	closingScale: number;
}

interface PendingLocationChange {
	locationKey: LocationKey;
	origin: THREE.Vector3;
}

const BUTTON_ANIMATION_DURATION = 250;
const BILLBOARD_ANIMATION_DURATION = 250;
const BUTTON_DISTANCE = 2;
const BUTTON_RADIUS = 0.16;
const BILLBOARD_DISTANCE = 1.5;
const WIPE_DURATION = 1000;

export default class VinjettScene extends BaseScene {
	private vinjettConfig: VinjettUiConfig = {
		location: "Home",
		language: "swedish",
	};
	private backgroundCube?: THREE.Mesh<
		THREE.BoxGeometry,
		THREE.MeshBasicMaterial[]
	>;
	private circularButtons: CircularButton[] = [];
	private pinTexture = new THREE.TextureLoader().load(pinIcon);
	private homeTexture = new THREE.TextureLoader().load(homeIcon);
	private speciesTextures = new Map<SpeciesKey, THREE.Texture>();
	private speciesImageCache = new Map<SpeciesKey, SpeciesImageCacheEntry>();
	private speciesBillboards = new Map<SpeciesKey, ActiveBillboard>();
	private loadingSpecies = new Set<SpeciesKey>();
	private pendingLocationChange?: PendingLocationChange;
	private backgroundCache = new Map<LocationKey, BackgroundCacheEntry>();
	private transitionPhase: TransitionPhase = "idle";
	private transitionElapsed = 0;
	private transitionTarget?: LocationKey;
	private transitionOrigin = new THREE.Vector3(0, 0, 1);
	private pendingBackground?: THREE.MeshBasicMaterial[];

	constructor() {
		super();

		this.addBackground(this.vinjettConfig.location);
		this.addCircularButtons();
	}

	private addCircularButtons() {
		this.circularButtons.forEach((button) => {
			this.remove(button);
			button.dispose();
		});
		this.circularButtons = [];

		if (this.vinjettConfig.location === "Home") {
			for (const locationKey of LocationKeys) {
				const location = locations[locationKey];
				if (!("homeButtonRotation" in location)) continue;

				const { pitch, yaw } = location.homeButtonRotation;
				const position = this.pitchYawToVector3(pitch, yaw);
				this.addCircularButton(
					position,
					location.color,
					this.pinTexture,
					location[this.vinjettConfig.language],
					() => this.setLocation(locationKey, position),
				);
			}
			return;
		}

		const location = locations[this.vinjettConfig.location];
		const { pitch, yaw } = location.homeButtonRotation;
		const position = this.pitchYawToVector3(pitch, yaw);
		this.addCircularButton(
			position,
			0x808080,
			this.homeTexture,
			locations.Home[this.vinjettConfig.language],
			() => this.setLocation("Home", position),
		);

		for (const placement of location.species) {
			const position = this.pitchYawToVector3(
				placement.pitch,
				placement.yaw,
			);
			this.addCircularButton(
				position,
				location.color,
				this.getSpeciesTexture(placement.species),
				species[placement.species][this.vinjettConfig.language],
				() => this.openSpeciesBillboard(placement.species, position),
			);
		}
	}

	private getSpeciesTexture(speciesKey: SpeciesKey) {
		const cached = this.speciesTextures.get(speciesKey);
		if (cached) return cached;

		const texture = new THREE.TextureLoader().load(species[speciesKey].thumbnail);
		texture.colorSpace = THREE.SRGBColorSpace;
		this.speciesTextures.set(speciesKey, texture);
		return texture;
	}

	private getSpeciesImage(speciesKey: SpeciesKey): SpeciesImageCacheEntry {
		const cached = this.speciesImageCache.get(speciesKey);
		if (cached) return cached;

		let texture!: THREE.Texture;
		const ready = new Promise<number>((resolve, reject) => {
			texture = new THREE.TextureLoader().load(
				species[speciesKey].image,
				(loadedTexture) => {
					const image = loadedTexture.image as HTMLImageElement;
					resolve(image.naturalWidth / image.naturalHeight);
				},
				undefined,
				reject,
			);
		});
		texture.colorSpace = THREE.SRGBColorSpace;

		const entry = { texture, ready };
		this.speciesImageCache.set(speciesKey, entry);
		return entry;
	}

	private openSpeciesBillboard(
		speciesKey: SpeciesKey,
		buttonPosition: THREE.Vector3,
	) {
		if (
			this.speciesBillboards.has(speciesKey) ||
			this.loadingSpecies.has(speciesKey)
		) {
			return;
		}

		this.loadingSpecies.add(speciesKey);
		const entry = this.getSpeciesImage(speciesKey);
		entry.ready.then(
			(aspectRatio) => {
				if (!this.loadingSpecies.delete(speciesKey)) return;

				const billboard = new SpeciesBillboard({
					position: buttonPosition
						.clone()
						.normalize()
						.multiplyScalar(BILLBOARD_DISTANCE),
					texture: entry.texture,
					aspectRatio,
					label: species[speciesKey][this.vinjettConfig.language],
					onClick: () => this.closeSpeciesBillboard(speciesKey),
				});
				billboard.scale.setScalar(0);
				this.add(billboard);
				this.speciesBillboards.set(speciesKey, {
					speciesKey,
					billboard,
					phase: "opening",
					elapsed: 0,
					closingScale: 1,
				});
			},
			(error) => {
				console.error(`Failed to load species ${speciesKey}`, error);
				this.speciesImageCache.delete(speciesKey);
				this.loadingSpecies.delete(speciesKey);
			},
		);
	}

	private closeSpeciesBillboard(speciesKey: SpeciesKey) {
		const activeBillboard = this.speciesBillboards.get(speciesKey);
		if (!activeBillboard || activeBillboard.phase !== "open") return;

		activeBillboard.elapsed = 0;
		activeBillboard.closingScale = activeBillboard.billboard.scale.x;
		activeBillboard.phase = "closing";
	}

	private updateSpeciesBillboards(delta: number) {
		for (const activeBillboard of this.speciesBillboards.values()) {
			if (activeBillboard.phase === "open") continue;

			activeBillboard.elapsed += delta;
			const progress = Math.min(
				activeBillboard.elapsed / BILLBOARD_ANIMATION_DURATION,
				1,
			);
			const scale =
				activeBillboard.phase === "opening"
					? this.easeOutBack(progress)
					: activeBillboard.closingScale *
						(1 - this.easeInBack(progress));
			activeBillboard.billboard.scale.setScalar(scale);

			if (progress !== 1) continue;

			if (activeBillboard.phase === "opening") {
				activeBillboard.billboard.scale.setScalar(1);
				activeBillboard.phase = "open";
				continue;
			}

			this.remove(activeBillboard.billboard);
			activeBillboard.billboard.dispose();
			this.speciesBillboards.delete(activeBillboard.speciesKey);
		}

		if (
			this.speciesBillboards.size === 0 &&
			this.pendingLocationChange
		) {
			const { locationKey, origin } = this.pendingLocationChange;
			this.pendingLocationChange = undefined;
			this.beginLocationTransition(locationKey, origin);
		}
	}

	private closeAllSpeciesBillboards() {
		this.loadingSpecies.clear();
		this.speciesBillboards.forEach((activeBillboard) => {
			if (activeBillboard.phase === "closing") return;

			activeBillboard.elapsed = 0;
			activeBillboard.closingScale = activeBillboard.billboard.scale.x;
			activeBillboard.phase = "closing";
		});
	}

	private addCircularButton(
		position: THREE.Vector3,
		color: THREE.ColorRepresentation,
		texture: THREE.Texture,
		label: string,
		onClick: () => void,
	) {
			const button = new CircularButton({
				position,
				color,
				texture,
				radius: BUTTON_RADIUS,
				label,
				onClick,
			});

			this.circularButtons.push(button);
			this.add(button);
	}

	private setLocation(
		locationKey: LocationKey,
		origin = this.getTransitionOrigin(locationKey),
	) {
		if (
			this.transitionPhase !== "idle" ||
			this.pendingLocationChange ||
			locationKey === this.vinjettConfig.location
		) {
			return;
		}

		const normalizedOrigin = origin.clone().normalize();
		this.closeAllSpeciesBillboards();
		if (this.speciesBillboards.size > 0) {
			this.pendingLocationChange = {
				locationKey,
				origin: normalizedOrigin,
			};
			return;
		}

		this.beginLocationTransition(locationKey, normalizedOrigin);
	}

	private beginLocationTransition(
		locationKey: LocationKey,
		origin: THREE.Vector3,
	) {
		this.transitionTarget = locationKey;
		this.transitionOrigin.copy(origin);
		this.pendingBackground = undefined;
		this.transitionPhase = "loading";
		this.transitionElapsed = 0;

		this.getBackground(locationKey).ready.then(
			(materials) => {
				if (this.transitionTarget === locationKey) {
					this.pendingBackground = materials;
				}
			},
			(error) => {
				console.error(`Failed to load location ${locationKey}`, error);
				this.backgroundCache.delete(locationKey);
				if (this.transitionTarget === locationKey) {
					this.transitionTarget = undefined;
					this.transitionPhase = "reveal";
					this.transitionElapsed = 0;
					this.circularButtons.forEach((button) => {
						button.visible = true;
						button.scale.setScalar(0);
					});
				}
			},
		);
	}

	private getTransitionOrigin(locationKey: LocationKey) {
		const originLocationKey =
			this.vinjettConfig.location === "Home"
				? locationKey
				: this.vinjettConfig.location;
		const location = locations[originLocationKey];
		if (!("homeButtonRotation" in location)) {
			return new THREE.Vector3(0, 0, 1);
		}

		const { pitch, yaw } = location.homeButtonRotation;
		return this.pitchYawToVector3(pitch, yaw);
	}

	protected override addBackground(locationKey: LocationKey) {
		this.applyBackground(this.getBackground(locationKey).materials);
	}

	private getBackground(locationKey: LocationKey): BackgroundCacheEntry {
		const cached = this.backgroundCache.get(locationKey);
		if (cached) return cached;

		const location = locations[locationKey];
		const loader = new THREE.TextureLoader();
		const textureEntries = [
			location.px,
			location.nx,
			location.py,
			location.ny,
			location.pz,
			location.nz,
		].map((assetPath) => {
			let texture!: THREE.Texture;
			const ready = new Promise<void>((resolve, reject) => {
				texture = loader.load(assetPath, () => resolve(), undefined, reject);
			});
			texture.colorSpace = THREE.SRGBColorSpace;
			return { texture, ready };
		});
		const materials = textureEntries.map(
			({ texture }) =>
				new THREE.MeshBasicMaterial({
					map: texture,
					side: THREE.BackSide,
				}),
		);
		const entry = {
			materials,
			ready: Promise.all(textureEntries.map(({ ready }) => ready)).then(
				() => materials,
			),
		};
		this.backgroundCache.set(locationKey, entry);
		return entry;
	}

	private applyBackground(materials: THREE.MeshBasicMaterial[]) {
		if (this.backgroundCube) {
			this.backgroundCube.material = materials;
			return;
		}

		const size = BACKGROUND_DISTANCE * 2;
		this.backgroundCube = new THREE.Mesh(
			new THREE.BoxGeometry(size, size, size),
			materials,
		);
		this.backgroundCube.position.copy(ORIGIN);
		this.add(this.backgroundCube);
	}

	private finishBackgroundSwap() {
		if (!this.transitionTarget || !this.pendingBackground) return;

		this.applyBackground(this.pendingBackground);
		this.vinjettConfig.location = this.transitionTarget;
		this.transitionTarget = undefined;
		this.pendingBackground = undefined;
		this.addCircularButtons();
		this.circularButtons.forEach((button) => button.scale.setScalar(0));
		this.sendUiConfig();
		this.transitionPhase = "reveal";
		this.transitionElapsed = 0;
	}

	private easeInBack(progress: number) {
		const overshoot = 1.70158;
		return (overshoot + 1) * progress ** 3 - overshoot * progress ** 2;
	}

	private easeOutBack(progress: number) {
		const overshoot = 1.70158;
		return (
			1 +
			(overshoot + 1) * (progress - 1) ** 3 +
			overshoot * (progress - 1) ** 2
		);
	}

	override update(delta: number) {
		if (this.transitionPhase === "idle") {
			this.updateSpeciesBillboards(delta);
			return;
		}

		if (this.transitionPhase === "loading") {
			this.transitionElapsed += delta;
			const progress = Math.min(
				this.transitionElapsed / BUTTON_ANIMATION_DURATION,
				1,
			);
			const scale = 1 - this.easeInBack(progress);
			this.circularButtons.forEach((button) => button.scale.setScalar(scale));

			if (progress === 1) {
				this.circularButtons.forEach((button) => (button.visible = false));
				if (this.pendingBackground) {
					this.transitionPhase = "wipe";
					this.transitionElapsed = 0;
				}
			}
			return;
		}

		this.transitionElapsed += delta;
		if (this.transitionPhase === "wipe") {
			const progress = Math.min(this.transitionElapsed / WIPE_DURATION, 1);
			if (progress === 1) {
				this.finishBackgroundSwap();
			}
			return;
		}

		const progress = Math.min(
			this.transitionElapsed / BUTTON_ANIMATION_DURATION,
			1,
		);
		const scale = this.easeOutBack(progress);
		this.circularButtons.forEach((button) => button.scale.setScalar(scale));

		if (progress === 1) {
			this.circularButtons.forEach((button) => button.scale.setScalar(1));
			this.transitionPhase = "idle";
		}
	}

	override renderScene(renderer: Renderer) {
		const projectionScene = renderer.projectionScene;
		const cameraPosition = renderer.centerCamera.position;
		const cameraQuaternion = renderer.centerCamera.quaternion;

		projectionScene.cubeCamera.position.copy(cameraPosition);
		projectionScene.cubeCamera.quaternion.copy(cameraQuaternion);
		projectionScene.cubeCamera.update(renderer, this);

		if (
			this.transitionPhase === "wipe" &&
			this.backgroundCube &&
			this.pendingBackground
		) {
			const currentBackground = this.backgroundCube.material;
			this.backgroundCube.material = this.pendingBackground;

			projectionScene.transitionCubeCamera.position.copy(cameraPosition);
			projectionScene.transitionCubeCamera.quaternion.copy(cameraQuaternion);
			projectionScene.transitionCubeCamera.update(renderer, this);
			this.backgroundCube.material = currentBackground;

			const localOrigin = this.transitionOrigin
				.clone()
				.applyQuaternion(cameraQuaternion.clone().invert());
			projectionScene.setTransition(
				true,
				Math.min(this.transitionElapsed / WIPE_DURATION, 1),
				localOrigin,
			);
		} else {
			projectionScene.setTransition(false);
		}

		renderer.setRenderTarget(null);
		renderer.render(projectionScene, projectionScene.screenCamera);
	}

	// setRendererSettings(renderer: Renderer) {
	// 	renderer.outputColorSpace = THREE.SRGBColorSpace;
	// }

	/* Touch input */

	protected onClick(touchId: TouchId, vector: THREE.Vector3) {
		if (this.transitionPhase !== "idle" || this.pendingLocationChange) return;

		this.raycaster.set(ORIGIN, vector.clone().normalize());
		const [billboardIntersection] = this.raycaster.intersectObjects(
			Array.from(this.speciesBillboards.values(), ({ billboard }) => billboard),
		);
		if (billboardIntersection) {
			const activeBillboard = Array.from(
				this.speciesBillboards.values(),
			).find(({ billboard }) => billboard === billboardIntersection.object);
			if (activeBillboard?.phase === "open") {
				activeBillboard.billboard.click();
			}
			return;
		}

		const [intersection] = this.raycaster.intersectObjects(
			this.circularButtons,
		);

		if (intersection) {
			(intersection.object as CircularButton).click();
		}
	}

	/* Coordinates */

	private pitchYawToVector3(
		pitchDegrees: number,
		yawDegrees: number,
		radius = BUTTON_DISTANCE,
	): THREE.Vector3 {
		const pitch = THREE.MathUtils.degToRad(pitchDegrees);
		const yaw = THREE.MathUtils.degToRad(yawDegrees);

		return new THREE.Vector3(
			radius * Math.cos(pitch) * Math.sin(yaw),
			radius * Math.sin(pitch),
			radius * Math.cos(pitch) * Math.cos(yaw),
		);
	}

	/* Socket UI */

	initializeUi() {
		super.initializeUi();

		this.uiSocket.on("location", (value: LocationKey) => {
			this.setLocation(value);
		});

		this.uiSocket.on("language", (value: Language) => {
			this.vinjettConfig.language = value;
			this.speciesBillboards.forEach(({ speciesKey, billboard }) => {
				billboard.setLabel(species[speciesKey][value]);
			});
			if (
				this.transitionPhase === "idle" &&
				!this.pendingLocationChange
			) {
				this.addCircularButtons();
			}
			this.sendUiConfig();
		});
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

				{
					type: "dropdown",
					id: "location",
					hint_title: "Location",
					hint_text: "Select the location for the scene",
					value: this.vinjettConfig.location,
					options: LocationKeys, // Add list of all valid location keys
				},
				{
					type: "dropdown",
					id: "language",
					hint_title: "Language",
					hint_text: "Select the language for names",
					value: this.vinjettConfig.language,
					options: ["swedish", "english"],
				},
			],
		};
	}
}
