precision highp float;
uniform samplerCube envMap;
varying vec2 vUv;

void main() {
	// Same unwrapping as the globe preview sphere (SphereGeometry UVs).
	float phi = vUv.x * 2.0 * 3.141592653589793;
	float theta = (1.0 - vUv.y) * 3.141592653589793;
	vec3 globeDir = vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));

	// The globe's +Y pole matches the camera-local +Z axis.
	vec3 dir = vec3(globeDir.x, globeDir.z, globeDir.y);
	vec4 color = textureCube(envMap, dir);

	// Match the display gamma applied by azimuthal.frag.
	color.rgb = pow(color.rgb, vec3(1.0 / 1.9));
	gl_FragColor = vec4(color.rgb, 1.0);
}
