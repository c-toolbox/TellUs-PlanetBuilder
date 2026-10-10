uniform float resolution;
uniform float seed;
uniform bool seeded;
varying vec2 vUv;

float hash(vec3 p) {
	return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float noise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
			mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
		mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
			mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

void main() {
	vec3 n = atlasDirection(vUv, resolution);
	// 3D noise evaluated on the sphere makes continuous seeds across all faces.
	float pattern = 0.7 * noise(n * 22.0 + seed) + 0.3 * noise(n * 47.0 - seed);
	float mask = seeded ? smoothstep(0.49, 0.57, pattern) : 0.0;
	float perturbation = 0.02 * (noise(n * 90.0 + seed) - 0.5);
	gl_FragColor = vec4(1.0 - mask * (0.5 + perturbation), mask * (0.25 + perturbation), 0.0, 1.0);
}
