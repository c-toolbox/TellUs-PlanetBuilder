uniform sampler2D field;
uniform sampler2D reference;
uniform sampler2D velocity;
uniform float resolution;
uniform float velocityResolution;
uniform int displayStyle;
uniform bool subtractReference;
uniform float scale;
uniform int channel;
varying vec3 vDirection;

const vec3 BACKGROUND = vec3(0.004, 0.007, 0.016);

vec3 inkColor(vec3 ink) {
	return BACKGROUND + 1.0 - exp(-1.6 * max(ink, vec3(0.0)));
}

vec3 signedColor(float value) {
	vec3 color = value < 0.0 ? vec3(0.025, 0.35, 1.0) : vec3(1.0, 0.18, 0.025);
	return mix(BACKGROUND, color, 1.0 - exp(-abs(value) * scale));
}

float segmentDistance(vec2 p, vec2 a, vec2 b) {
	vec2 segment = b - a;
	return length(p - a - segment * clamp(dot(p - a, segment) / dot(segment, segment), 0.0, 1.0));
}

// Anchor glyphs in the same cube-face geometry as the fields. Directions are
// evaluated at cell centres in the local tangent plane, including near poles.
float flowArrow(vec3 n, bool projectedFlow) {
	const float GRID = 12.0;
	float tileSize = GRID + 2.0 * GUTTER;
	vec2 pixel = atlasUv(n, GRID) * vec2(3.0, 2.0) * tileSize;
	vec2 tile = min(floor(pixel / tileSize), vec2(2.0, 1.0));
	vec2 local = clamp(pixel - tile * tileSize - GUTTER, vec2(0.0), vec2(GRID - 0.0001));
	vec3 center = faceDirection(tile.x + 3.0 * tile.y, (floor(local) + 0.5) / GRID);
	vec3 v;
	if (projectedFlow) {
		v = sampleVelocity(velocity, center, velocityResolution);
	} else {
		v = sampleSphere(field, center, resolution).xyz;
		if (subtractReference) v -= sampleSphere(reference, center, resolution).xyz;
		v = tangent(v, center);
	}
	vec3 x, y;
	tangentFrame(center, x, y);
	vec2 flow = vec2(dot(v, x), dot(v, y));
	float speed = length(flow);
	vec2 direction = flow / max(speed, 1e-7);
	vec2 offset = vec2(dot(n - center, x), dot(n - center, y)) / (PI / (2.0 * GRID));
	vec2 p = vec2(dot(offset, direction), dot(offset, vec2(-direction.y, direction.x)));
	float distance = segmentDistance(p, vec2(-0.27, 0.0), vec2(0.25, 0.0));
	distance = min(distance, segmentDistance(p, vec2(0.25, 0.0), vec2(0.08, 0.13)));
	distance = min(distance, segmentDistance(p, vec2(0.25, 0.0), vec2(0.08, -0.13)));
	// Differentiate the continuous sphere direction: p jumps between glyph
	// cells, which would otherwise turn the cell boundaries into bright lines.
	float aa = max(length(dFdx(n)), length(dFdy(n))) / (PI / (2.0 * GRID));
	return (1.0 - smoothstep(0.018, 0.018 + max(aa, 0.005), distance))
		* smoothstep(0.005, 0.08, speed * scale);
}

void main() {
	vec3 n = normalize(vDirection);
	vec3 value = sampleSphere(field, n, resolution).rgb;
	if (subtractReference) value -= sampleSphere(reference, n, resolution).rgb;
	vec3 color;
	if (displayStyle == DISPLAY_DYE || displayStyle == DISPLAY_DYE_FLOW) {
		color = inkColor(value);
		if (displayStyle == DISPLAY_DYE_FLOW) {
			color = mix(color, vec3(0.92, 0.97, 1.0), 0.85 * flowArrow(n, true));
		}
	} else if (displayStyle == DISPLAY_VECTOR) {
		vec3 v = tangent(value, n);
		float speed = length(v);
		vec3 directionColor = 0.5 + 0.5 * v / max(speed, 1e-7);
		color = BACKGROUND + directionColor * (1.0 - exp(-speed * scale));
		color = mix(color, vec3(0.92, 0.97, 1.0), 0.85 * flowArrow(n, false));
	} else {
		if (displayStyle == DISPLAY_SCALAR_COMPARISON && n.x >= 0.0) {
			value = sampleSphere(reference, n, resolution).rgb;
		}
		color = signedColor(channel == 1 ? value.g : value.r);
		if (displayStyle == DISPLAY_SCALAR_COMPARISON) {
			float meridian = 1.0 - smoothstep(0.0, max(fwidth(n.x), 0.0015), abs(n.x));
			color = mix(color, vec3(0.92, 0.97, 1.0), meridian);
		}
	}
	gl_FragColor = vec4(color, 1.0);
	#include <colorspace_fragment>
}
