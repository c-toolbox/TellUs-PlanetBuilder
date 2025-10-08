// src/main.ts
import * as THREE from "three";
import { Renderer } from "./scenes/Renderer";
import { PaintScene } from "./scenes/PaintScene";

const renderer = new Renderer();

const paintScene = new PaintScene();
renderer.setScene(paintScene);
