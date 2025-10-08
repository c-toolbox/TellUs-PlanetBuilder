import { Renderer } from "./scenes/Renderer";
import { WorldScene } from "./scenes/WorldScene";

const renderer = new Renderer();
const worldScene = new WorldScene();
renderer.setScene(worldScene);
