uniform samplerCube painting;
varying vec3 vDirection;

void main() {
	gl_FragColor = vec4(textureCube(painting, normalize(vDirection)).rgb, 1.0);
	#include <colorspace_fragment>
}
