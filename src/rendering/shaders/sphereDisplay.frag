precision highp float;
uniform samplerCube envMap;
uniform samplerCube transitionEnvMap;
uniform float transitionProgress;
uniform float transitionBorderWidth;
uniform vec3 transitionOrigin;
uniform bool transitionActive;
varying vec3 vDirection;

void main() {
	vec3 dir = normalize(vec3(vDirection.x, vDirection.z, vDirection.y));
	vec4 color = textureCube(envMap, dir);

	if (transitionActive) {
		float angle = acos(clamp(dot(dir, normalize(transitionOrigin)), -1.0, 1.0));
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