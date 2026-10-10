// Six equiangular cube faces in a 3 x 2 atlas. Two ghost texels per edge
// are evaluated on the sphere too, so linear filtering never reads another tile.
const float PI = 3.141592653589793;
const float GUTTER = 2.0;

vec3 faceDirection(float face, vec2 uv) {
	vec2 p = tan((uv * 2.0 - 1.0) * (PI * 0.25));
	if (face < 0.5) return normalize(vec3(1.0, p.y, -p.x));
	if (face < 1.5) return normalize(vec3(-1.0, p.y, p.x));
	if (face < 2.5) return normalize(vec3(p.x, 1.0, -p.y));
	if (face < 3.5) return normalize(vec3(p.x, -1.0, p.y));
	if (face < 4.5) return normalize(vec3(p.x, p.y, 1.0));
	return normalize(vec3(-p.x, p.y, -1.0));
}

vec3 atlasDirection(vec2 uv, float resolution) {
	float tileSize = resolution + 2.0 * GUTTER;
	vec2 pixel = uv * vec2(3.0, 2.0) * tileSize;
	vec2 tile = min(floor(pixel / tileSize), vec2(2.0, 1.0));
	vec2 local = (pixel - tile * tileSize - GUTTER) / resolution;
	return faceDirection(tile.x + 3.0 * tile.y, local);
}

vec2 atlasUv(vec3 n, float resolution) {
	vec3 a = abs(n);
	float face;
	vec2 p;
	if (a.x >= a.y && a.x >= a.z) {
		face = n.x >= 0.0 ? 0.0 : 1.0;
		p = vec2(n.x >= 0.0 ? -n.z : n.z, n.y) / a.x;
	} else if (a.y >= a.z) {
		face = n.y >= 0.0 ? 2.0 : 3.0;
		p = vec2(n.x, n.y >= 0.0 ? -n.z : n.z) / a.y;
	} else {
		face = n.z >= 0.0 ? 4.0 : 5.0;
		p = vec2(n.z >= 0.0 ? n.x : -n.x, n.y) / a.z;
	}
	vec2 local = atan(p) / (PI * 0.5) + 0.5;
	vec2 tile = vec2(mod(face, 3.0), floor(face / 3.0));
	float tileSize = resolution + 2.0 * GUTTER;
	return (tile * tileSize + GUTTER + local * resolution)
		/ (vec2(3.0, 2.0) * tileSize);
}

vec4 sampleSphere(sampler2D field, vec3 n, float resolution) {
	return texture2D(field, atlasUv(n, resolution));
}

vec3 tangent(vec3 v, vec3 n) {
	return v - n * dot(v, n);
}

// Exponential map on the unit sphere: the displacement is measured in radians.
vec3 sphereExp(vec3 n, vec3 displacement) {
	float angle = length(displacement);
	if (angle < 1e-7) return n;
	return normalize(cos(angle) * n + sin(angle) * displacement / angle);
}

// Levi-Civita parallel transport along the shortest great-circle arc.
// Traces and derivative stencils are short, so endpoints cannot be antipodal.
vec3 transport(vec3 v, vec3 from, vec3 to) {
	v = tangent(v, from);
	return tangent(v - dot(v, to) / max(1.0 + dot(from, to), 1e-5) * (from + to), to);
}

void tangentFrame(vec3 n, out vec3 x, out vec3 y) {
	vec3 axis = abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
	x = normalize(cross(axis, n));
	y = cross(n, x);
}

vec3 sampleVelocity(sampler2D field, vec3 n, float resolution) {
	return tangent(sampleSphere(field, n, resolution).xyz, n);
}

// Midpoint characteristic tracing, transporting the midpoint velocity back
// into the destination tangent plane before taking the full geodesic step.
vec3 backtrace(sampler2D field, vec3 n, float resolution, float dt) {
	vec3 v = sampleVelocity(field, n, resolution);
	vec3 midpoint = sphereExp(n, -0.5 * dt * v);
	vec3 midVelocity = sampleVelocity(field, midpoint, resolution);
	return sphereExp(n, -dt * transport(midVelocity, midpoint, n));
}

vec3 limitVelocity(vec3 v, vec3 n) {
	v = tangent(v, n);
	return v * min(1.0, 3.0 / max(length(v), 1e-6));
}

// A streamfunction-derived forcing: n x grad(psi) is tangential and
// analytically divergence-free, unlike projecting arbitrary 3D noise.
vec3 ambientFlow(vec3 n, float time) {
	vec3 k1 = vec3(3.1, -2.7, 4.2);
	vec3 k2 = vec3(-4.3, 3.6, 1.8);
	vec3 gradient = k1 * cos(dot(k1, n) + time * 0.13)
		+ 0.6 * k2 * cos(dot(k2, n) - time * 0.17);
	return cross(n, gradient) * 0.065;
}

vec3 seedDye(vec3 n) {
	float phase = 7.0 * n.x + 4.0 * n.z + 1.7 * sin(5.0 * n.y - 3.0 * n.z);
	vec3 palette = 0.5 + 0.5 * cos(phase + vec3(0.0, 2.1, 4.2));
	float ribbons = 0.18 + 0.65 * pow(0.5 + 0.5 * sin(phase * 1.8), 3.0);
	return palette * ribbons;
}
