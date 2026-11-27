uniform sampler2D currentMap;
uniform sampler2D incomingMap;
uniform float progress;
uniform vec3 origin;
uniform float borderWidth;
varying vec2 vUv;
varying vec3 vDirection;

void main() {
	float angle = acos(clamp(dot(normalize(vDirection), origin), -1.0, 1.0));
	float wipeAngle = progress * 3.141592653589793;
	if (abs(angle - wipeAngle) <= borderWidth * 0.5) {
		gl_FragColor = vec4(1.0);
	} else if (angle < wipeAngle) {
		gl_FragColor = texture2D(incomingMap, vUv);
	} else {
		gl_FragColor = texture2D(currentMap, vUv);
	}
}
