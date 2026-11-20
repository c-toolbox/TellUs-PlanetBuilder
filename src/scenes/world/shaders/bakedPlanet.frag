// Shows the baked planet cube map; all the expensive shading happened once in planet.frag.
uniform samplerCube planetMap;
varying vec3 vDirection;

void main() {
	gl_FragColor = vec4(textureCube(planetMap, vDirection).rgb, 1.0);
	#include <colorspace_fragment>
}
