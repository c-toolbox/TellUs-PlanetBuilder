import { BaseScene } from "@/scenes/BaseScene";
import * as THREE from "three";

const GameOptions = {
	// Amount of steps to be created and recycled
	stepsAmount: 18,

	// Staircase speed, in pixels per second
	staircaseSpeed: 80,

	// Step size: x, y, z
	stepSize: new Phaser.Math.Vector3(400, 40, 160),

	// Ball diameter, in pixels
	ballDiameter: 60,

	// Ball starting step
	ballStartingStep: 2,

	// Ball jump height, in pixels
	jumpHeight: 100,
};

class ThreeStep extends THREE.Group {
	constructor(
		scene: Phaser.Scene,
		threeScene: THREE.Scene,
		stepNumber: number
	) {
		super();

		// Build the step
		const stepGeometry: THREE.BoxGeometry = new THREE.BoxGeometry(
			GameOptions.stepSize.x,
			GameOptions.stepSize.y,
			GameOptions.stepSize.z
		);
		const stepMaterial: THREE.MeshStandardMaterial =
			new THREE.MeshStandardMaterial({
				color: 0x09c4fe,
			});
		const step: THREE.Mesh = new THREE.Mesh(stepGeometry, stepMaterial);
		step.receiveShadow = true;

		// Build the spike
		const spikeGeometry = new THREE.ConeGeometry(25, 40, 32);
		const spikeMaterial = new THREE.MeshStandardMaterial({
			color: 0x444444,
		});
		let spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
		spike.position.set(
			Phaser.Math.Between(
				-GameOptions.stepSize.x / 2 + 50,
				GameOptions.stepSize.x / 2 - 50
			),
			GameOptions.stepSize.y - 5,
			0
		);
		spike.castShadow = true;

		// Add step and spike to the group
		this.add(step, spike);

		// Position the group properly
		this.position.set(
			(scene.game.config.width as number) / 2,
			stepNumber * GameOptions.stepSize.y,
			stepNumber * -GameOptions.stepSize.z
		);

		// Add the group to the scene
		threeScene.add(this);
	}
}

class ThreeBall extends THREE.Mesh {
	// Amount of time the ball is in play, useful to determine its position
	ballTime: number;

	// Time needed for the ball to jump over next step
	jumpTime: number;

	// Ball starting y position
	startY: number;

	constructor(scene: Phaser.Scene, threeScene: THREE.Scene) {
		// build the ball
		const SphereGeometry: THREE.SphereGeometry = new THREE.SphereGeometry(
			GameOptions.ballDiameter / 2,
			32,
			32
		);
		const sphereMaterial: THREE.MeshStandardMaterial =
			new THREE.MeshStandardMaterial({
				color: 0x444444,
			});
		super(SphereGeometry, sphereMaterial);

		// ball casts shadows
		this.castShadow = true;

		// ball is in time for zero milliseconds at the moment
		this.ballTime = 0;

		// jump time, in seconds, is determined by y step size divided by staircase speed
		this.jumpTime =
			(GameOptions.stepSize.y / GameOptions.staircaseSpeed) * 1000;

		// determine ball starting y position according to step size, ball diameter, and ball starting step
		this.startY =
			(GameOptions.ballStartingStep + 0.5) * GameOptions.stepSize.y +
			GameOptions.ballDiameter / 2;

		// position the ball properly
		this.position.set(
			(scene.game.config.width as number) / 2,
			this.startY,
			GameOptions.ballStartingStep * -GameOptions.stepSize.z
		);

		// add the group to the scene
		threeScene.add(this);
	}

	// method to update ball position according to the time the ball is in play
	updateBallPosition(delta: number): void {
		// determine ball time, being sure it will never be greater than the time required to jump on next step
		this.ballTime = (this.ballTime += delta) % this.jumpTime;

		// ratio is the amount of time passed divided by the time required to jump on next step
		let ratio: number = this.ballTime / this.jumpTime;

		// set ball y position using a sine curve
		this.position.setY(
			this.startY + Math.sin(ratio * Math.PI) * GameOptions.jumpHeight
		);
	}
}

