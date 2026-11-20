// Approximates the "Planet" material of RenderPlanet.blend: the biome map picks one of
// several textured surfaces, with ragged borders and a Lambert + GGX sun.

uniform samplerCube maskA; // Snow, Ocean, Taiga, Forest
uniform samplerCube maskB; // Savanna, Desert, Mountain
uniform sampler2D forestMap;
uniform sampler2D forestDarkMap;
uniform sampler2D iceMap;
uniform sampler2D desertMap;
varying vec3 vDirection;

// Angles in radians. The noisy warp gives the ragged threshold edge like Blender's UV noise;
// the small blur averages a jittered disk so that edge fades a little instead of cutting hard.
const float BORDER_SHIFT = 0.08;
const float BORDER_GRAIN = 0.01;
const float BLUR_RADIUS = 0.04;
const int BLUR_TAPS = 8;

// Ocean coverage within these radii drives the shallow water and beach shading.
const float COAST_NEAR = 0.015;
const float COAST_WIDE = 0.12;
const int COAST_TAPS = 6;

const vec3 OCEAN_DEEP = vec3(0.004, 0.012, 0.07);
const vec3 OCEAN_SHALLOW = vec3(0.015, 0.10, 0.20);
const vec3 BEACH_COLOR = vec3(0.02, 0.13, 0.21);
const vec3 NO_TILE_COLOR = vec3(0.085);

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(
			mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
			mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x),
			f.y),
		mix(
			mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
			mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x),
			f.y),
		f.z);
}

float fbm(vec3 p) {
	float sum = 0.0;
	float amplitude = 0.5;
	for (int i = 0; i < 3; i++) {
		sum += amplitude * valueNoise(p);
		p = p * 2.03 + vec3(17.1);
		amplitude *= 0.5;
	}
	return sum / 0.875;
}

// Shifts the biome lookup mostly east-west, like the noise on the UV X axis in Blender.
vec3 warpDirection(vec3 n, vec3 east, vec3 north) {
	float shift = (fbm(n * 16.0) - 0.5) * 2.0 * BORDER_SHIFT + (valueNoise(n * 80.0) - 0.5) * 2.0 * BORDER_GRAIN;
	// Same strength as the east-west shift, otherwise borders running east-west (like along the equator) stay clean.
	float lift = (fbm(n * 16.0 + vec3(4.1)) - 0.5) * 2.0 * BORDER_SHIFT + (valueNoise(n * 80.0 + vec3(31.7)) - 0.5) * 2.0 * BORDER_GRAIN;
	return normalize(n + east * shift + north * lift);
}

// Sunflower pattern spun by a per-pixel angle, so the blur resolves as fine grain rather than banding.
vec3 diskTap(vec3 center, vec3 east, vec3 north, float spin, int i, int count, float radius) {
	float r = sqrt((float(i) + 0.5) / float(count)) * radius;
	float t = spin + float(i) * 2.39996;
	return normalize(center + (east * cos(t) + north * sin(t)) * r);
}

float oceanCoverage(vec3 center, vec3 east, vec3 north, float spin, float radius) {
	float sum = 0.0;
	for (int i = 0; i < COAST_TAPS; i++) {
		sum += textureCube(maskA, diskTap(center, east, north, spin, i, COAST_TAPS, radius)).g;
	}
	return sum / float(COAST_TAPS);
}

// Equivalent of a Blender box-projected image on generated coordinates.
vec3 triplanar(sampler2D map, vec3 g, vec3 w, float scale) {
	return texture2D(map, g.yz * scale).rgb * w.x
		+ texture2D(map, g.xz * scale).rgb * w.y
		+ texture2D(map, g.xy * scale).rgb * w.z;
}

// Piecewise linear stand-in for the RGB Curves "C" curve through four points.
float curve(float x, vec2 a, vec2 b, vec2 c, vec2 d) {
	x = clamp(x, a.x, d.x);
	vec2 p = x < b.x ? a : (x < c.x ? b : c);
	vec2 q = x < b.x ? b : (x < c.x ? c : d);
	return mix(p.y, q.y, (x - p.x) / (q.x - p.x));
}

