precision highp float;
uniform samplerCube envMap;
uniform samplerCube transitionEnvMap;
uniform bool transitionEnabled;
uniform float transitionProgress;
uniform vec3 transitionOrigin;
uniform float transitionBorderWidth;
uniform float globeFovDegrees;
varying vec2 vUv;

void main() {
	vec2 p = vUv * 2.0 - 1.0;
	float r = length(p);
	if (r > 1.0) {
		gl_FragColor = vec4(0.0);
		return;
	}

	// Contract the view to the globe's visible field of view.
	float c = r * 3.141592653589793 * (globeFovDegrees / 360.0);
	float theta = atan(p.y, p.x);
	vec3 dir = vec3(-sin(c) * cos(theta), sin(c) * sin(theta), cos(c));
	vec4 color = textureCube(envMap, dir);
	if (transitionEnabled) {
		float angle = acos(clamp(dot(normalize(dir), normalize(transitionOrigin)), -1.0, 1.0));
		float wipeAngle = transitionProgress * 3.141592653589793;
		if (abs(angle - wipeAngle) <= transitionBorderWidth * 0.5) {
			color = vec4(1.0);
		} else if (angle < wipeAngle) {
			color = textureCube(transitionEnvMap, dir);
		}
	}
	color.rgb = pow(color.rgb, vec3(1.0 / 1.9));
	gl_FragColor = color;
}
