uniform samplerCube textureOld;
uniform samplerCube textureNew;
uniform bool hasInput;
uniform float blurRadius;
uniform float fade;
uniform float fadeFloor;
varying vec3 vDirection;

void main() {
	vec3 direction = normalize(vDirection);
	vec3 color = textureCube(textureOld, direction).rgb;
	if (blurRadius > 0.0) {
		// Sample around the direction on the sphere, including across cube edges.
		vec3 axis = abs(direction.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
		vec3 x = normalize(cross(axis, direction)) * blurRadius;
		vec3 y = normalize(cross(direction, x)) * blurRadius;
		color = 0.25 * color
			+ 0.125 * textureCube(textureOld, direction + x).rgb
			+ 0.125 * textureCube(textureOld, direction - x).rgb
			+ 0.125 * textureCube(textureOld, direction + y).rgb
			+ 0.125 * textureCube(textureOld, direction - y).rgb
			+ 0.0625 * textureCube(textureOld, direction + x + y).rgb
			+ 0.0625 * textureCube(textureOld, direction + x - y).rgb
			+ 0.0625 * textureCube(textureOld, direction - x + y).rgb
			+ 0.0625 * textureCube(textureOld, direction - x - y).rgb;
		color = max(color * fade - fadeFloor, 0.0);
	}
	if (hasInput) {
		vec4 stroke = textureCube(textureNew, direction);
		// Opaque strokes over transparent black have premultiplied edge coverage
		// after filtering. Source-over replaces the old color under each stroke.
		color = stroke.rgb + color * (1.0 - stroke.a);
	}
	gl_FragColor = vec4(color, 1.0);
}
