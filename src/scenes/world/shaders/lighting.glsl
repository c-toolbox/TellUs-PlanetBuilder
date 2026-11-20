uniform vec3 sunDirection;

const float PI = 3.14159265359;
// Blender used a strength 6 sun with a nearly black night side; the display needs the night side readable.
const vec3 SUN_COLOR = vec3(1.0, 0.97, 0.92) * 2.5;
const vec3 AMBIENT = vec3(0.30, 0.34, 0.42);

vec3 toneMap(vec3 color) {
	return 1.0 - exp(-color);
}
