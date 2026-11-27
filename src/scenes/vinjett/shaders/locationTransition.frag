precision highp float;
uniform sampler2D currentMap;
uniform sampler2D incomingMap;
uniform float globeFovDegrees;
uniform float progress;
uniform vec3 origin;
uniform float borderWidth;
varying vec2 vUv;

void main() {
	vec2 p = vUv * 2.0 - 1.0;
	float r = length(p);
	if (r > 1.0) {
		gl_FragColor = vec4(0.0);
		return;
	}

	// Recover the viewing direction to keep the wipe circular on the globe.
	float c = r * 3.141592653589793 * (globeFovDegrees / 360.0);
	float theta = atan(p.y, p.x);
	vec3 dir = vec3(-sin(c) * cos(theta), sin(c) * sin(theta), cos(c));
	float angle = acos(clamp(dot(normalize(dir), normalize(origin)), -1.0, 1.0));
	float wipeAngle = progress * 3.141592653589793;
	if (abs(angle - wipeAngle) <= borderWidth * 0.5) {
		gl_FragColor = vec4(1.0);
	} else if (angle < wipeAngle) {
		gl_FragColor = texture2D(incomingMap, vUv);
	} else {
		gl_FragColor = texture2D(currentMap, vUv);
	}
}