export class GameScene extends BaseScene {
	private gridGraphics: Phaser.GameObjects.Graphics;
	private pathGraphics: Phaser.GameObjects.Graphics;
	private circles: { [id: number]: Circle };

	steps: ThreeStep[];
	ball: ThreeBall;

	constructor() {
		super({ key: "GameScene" });
	}

	create(): void {
		// this.fade(false, 200, 0x000000);
		this.cameras.main.setBackgroundColor(0xffffff);

		this.gridGraphics = this.add.graphics();
		this.pathGraphics = this.add.graphics();
		this.circles = {};

		this.drawBackground();
		this.initSocket();
		this.init3D();
	}

	drawBackground() {
		this.gridGraphics.lineStyle(1, 0x000000, 0.2);
		for (let x = 0; x <= this.W; x += 120) {
			this.gridGraphics.moveTo(x, 0);
			this.gridGraphics.lineTo(x, this.H);
		}
		for (let y = 0; y <= this.H; y += 120) {
			this.gridGraphics.moveTo(0, y);
			this.gridGraphics.lineTo(this.W, y);
		}
		this.gridGraphics.strokePath();
	}

	initSocket() {
		const socket = new WebSocket("ws://localhost:8765");
		socket.onopen = () => {};
		socket.onmessage = (event) => {
			const message = JSON.parse(event.data);
			console.log(message);

			switch (message.event) {
				case "add":
					this.addCircle(message.id);
					break;
				case "update":
					this.updateCircle(message.id, message.x, message.y);
					break;
				case "remove":
					this.removeCircle(message.id);
					break;
			}
		};
	}

	addCircle(id: number): void {
		if (!this.circles[id]) {
			const circle = new Circle(this, -1000, -1000, 20, 0x000000);
			this.add.existing(circle);
			this.circles[id] = circle;
			this.drawLines();
		}
	}

	updateCircle(id: number, x: number, y: number): void {
		const circle = this.circles[id];
		if (circle) {
			circle.setPosition(x * this.W, y * this.H);
			circle.addPoint(x * this.W, y * this.H);
			this.drawLines();
		}
	}

	removeCircle(id: number): void {
		const circle = this.circles[id];
		if (circle) {
			circle.destroy();
			delete this.circles[id];
			this.drawLines();
		}
	}

	drawLines() {
		this.pathGraphics.clear();
		this.pathGraphics.lineStyle(4, 0x000000, 1);

		for (const id in this.circles) {
			const points = this.circles[id].points;

			if (points.length > 0) {
				this.pathGraphics.beginPath();
				this.pathGraphics.moveTo(points[0].x, points[0].y);

				for (let i = 1; i < points.length; i++) {
					this.pathGraphics.lineTo(points[i].x, points[i].y);
				}

				this.pathGraphics.strokePath();
			}
		}
	}

	init3D() {
		// Creation of the 3D scene
		const threeScene: THREE.Scene = this.initThreeScene();

		// const sphereGeometry: THREE.SphereGeometry = new THREE.SphereGeometry(
		// 	32,
		// 	64,
		// 	64
		// );
		// const sphereMaterial: THREE.MeshStandardMaterial =
		// 	new THREE.MeshStandardMaterial({
		// 		color: 0xff0000,
		// 	});
		// let ball = new THREE.Mesh(sphereGeometry, sphereMaterial);
		// ball.position.set(0, 0, 0);
		// threeScene.add(ball);
		// let ball2 = new THREE.Mesh(sphereGeometry, sphereMaterial);
		// ball2.position.set(100, 0, 100);
		// threeScene.add(ball2);

		// Add steps to the 3D scene and into steps array
		this.steps = [];
		for (let i = 0; i < GameOptions.stepsAmount; i++) {
			this.steps.push(new ThreeStep(this, threeScene, i));
		}

		// Add the ball
		this.ball = new ThreeBall(this, threeScene);
	}

