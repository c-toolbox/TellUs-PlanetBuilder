import * as THREE from "three";

export const ORIGIN = new THREE.Vector3(0, 0, 0);

/* Sizes */

export const GLOBE_FOV_DEGREES = 320;

export const TOUCH_SIZE = 0.1;
export const PLAYER_SIZE = 0.2;
export const FISH_SIZE = 0.1;
export const VERTEX_SIZE = 0.005;
export const EDGE_SIZE = 0.005;

export const TOUCH_DISTANCE = 0.8;
export const PLAYER_DISTANCE = 0.9;
export const VERTEX_DISTANCE = 1.0;
export const EDGE_DISTANCE = 1.1;
export const FACE_DISTANCE = 1.2;
export const BACKGROUND_DISTANCE = 5.0;

export const VERTEX_COLOR = 0x000000;
export const EDGE_COLOR = 0x000000;
export const FACE_OPACITY = 1.0;

/* Visibility */

export const SHOW_VERTICES = true;
export const SHOW_EDGES = true;
export const SHOW_FACES = true;
export const SHOW_PLAYERS = true;

export const DOUBLE_SIDE = false;

/* Earth */

export const GENERATE_BIOMES = true;
export const DEFAULT_BIOME = "Ocean";

/* Input */

export const CLICK_DURATION = 250; // Milliseconds