vec3 forestCurve(vec3 c) {
	vec2 a = vec2(0.0), b = vec2(0.277, 0.381), cc = vec2(0.686, 0.512), d = vec2(1.0);
	return vec3(curve(c.r, a, b, cc, d), curve(c.g, a, b, cc, d), curve(c.b, a, b, cc, d));
}

vec3 iceCurve(vec3 c) {
	vec2 a = vec2(0.0), b = vec2(0.536, 0.9), cc = vec2(0.77, 0.96), d = vec2(1.0);
	return vec3(curve(c.r, a, b, cc, d), curve(c.g, a, b, cc, d), curve(c.b, a, b, cc, d));
}

vec3 desertCurve(vec3 c) {
	vec2 a = vec2(0.0), b = vec2(0.423, 0.281), cc = vec2(0.745, 0.475), d = vec2(1.0, 0.625);
	return vec3(curve(c.r, a, b, cc, d), curve(c.g, a, b, cc, d), curve(c.b, a, b, cc, d));
}

// Screen-space bump mapping from the weighted height derivatives (Mikkelsen).
vec3 perturbNormal(vec3 n, vec3 p, float dBs, float dBt) {
	vec3 sigmaX = dFdx(p);
	vec3 sigmaY = dFdy(p);
	vec3 r1 = cross(sigmaY, n);
	vec3 r2 = cross(n, sigmaX);
	float det = dot(sigmaX, r1);
	vec3 grad = sign(det) * (dBs * r1 + dBt * r2);
	return normalize(abs(det) * n - grad);
}

void addBump(inout float dBs, inout float dBt, float weight, float strength, float height) {
	dBs += weight * strength * dFdx(height);
	dBt += weight * strength * dFdy(height);
}

