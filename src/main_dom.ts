import { Renderer } from "./scenes/Renderer";
import { DomScene } from "./scenes/DomScene";

const renderer = new Renderer();

const domScene = new DomScene();
renderer.setScene(domScene);
