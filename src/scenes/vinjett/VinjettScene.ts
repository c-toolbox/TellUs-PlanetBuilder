import * as THREE from "three";
import { Easing, Tween } from "@tweenjs/tween.js";
import BaseScene from "@/scenes/BaseScene";
import { SceneId, scenes } from "@/scenes/scenes";
import { Renderer } from "@/rendering/Renderer";

import { UiConfigEvent } from "@/network/socket_ui/protocol";
import { ORIGIN } from "@/constants";
import CircleButton from "@/components/CircleButton";
import SpeciesBillboard from "@/components/SpeciesBillboard";
import pinIcon from "@/assets/icons/pin.png";
import homeIcon from "@/assets/icons/home.png";
import questionIcon from "@/assets/icons/question.png";
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

type TransitionPhase = "idle" | "wipe" | "reveal";
type BillboardPhase = "opening" | "open" | "closing";

interface ActiveBillboard {
	speciesKey: SpeciesKey;
	billboard: SpeciesBillboard;
	phase: BillboardPhase;
	tween?: Tween<THREE.Vector3>;
}

const APPEAR_DURATION = 300;
const DISAPPEAR_DURATION = 200;
const BACKGROUND_DISTANCE = 3;
const BUTTON_DISTANCE = 2;
const BUTTON_RADIUS = 0.16;
const BILLBOARD_DISTANCE = 1.8;
const WIPE_DURATION = 750;

export default class VinjettScene extends BaseScene {
	private vinjettConfig: VinjettUiConfig = {
		location: "Home",
		language: "swedish",
	};
	private backgroundCube?: THREE.Mesh<
		THREE.BoxGeometry,
		THREE.MeshBasicMaterial[]
	>;
	private circleButtons: CircleButton[] = [];
	private pinTexture = new THREE.TextureLoader().load(pinIcon);
	private homeTexture = new THREE.TextureLoader().load(homeIcon);
	private questionTexture = new THREE.TextureLoader().load(questionIcon);
	private discoveredSpecies = new Set<SpeciesKey>();
	private speciesButtons = new Map<CircleButton, SpeciesKey>();
	private speciesTextures = new Map<SpeciesKey, THREE.Texture>();
	private speciesImageCache = new Map<SpeciesKey, SpeciesImageCacheEntry>();
	private speciesBillboards = new Map<SpeciesKey, ActiveBillboard>();
	private loadingSpecies = new Set<SpeciesKey>();
	private backgroundCache = new Map<LocationKey, BackgroundCacheEntry>();
	private transitionPhase: TransitionPhase = "idle";
	private transitionElapsed = 0;
	private transitionTarget?: LocationKey;
	private transitionOrigin = new THREE.Vector3(0, 0, 1);
	private pendingBackground?: THREE.MeshBasicMaterial[];
	private outgoingButtons: CircleButton[] = [];
	private outgoingScales = new Map<THREE.Object3D, number>();

	constructor() {
		super();

		this.setLocationBackground(this.vinjettConfig.location);
		this.addCircleButtons();
	}

	override onSceneExit(renderer: Renderer) {
		if (this.pendingBackground) {
			this.applyBackground(this.pendingBackground);
		}
		this.loadingSpecies.clear();
		this.speciesBillboards.forEach((activeBillboard) => {
			this.removeSpeciesBillboard(activeBillboard);
		});
		this.disposeCircleButtons(this.outgoingButtons);
		this.outgoingButtons = [];
		this.outgoingScales.clear();
		this.transitionTarget = undefined;
		this.pendingBackground = undefined;
		this.transitionPhase = "idle";
		this.transitionElapsed = 0;
		this.circleButtons.forEach((button) => {
			button.resetInteraction();
			button.visible = true;
			button.scale.setScalar(1);
		});
		super.onSceneExit(renderer);
	}