	initThreeScene(): THREE.Scene {
		// Variables to store canvas width and height
		const width: number = this.W;
		const height: number = this.H;

		// Create a new THREE scene
		const threeScene: THREE.Scene = new THREE.Scene();

		// Create the renderer
		const renderer: THREE.WebGLRenderer = new THREE.WebGLRenderer({
			// canvas: this.sys.game.canvas,
			// // context: this.sys.game.canvas.getContext("webgl2") as any,
			// context: this.sys.game.context as WebGLRenderingContext,
			antialias: true,
		});
		renderer.setSize(window.innerWidth, window.innerHeight);
		document.body.appendChild(renderer.domElement);
		renderer.autoClear = false;
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		// Add a camera
		const camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000);
		camera.position.set(width / 2, 720, 640);
		camera.lookAt(width / 2, 560, 320);

		// Add an ambient light
		const ambientLight: THREE.AmbientLight = new THREE.AmbientLight(
			0xffffff,
			1
		);
		threeScene.add(ambientLight);

		// Add a directional light
		const directionalLight: THREE.DirectionalLight = new THREE.DirectionalLight(
			0xffffff,
			0.5
		);
		directionalLight.castShadow = true;
		directionalLight.position.set(270, 200, 0);
		directionalLight.target.position.set(270, 100, -1000);
		threeScene.add(directionalLight);
		threeScene.add(directionalLight.target);

		// Add a spotlight
		const spotLight: THREE.SpotLight = new THREE.SpotLight(
			0xffffff,
			0.2,
			0,
			0.4,
			0.5,
			0.1
		);
		spotLight.position.set(270, 1000, 0);
		spotLight.castShadow = true;
		spotLight.shadow.mapSize.width = 1024;
		spotLight.shadow.mapSize.height = 1024;
		spotLight.shadow.camera.near = 1;
		spotLight.shadow.camera.far = 10000;
		spotLight.shadow.camera.fov = 80;
		spotLight.target.position.set(270, 0, -320);
		threeScene.add(spotLight);
		threeScene.add(spotLight.target);

		threeScene.fog = new THREE.Fog(0x011025, 500, 2000);

		// Create an Extern Phaser game object
		const view: Phaser.GameObjects.Extern = this.add.extern();

		// Custom renderer
		// Next line is needed to avoid TypeScript errors
		// @ts-expect-error
		view.render = () => {
			renderer.state.reset();
			renderer.render(threeScene, camera);
		};
		return threeScene;
	}

	update(time: number, delta: number) {
		// Update ball position
		this.ball.updateBallPosition(delta);

		// Loop through steps array
		this.steps.forEach((step: ThreeStep) => {
			// Adjust step position according to speed, delta time and step size
			step.position.y -= (delta / 1000) * GameOptions.staircaseSpeed;
			step.position.z +=
				((delta / 1000) * GameOptions.staircaseSpeed * GameOptions.stepSize.z) /
				GameOptions.stepSize.y;

			// If the step is leaving the game from the bottom...
			if (step.position.y < -40) {
				// ...place it on top of the staircase
				step.position.y += GameOptions.stepsAmount * GameOptions.stepSize.y;
				step.position.z -= GameOptions.stepsAmount * GameOptions.stepSize.z;

				// Change spike position
				step.children[1].position.x = Phaser.Math.Between(-150, 150);
			}
		});
	}
}

class Circle extends Phaser.GameObjects.Ellipse {
	public points: Phaser.Math.Vector2[];

	constructor(
		scene: Phaser.Scene,
		x: number,
		y: number,
		radius: number,
		color: number
	) {
		super(scene, x, y, radius * 2, radius * 2, color);
		this.setOrigin(0.5, 0.5);

		this.points = [];
	}

	addPoint(x: number, y: number): void {
		this.points.push(new Phaser.Math.Vector2(x, y));
		if (this.points.length > 100) {
			this.points.shift();
		}
	}
}
