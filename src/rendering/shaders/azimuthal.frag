precision highp float;
uniform samplerCube envMap;
uniform samplerCube transitionEnvMap;
uniform float globeFovDegrees;
uniform float transitionProgress;
uniform float transitionBorderWidth;
uniform vec3 transitionOrigin;
uniform bool transitionActive;
varying vec2 vUv;

void main() {
	vec2 p = vUv * 2.0 - 1.0;
	float r = length(p);
	if (r > 1.0) {
		gl_FragColor = vec4(0.0);
		return;
	}

	// Scale the angle by the globe's FOV constraint
	// If FOV is 320 degrees, max colatitude = π * (320/360)
	float fovFactor = globeFovDegrees / 360.0;
	float c = r * 3.141592653589793 * fovFactor;
	float theta = atan(p.y, p.x);
	float sin_c = sin(c);
	float cos_c = cos(c);
	vec3 dir = vec3(
		-sin_c * cos(theta),
		 sin_c * sin(theta),
		 cos_c
	);

	vec4 color = textureCube(envMap, dir);
	if (transitionActive) {
		float angle = acos(clamp(dot(normalize(dir), normalize(transitionOrigin)), -1.0, 1.0));
		float wipeAngle = transitionProgress * 3.141592653589793;
		float halfBorder = transitionBorderWidth * 0.5;

		if (abs(angle - wipeAngle) <= halfBorder) {
			color = vec4(1.0);
		} else if (angle < wipeAngle) {
			color = textureCube(transitionEnvMap, dir);
		}
	}

	color.rgb = pow(color.rgb, vec3(1.0 / 1.9));
	gl_FragColor = color;
}
