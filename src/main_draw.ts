// src/main.ts
import * as THREE from "three";
import { Renderer } from "./scenes/Renderer";
import { PaintScene } from "./scenes/PaintScene";

const renderer = new Renderer();
// renderer.setClearColor(new THREE.Color(255, 0, 0));
// renderer.clearColor();
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.autoClear = false;

const paintScene = new PaintScene();
renderer.setScene(paintScene);