	private addCircleButtons() {
		this.disposeCircleButtons(this.circleButtons);
		this.circleButtons = [];
		this.speciesButtons.clear();

		if (this.vinjettConfig.location === "Home") {
			for (const locationKey of LocationKeys) {
				const location = locations[locationKey];
				if (!("homeButtonRotation" in location)) continue;

				const { pitch, yaw } = location.homeButtonRotation;
				const position = this.pitchYawToVector3(pitch, yaw);
				this.addCircleButton(
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
		const position = this.pitchYawToVector3(pitch, yaw).negate();
		this.addCircleButton(
			position,
			0x808080,
			this.homeTexture,
			locations.Home[this.vinjettConfig.language],
			() => this.setLocation("Home", position),
		);

		for (const placement of location.species) {
			const position = this.pitchYawToVector3(placement.pitch, placement.yaw);
			const button = this.addCircleButton(
				position,
				location.color,
				this.getSpeciesButtonTexture(placement.species),
				species[placement.species][this.vinjettConfig.language],
				() => this.openSpeciesBillboard(placement.species, position),
			);
			button.setLabelVisible(this.discoveredSpecies.has(placement.species));
			this.speciesButtons.set(button, placement.species);
		}
	}

	private disposeCircleButtons(buttons: CircleButton[]) {
		buttons.forEach((button) => {
			this.unregisterTouchInteraction(button.touchInteraction);
			this.remove(button);
			button.dispose();
		});
	}

	private discoverSpecies(speciesKey: SpeciesKey) {
		if (this.discoveredSpecies.has(speciesKey)) return;

		this.discoveredSpecies.add(speciesKey);
		this.refreshSpeciesButtons();
	}

	private resetDiscoveredSpecies() {
		this.discoveredSpecies.clear();
		this.refreshSpeciesButtons();
	}

	private getSpeciesButtonTexture(speciesKey: SpeciesKey) {
		return this.discoveredSpecies.has(speciesKey)
			? this.getSpeciesTexture(speciesKey)
			: this.questionTexture;
	}

	private refreshSpeciesButtons() {
		this.speciesButtons.forEach((speciesKey, button) => {
			button.setTexture(this.getSpeciesButtonTexture(speciesKey));
			button.setLabel(species[speciesKey][this.vinjettConfig.language]);
			button.setLabelVisible(this.discoveredSpecies.has(speciesKey));
		});
	}

	private getSpeciesTexture(speciesKey: SpeciesKey) {
		const cached = this.speciesTextures.get(speciesKey);
		if (cached) return cached;

		const texture = new THREE.TextureLoader().load(
			species[speciesKey].thumbnail,
		);
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
		this.discoverSpecies(speciesKey);

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
				billboard.touchInteraction.enabled = () =>
					this.transitionPhase === "idle" &&
					this.speciesBillboards.get(speciesKey)?.phase === "open";
				this.registerTouchInteraction(billboard.touchInteraction);
				billboard.scale.setScalar(0);
				this.add(billboard);
				const activeBillboard: ActiveBillboard = {
					speciesKey,
					billboard,
					phase: "opening",
				};
				this.speciesBillboards.set(speciesKey, activeBillboard);
				activeBillboard.tween = this.createTween(billboard.scale)
					.to({ x: 1, y: 1, z: 1 }, APPEAR_DURATION)
					.easing(Easing.Back.Out)
					.onComplete(() => {
						activeBillboard.phase = "open";
						activeBillboard.tween = undefined;
					})
					.start();
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
		if (!activeBillboard || activeBillboard.phase === "closing") return;

		activeBillboard.tween?.stop();
		activeBillboard.phase = "closing";
		activeBillboard.tween = this.createTween(activeBillboard.billboard.scale)
			.to({ x: 0, y: 0, z: 0 }, DISAPPEAR_DURATION)
			.easing(Easing.Cubic.Out)
			.onComplete(() => {
				this.removeSpeciesBillboard(activeBillboard);
			})
			.start();
	}

	private removeSpeciesBillboard(activeBillboard: ActiveBillboard) {
		activeBillboard.tween?.stop();
		this.remove(activeBillboard.billboard);
		this.unregisterTouchInteraction(activeBillboard.billboard.touchInteraction);
		activeBillboard.billboard.dispose();
		this.speciesBillboards.delete(activeBillboard.speciesKey);
	}

	private addCircleButton(
		position: THREE.Vector3,
		color: THREE.ColorRepresentation,
		texture: THREE.Texture,
		label: string,
		onClick: () => void,
	) {
		const button = new CircleButton({
			position,
			color,
			texture,
			radius: BUTTON_RADIUS,
			label,
			onClick,
		});
		button.touchInteraction.enabled = () =>
			this.transitionPhase === "idle";
		this.registerTouchInteraction(button.touchInteraction);

		this.circleButtons.push(button);
		this.add(button);
		return button;
	}

	private setLocation(
		locationKey: LocationKey,
		origin = this.getTransitionOrigin(locationKey),
	) {
		if (
			this.transitionPhase !== "idle" ||
			locationKey === this.vinjettConfig.location
		) {
			return;
		}

		const normalizedOrigin = origin.clone().normalize();
		this.beginLocationTransition(locationKey, normalizedOrigin);
	}

	private beginLocationTransition(
		locationKey: LocationKey,
		origin: THREE.Vector3,
	) {
		this.transitionTarget = locationKey;
		this.transitionOrigin.copy(origin);
		const background = this.getBackground(locationKey);
		this.pendingBackground = background.materials;
		this.transitionPhase = "wipe";
		this.transitionElapsed = 0;
		this.loadingSpecies.clear();
		this.outgoingButtons = this.circleButtons;
		this.outgoingScales.clear();
		this.outgoingButtons.forEach((button) => {
			this.outgoingScales.set(button, button.scale.x);
		});
		this.speciesBillboards.forEach((activeBillboard) => {
			activeBillboard.tween?.stop();
			activeBillboard.tween = undefined;
			activeBillboard.phase = "closing";
			this.outgoingScales.set(
				activeBillboard.billboard,
				activeBillboard.billboard.scale.x,
			);
		});

		this.circleButtons = [];
		this.speciesButtons.clear();
		this.vinjettConfig.location = locationKey;
		this.addCircleButtons();
		this.circleButtons.forEach((button) => button.scale.setScalar(0));

		background.ready.then(
			() => {},
			(error) => {
				console.error(`Failed to load location ${locationKey}`, error);
				this.backgroundCache.delete(locationKey);
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
		const origin = this.pitchYawToVector3(pitch, yaw);
		return this.vinjettConfig.location === "Home" ? origin : origin.negate();
	}

	private setLocationBackground(locationKey: LocationKey) {
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

		const size = 2 * BACKGROUND_DISTANCE;
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
		this.transitionTarget = undefined;
		this.pendingBackground = undefined;
		this.disposeCircleButtons(this.outgoingButtons);
		this.outgoingButtons = [];
		this.speciesBillboards.forEach((activeBillboard) => {
			this.removeSpeciesBillboard(activeBillboard);
		});
		this.outgoingScales.clear();
		this.sendSocketUiConfig();
		this.transitionPhase = "reveal";
	}

	private getWipeArrival(position: THREE.Vector3) {
		const direction = position.clone().normalize();
		return (
			(this.transitionOrigin.angleTo(direction) / Math.PI) * WIPE_DURATION
		);
	}

	private getWipeArrivalElapsed(position: THREE.Vector3) {
		const arrival = this.getWipeArrival(position);
		return Math.cbrt(arrival / WIPE_DURATION) * WIPE_DURATION;
	}

	private get easedTransitionElapsed() {
		const wipeElapsed = Math.min(this.transitionElapsed, WIPE_DURATION);
		const revealElapsed = Math.max(
			this.transitionElapsed - WIPE_DURATION,
			0,
		);
		return (
			Easing.Cubic.In(wipeElapsed / WIPE_DURATION) * WIPE_DURATION +
			revealElapsed
		);
	}

	private updateTransitionObjects() {
		const transitionElapsed = this.easedTransitionElapsed;
		this.outgoingScales.forEach((initialScale, object) => {
			const arrivalElapsed = this.getWipeArrivalElapsed(object.position);
			const duration = Math.min(
				DISAPPEAR_DURATION,
				arrivalElapsed,
			);
			const startElapsed = arrivalElapsed - duration;
			const progress = THREE.MathUtils.clamp(
				(this.transitionElapsed - startElapsed) / duration,
				0,
				1,
			);
			object.scale.setScalar(
				initialScale * (1 - Easing.Cubic.In(progress)),
			);
		});

		this.circleButtons.forEach((button) => {
			const arrival = this.getWipeArrival(button.position);
			const progress = THREE.MathUtils.clamp(
				(transitionElapsed - arrival) / APPEAR_DURATION,
				0,
				1,
			);
			button.scale.setScalar(Easing.Back.Out(progress));
		});
	}

	override update(delta: number) {
		if (this.transitionPhase !== "idle") {
			this.transitionElapsed += delta;
			this.updateTransitionObjects();
			if (
				this.transitionPhase === "wipe" &&
				this.transitionElapsed >= WIPE_DURATION
			) {
				this.finishBackgroundSwap();
			}
			if (
				this.transitionPhase === "reveal" &&
				this.transitionElapsed >= WIPE_DURATION + APPEAR_DURATION
			) {
				this.circleButtons.forEach((button) => button.scale.setScalar(1));
				this.transitionPhase = "idle";
				this.transitionElapsed = 0;
			}
		}
	}

	override renderScene(renderer: Renderer) {
		if (this.transitionPhase !== "wipe" || !this.backgroundCube || !this.pendingBackground) {
			renderer.renderProjection(this);
			return;
		}
		const { projection, projectionCamera } = renderer;
		projection.captureScene(renderer, this, projectionCamera);
		const currentBackground = this.backgroundCube.material;
		try {
			this.backgroundCube.material = this.pendingBackground;
			projection.captureTransitionScene(renderer, this, projectionCamera);
		} finally {
			this.backgroundCube.material = currentBackground;
		}
		projection.renderOutput(renderer, renderer.projectionOutputTarget, {
			progress: Math.min(this.easedTransitionElapsed / WIPE_DURATION, 1),
			origin: this.transitionOrigin.clone().applyQuaternion(projectionCamera.quaternion.clone().invert()),
		});
	}

	// applyRendererSettings(renderer: Renderer) {
	// 	renderer.outputColorSpace = THREE.SRGBColorSpace;
	// }

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

	registerSocketUiListeners() {
		super.registerSocketUiListeners();
		this.uiSocket.on("scene", (id: SceneId) => {
			this.sceneManager.setScene(id);
		});

		this.uiSocket.on("location", (value: LocationKey) => {
			this.setLocation(value);
		});

		this.uiSocket.on("language", (value: Language) => {
			this.vinjettConfig.language = value;
			this.speciesBillboards.forEach(({ speciesKey, billboard }) => {
				billboard.setLabel(species[speciesKey][value]);
			});
			if (this.transitionPhase === "idle") {
				this.addCircleButtons();
			} else {
				this.refreshSpeciesButtons();
			}
			this.sendSocketUiConfig();
		});

		this.uiSocket.on("reset_progress", () => this.resetDiscoveredSpecies());
	}


	get socketUiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Vinjett",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneId.Wildlife,
					options: scenes.map((scene) => scene.id),
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
				{
					type: "button",
					id: "reset_progress",
					text: "Reset progress",
					hint_title: "Reset discoveries",
					hint_text: "Clear all discovered species and start fresh",
					color: "#c70036",
				},
			],
		};
	}
}
