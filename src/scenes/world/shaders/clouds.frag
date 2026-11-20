// Cloud layer from RenderPlanet.blend: an equirectangular density map drawn over the planet,
// independent of the tiles underneath. The poles are on the Y axis like the tile climate.

uniform sampler2D cloudMap;
uniform float cloudRotation;
varying vec3 vDirection;

const float CLOUD_OPACITY = 0.9;
const vec3 CLOUD_ALBEDO = vec3(0.8);

// Picks the UV derivatives that don't jump at the longitude seam.
vec4 sampleEquirect(sampler2D map, vec3 d) {
	vec2 uv = vec2(atan(d.z, d.x) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
	vec2 shifted = vec2(fract(uv.x + 0.5) - 0.5, uv.y);
	vec2 dx = dFdx(uv);
	vec2 dy = dFdy(uv);
	vec2 dxShifted = dFdx(shifted);
	vec2 dyShifted = dFdy(shifted);
	bool useShifted = abs(dxShifted.x) + abs(dyShifted.x) < abs(dx.x) + abs(dy.x);
	return textureGrad(map, uv, useShifted ? dxShifted : dx, useShifted ? dyShifted : dy);
}

void main() {
	vec3 n = normalize(vDirection);
	float c = cos(cloudRotation);
	float s = sin(cloudRotation);
	float density = sampleEquirect(cloudMap, vec3(c * n.x - s * n.z, n.y, s * n.x + c * n.z)).r;

	vec3 lightDirection = normalize(sunDirection);
	float diffuse = max(dot(n, lightDirection), 0.0) * smoothstep(-0.08, 0.25, dot(n, lightDirection));
	vec3 color = CLOUD_ALBEDO * (SUN_COLOR * diffuse + AMBIENT);
	gl_FragColor = vec4(toneMap(color), density * CLOUD_OPACITY);
	#include <colorspace_fragment>
}
