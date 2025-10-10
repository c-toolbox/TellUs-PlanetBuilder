import * as THREE from "three";

export const ORIGIN = new THREE.Vector3(0, 0, 0);

/* Sizes */

export const TOUCH_SIZE = 0.1;
export const PLAYER_SIZE = 0.2;
export const VERTEX_SIZE = 0.015;
export const EDGE_SIZE = 0.004;

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

export const USE_AI_TEXTURES = false;
export const TEXTURE_SCALE = USE_AI_TEXTURES ? 1.0 : 0.6;

export const DOUBLE_SIDE = false;

/* Earth */

export const GENERATE_BIOMES = true;
export const DEFAULT_BIOME = "Ocean";
export const SIMPLIFY_BIOMES = false;

/* Drawing */

export const PEN_SIZE = 0.1;

/* Input */

export const CLICK_DURATION = 250; // Milliseconds
