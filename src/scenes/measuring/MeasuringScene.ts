import BackgroundSphere from "@/components/BackgroundSphere";
import * as THREE from "three";
import backgroundAsset from "@/assets/textures/earth/animated.webm";
import MeasuringTape from "@/components/MeasuringTape";
import MapDrawingLayer from "./MapDrawingLayer";
import { MAP_COLOR_MESSAGE, parseMapDrawing, type DrawingPoint, type MapColorMessage } from "./protocol";
import { OmniEvent, type OmniUser } from "@/network/omniProtocol";
import { globalServices } from "@/network/GlobalServices";
import { UiConfigEvent } from "@/network/socket_ui/protocol";
import { Renderer } from "@/rendering/Renderer";
import BaseScene from "@/scenes/BaseScene";
import { SceneId, scenes } from "@/scenes/scenes";
import { Color } from "@/utils/colors";
import { colorCycle } from "@/utils/functions";

export default class MeasuringScene extends BaseScene {
	private readonly backgroundVideo = document.createElement("video");
	private readonly measuringTapes: MeasuringTape[];
	private readonly omni = globalServices.omniSocket;
	private readonly drawings = new MapDrawingLayer();
	private readonly drawingPoints = new Map<string, readonly DrawingPoint[]>();
	private readonly userColors = new Map<string, { color: string; index: number }>();
	private colorIndex = 0;

	constructor() {
		super();
		this.background = new THREE.Color(0x222222);
		this.add(this.drawings);

		this.backgroundVideo.loop = true;
		this.backgroundVideo.muted = true;
		this.backgroundVideo.playsInline = true;
		this.backgroundVideo.preload = "metadata";
		this.backgroundVideo.src = backgroundAsset;
		this.add(new BackgroundSphere(new THREE.VideoTexture(this.backgroundVideo), 2));

		// const overlay = new THREE.Mesh(
		// 	new THREE.SphereGeometry(1.9, 64, 64),
		// 	new THREE.MeshBasicMaterial({
		// 		color: 0x000000,
		// 		transparent: true,
		// 		opacity: 1.0,
		// 		side: THREE.BackSide,
		// 		depthWrite: false,
		// 	}),
		// );
		// overlay.renderOrder = -1;
		// this.add(overlay);

		this.measuringTapes = [Color.Red600, Color.Amber500, Color.Green600, Color.Blue600].map(
			(color, index) => {
				const angle = (index / 4) * Math.PI * 2;
				const tape = new MeasuringTape({
					start: new THREE.Vector3(
						Math.sin(angle - 0.05),
						0.3,
						Math.cos(angle - 0.05),
					).normalize(),
					end: new THREE.Vector3(
						Math.sin(angle + 0.05),
						0.0,
						Math.cos(angle + 0.05),
					).normalize(),
					color,
				});
				this.add(tape);
				tape.touchInteractions.forEach((interaction) =>
					this.registerTouchInteraction(interaction),
				);
				return tape;
			},
		);
	}

	override onSceneEnter(renderer: Renderer) {
		super.onSceneEnter(renderer);
		this.omni.on(OmniEvent.Message, this.onOmniMessage);
		this.omni.on(OmniEvent.UserJoined, this.onOmniUserJoined);
		this.omni.on(OmniEvent.UserLeft, this.onOmniUserLeft);
		for (const userId of this.userColors.keys()) {
			if (!this.omni.users.has(userId)) this.userColors.delete(userId);
		}
		for (const user of this.omni.users.values()) this.onOmniUserJoined(user);
		for (const [userId, points] of this.drawingPoints) {
			const user = this.omni.users.get(userId);
			if (user) {
				const { color, index } = this.userColors.get(userId)!;
				this.drawings.setDrawing(user, points, color, index);
			} else this.drawingPoints.delete(userId);
		}
		void this.backgroundVideo.play().catch((error: unknown) => {
			if (this.renderer) console.error("Failed to play measuring background video", error);
		});
	}

	override onSceneExit(renderer: Renderer) {
		this.backgroundVideo.pause();
		this.omni.off(OmniEvent.Message, this.onOmniMessage);
		this.omni.off(OmniEvent.UserJoined, this.onOmniUserJoined);
		this.omni.off(OmniEvent.UserLeft, this.onOmniUserLeft);
		this.drawings.clearDrawings();
		super.onSceneExit(renderer);
		this.measuringTapes.forEach((tape) => tape.resetInteraction());
	}

	private readonly onOmniUserJoined = (user: OmniUser): void => {
		let assignment = this.userColors.get(user.id);
		if (!assignment) {
			assignment = {
				color: `#${colorCycle[this.colorIndex % colorCycle.length].toString(16).padStart(6, "0")}`,
				index: this.colorIndex,
			};
			this.colorIndex += 3;
			this.userColors.set(user.id, assignment);
		}
		const message: MapColorMessage = { type: MAP_COLOR_MESSAGE, user: user.id, color: assignment.color };
		this.omni.send(message);
	};

	private readonly onOmniMessage = (input: unknown): void => {
		const data = parseMapDrawing(input);
		if (!data) return;
		const user = this.omni.users.get(data.user);
		const assignment = this.userColors.get(data.user);
		if (!user || !assignment) return;
		if (data.points.some((point) => point !== null)) this.drawingPoints.set(user.id, data.points);
		else this.drawingPoints.delete(user.id);
		this.drawings.setDrawing(user, data.points, assignment.color, assignment.index);
	};

	private readonly onOmniUserLeft = (user: OmniUser): void => {
		this.userColors.delete(user.id);
		this.drawingPoints.delete(user.id);
		this.drawings.removeDrawing(user.id);
	};

	protected override registerSocketUiListeners() {
		super.registerSocketUiListeners();

		this.uiSocket.on("scene", (id: SceneId) => {
			this.sceneManager.setScene(id);
		});
	}

	protected get socketUiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Measuring",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneId.Measuring,
					options: scenes.map((scene) => scene.id),
				},
			],
		};
	}
}
