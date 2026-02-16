precision highp float;
uniform samplerCube envMap;
varying vec2 vUv;

void main() {
	vec2 p = vUv * 2.0 - 1.0;
	float r = length(p);
	if (r > 1.0) {
		gl_FragColor = vec4(0.0);
		return;
	}

	float c = r * 3.141592653589793 * (360.0 / 360.0);
	float theta = atan(p.y, p.x);
	float sin_c = sin(c);
	float cos_c = cos(c);
	vec3 dir = vec3(
		-sin_c * cos(theta),
		 sin_c * sin(theta),
		 cos_c
	);

	gl_FragColor = textureCube(envMap, dir);
}
