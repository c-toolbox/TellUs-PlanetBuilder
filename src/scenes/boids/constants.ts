export const FISH_SIZE = 0.1;

export const FISH_BOIDS_CONFIG = {
	sightRadius: 0.25,
	neighborRadius: 0.16,
	separationRadius: 0.09,
	fearRadius: 0.3,
	cohesionWeight: 0.25,
	alignmentWeight: 0.07,
	separationWeight: 0.35,
	fearWeight: 1.5,
	sightAngle: Math.PI * 0.35,
	baseTurn: 0.06,
	panicTurn: 0.15,
	calmSpeed: 0.0015,
	panicSpeed: 0.02,
} as const;

export const BOAT_BOIDS_CONFIG = {
	sightRadius: FISH_BOIDS_CONFIG.sightRadius / 2,
	neighborRadius: FISH_BOIDS_CONFIG.neighborRadius / 2,
	separationRadius: FISH_BOIDS_CONFIG.separationRadius * 1.25,
	alignmentWeight: FISH_BOIDS_CONFIG.alignmentWeight * 0.01,
	separationWeight: FISH_BOIDS_CONFIG.separationWeight * 0.3,
	sightAngle: FISH_BOIDS_CONFIG.sightAngle,
	calmSpeed: FISH_BOIDS_CONFIG.calmSpeed,
	panicSpeed: FISH_BOIDS_CONFIG.panicSpeed,
	// Swipes affect a wider area than neighboring boats do.
	windRadius: FISH_BOIDS_CONFIG.sightRadius,
	steeringStrength: 0.00004,
	windStrength: 0.0006,
	damping: 0.97,
	speedRecovery: 0.1,
} as const;
