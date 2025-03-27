import { BaseScene } from "@/scenes/BaseScene";

export class GameScene extends BaseScene {
	private gridGraphics: Phaser.GameObjects.Graphics;
	private pathGraphics: Phaser.GameObjects.Graphics;
	private circles: { [id: number]: Circle };

	constructor() {
		super({ key: "GameScene" });
	}

	create(): void {
		this.fade(false, 200, 0x000000);
		this.cameras.main.setBackgroundColor(0xffffff);

		this.gridGraphics = this.add.graphics();
		this.pathGraphics = this.add.graphics();
		this.circles = {};

		this.drawBackground();
		this.initSocket();
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

	update(time: number, delta: number) {}
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