void main() {
	vec3 n = normalize(vDirection);

	/* Biome weights */

	vec3 east = cross(vec3(0.0, 1.0, 0.0), n);
	east = length(east) > 1e-4 ? normalize(east) : vec3(1.0, 0.0, 0.0);
	vec3 north = cross(n, east);
	float spin = hash13(n * 2000.0) * 6.2832;

	vec3 lookup = warpDirection(n, east, north);
	vec4 a = vec4(0.0);
	vec4 b = vec4(0.0);
	for (int i = 0; i < BLUR_TAPS; i++) {
		vec3 tap = diskTap(lookup, east, north, spin, i, BLUR_TAPS, BLUR_RADIUS);
		a += textureCube(maskA, tap);
		b += textureCube(maskB, tap);
	}
	a /= float(BLUR_TAPS);
	b /= float(BLUR_TAPS);
	vec4 wa = smoothstep(0.2, 0.8, a);
	vec3 wb = smoothstep(0.2, 0.8, b.rgb);
	float wNone = smoothstep(0.2, 0.8, 1.0 - clamp(a.r + a.g + a.b + a.a + b.r + b.g + b.b, 0.0, 1.0));
	float total = wa.r + wa.g + wa.b + wa.a + wb.r + wb.g + wb.b + wNone + 1e-4;
	float wSnow = wa.r / total;
	float wOcean = wa.g / total;
	float wTaiga = wa.b / total;
	float wForest = wa.a / total;
	float wSavanna = wb.r / total;
	float wDesert = wb.g / total;
	float wMountain = wb.b / total;
	wNone /= total;

	/* Surfaces */

	vec3 g = n * 0.5 + 0.5;
	vec3 boxWeight = pow(abs(n), vec3(4.0));
	boxWeight /= boxWeight.x + boxWeight.y + boxWeight.z;

	vec3 forestTex = triplanar(forestMap, g, boxWeight, 4.0);
	vec3 taigaTex = triplanar(forestDarkMap, g, boxWeight, 4.0);
	vec3 iceTex = triplanar(iceMap, g, boxWeight, 4.0);
	vec3 desertTex = triplanar(desertMap, g, boxWeight, 2.0);

	vec3 forestAlbedo = forestCurve(forestTex);
	vec3 snowAlbedo = iceCurve(iceTex);
	vec3 desertAlbedo = desertCurve(desertTex);
	// Not in the Blender project: dry grass between desert and forest, grey rock from the desert texture.
	vec3 savannaAlbedo = mix(desertAlbedo, forestAlbedo, 0.45) * vec3(1.1, 1.0, 0.6);
	vec3 mountainAlbedo = dot(desertAlbedo, vec3(0.333)) * vec3(0.9, 0.95, 1.1);

	float forestRoughness = clamp(forestTex.r / 0.0273, 0.0, 1.0);
	float taigaRoughness = clamp(taigaTex.r / 0.0273, 0.0, 1.0);
	float snowRoughness = clamp(iceTex.g / 0.8045, 0.0, 1.0);
	float desertRoughness = 1.0 - clamp((desertTex.g - 0.6773) / (1.0 - 0.6773), 0.0, 1.0);

	/* Coast: water gets shallower towards land and the border itself gets a light shallow-water band */

	float oceanNear = oceanCoverage(lookup, east, north, spin, COAST_NEAR);
	float oceanWide = oceanCoverage(lookup, east, north, spin, COAST_WIDE);
	float shallow = smoothstep(0.0, 0.7, 1.0 - oceanWide);
	// Peaks where land and ocean meet, which is also where the green/blue mix turns murky.
	float beach = smoothstep(0.3, 0.8, 1.0 - abs(oceanNear * 2.0 - 1.0)) * (1.0 - wSnow);

	vec3 albedo = wSnow * snowAlbedo + wOcean * mix(OCEAN_DEEP, OCEAN_SHALLOW, shallow) + wTaiga * taigaTex + wForest * forestAlbedo
		+ wSavanna * savannaAlbedo + wDesert * desertAlbedo + wMountain * mountainAlbedo + wNone * NO_TILE_COLOR;
	float beachWeight = 0.8 * beach;
	albedo = mix(albedo, BEACH_COLOR, beachWeight);
	float roughness = wSnow * snowRoughness + wOcean * 0.2909 + wTaiga * taigaRoughness + wForest * forestRoughness
		+ wSavanna * desertRoughness + wDesert * desertRoughness + wMountain * 0.9 + wNone;
	// The band is water, so it reflects the sun like the ocean does
	roughness = mix(roughness, 0.2909, beachWeight);

	/* Bump: Blender strength x distance (0.001) per surface */

	float oceanRipple = sin(6.2832 * 600.0 * g.x + 6.83 * valueNoise(g * 40.0));
	float dBs = 0.0;
	float dBt = 0.0;
	addBump(dBs, dBt, wForest, 0.020, forestTex.g);
	addBump(dBs, dBt, wTaiga, -0.030, taigaTex.g);
	addBump(dBs, dBt, wDesert, 0.001, desertTex.r);
	addBump(dBs, dBt, wSavanna, 0.001, desertTex.r);
	addBump(dBs, dBt, wMountain, 0.010, desertTex.r);
	addBump(dBs, dBt, wOcean, 0.0000333, oceanRipple);
	addBump(dBs, dBt, beachWeight * (1.0 - wOcean), 0.0000333, oceanRipple);
	vec3 normal = perturbNormal(n, n, dBs, dBt);

	/* Lighting; viewers see every point of the display roughly head-on, so the view vector is the geometric normal */

	vec3 lightDirection = normalize(sunDirection);
	float lit = smoothstep(-0.08, 0.25, dot(n, lightDirection));
	float diffuse = max(dot(normal, lightDirection), 0.0) * lit;

	vec3 halfway = normalize(lightDirection + n);
	float a2 = pow(max(roughness, 0.05), 4.0);
	float denominator = pow(max(dot(normal, halfway), 0.0), 2.0) * (a2 - 1.0) + 1.0;
	float distribution = a2 / (PI * denominator * denominator);
	float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(n, halfway), 0.0), 5.0);
	float specular = distribution * fresnel * 0.25 * diffuse;

	vec3 color = albedo * (SUN_COLOR * diffuse + AMBIENT) + SUN_COLOR * specular;
	gl_FragColor = vec4(toneMap(color), 1.0);
	#include <colorspace_fragment>
}
