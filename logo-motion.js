'use strict';

const DEFAULT_MOTION = Object.freeze({
  lookbackMs: 120,
  minimumSampleMs: 12,
  minimumThrowSpeed: 180,
  maximumThrowSpeed: 2600,
  frictionPerSecond: 1.35,
  bounceRetention: 0.76,
  stopSpeed: 42,
  maximumDurationMs: 5500,
  rollRadius: 33
});

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.t);
}

function estimateThrowVelocity(samples, releasePoint, options = {}) {
  const config = { ...DEFAULT_MOTION, ...options };
  if (!finitePoint(releasePoint)) return { vx: 0, vy: 0, speed: 0 };
  const cutoff = releasePoint.t - config.lookbackMs;
  const recent = (Array.isArray(samples) ? samples : [])
    .filter(point => finitePoint(point) && point.t >= cutoff && point.t <= releasePoint.t)
    .concat(releasePoint)
    .sort((a, b) => a.t - b.t);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const elapsedMs = last && first ? last.t - first.t : 0;
  if (elapsedMs < config.minimumSampleMs) return { vx: 0, vy: 0, speed: 0 };

  let vx = (last.x - first.x) * 1000 / elapsedMs;
  let vy = (last.y - first.y) * 1000 / elapsedMs;
  let speed = Math.hypot(vx, vy);
  if (speed < config.minimumThrowSpeed) return { vx: 0, vy: 0, speed: 0 };
  if (speed > config.maximumThrowSpeed) {
    const scale = config.maximumThrowSpeed / speed;
    vx *= scale;
    vy *= scale;
    speed = config.maximumThrowSpeed;
  }
  return { vx, vy, speed };
}

function angularVelocityForMotion(vx, vy, options = {}) {
  const config = { ...DEFAULT_MOTION, ...options };
  const dominantVelocity = Math.abs(vx) >= Math.abs(vy) ? vx : vy;
  const direction = Math.sign(dominantVelocity) || 1;
  return (Math.hypot(vx, vy) / config.rollRadius) * (180 / Math.PI) * direction;
}

function advanceMotion(state, elapsedSeconds, perimeter, options = {}) {
  const config = { ...DEFAULT_MOTION, ...options };
  const dt = Math.max(0, Math.min(0.05, Number(elapsedSeconds) || 0));
  const previousX = state.x;
  const previousY = state.y;
  const previousVx = state.vx;
  const previousVy = state.vy;
  let x = previousX + previousVx * dt;
  let y = previousY + previousVy * dt;
  let vx = previousVx;
  let vy = previousVy;
  let bouncedX = false;
  let bouncedY = false;

  if (x < perimeter.minX) {
    x = perimeter.minX;
    vx = Math.abs(vx) * config.bounceRetention;
    bouncedX = true;
  } else if (x > perimeter.maxX) {
    x = perimeter.maxX;
    vx = -Math.abs(vx) * config.bounceRetention;
    bouncedX = true;
  }
  if (y < perimeter.minY) {
    y = perimeter.minY;
    vy = Math.abs(vy) * config.bounceRetention;
    bouncedY = true;
  } else if (y > perimeter.maxY) {
    y = perimeter.maxY;
    vy = -Math.abs(vy) * config.bounceRetention;
    bouncedY = true;
  }

  const distance = Math.hypot(x - previousX, y - previousY);
  const dominantVelocity = Math.abs(previousVx) >= Math.abs(previousVy) ? previousVx : previousVy;
  const rollDirection = Math.sign(dominantVelocity) || 1;
  const rotation = state.rotation + (distance / config.rollRadius) * (180 / Math.PI) * rollDirection;
  const damping = Math.exp(-config.frictionPerSecond * dt);
  vx *= damping;
  vy *= damping;
  const ageMs = (state.ageMs || 0) + dt * 1000;
  const speed = Math.hypot(vx, vy);

  return {
    ...state,
    x,
    y,
    vx,
    vy,
    rotation,
    ageMs,
    speed,
    bouncedX,
    bouncedY,
    stopped: speed <= config.stopSpeed || ageMs >= config.maximumDurationMs
  };
}

module.exports = { DEFAULT_MOTION, estimateThrowVelocity, angularVelocityForMotion, advanceMotion };
