import React, { useEffect, useMemo, useRef, useState } from 'react';
import ansiLayout from '../assets/layouts/ansi.json';

const FOUR_ZONE_EDGES = [4.5, 9.75, 15.25];
const BLEND_WIDTH = 1.0;

export const CUSTOM_SOFTWARE_EFFECTS = new Set(['Aurora', 'DualPulse', 'SpectrumFlow', 'DualComet']);

export function hexToRgb(hex) {
  const clean = String(hex || '#00e5ff').replace('#', '');
  if (clean.length !== 6) return { r: 0, g: 229, b: 255 };
  return {
    r: parseInt(clean.slice(0, 2), 16) || 0,
    g: parseInt(clean.slice(2, 4), 16) || 0,
    b: parseInt(clean.slice(4, 6), 16) || 0,
  };
}

export function rgbToHex({ r, g, b }) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function scaleRgb(rgb, factor) {
  return {
    r: Math.round(rgb.r * factor),
    g: Math.round(rgb.g * factor),
    b: Math.round(rgb.b * factor),
  };
}

function blendRgb(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

export function computeEffectZoneColors(lighting, elapsedSec) {
  const effect = lighting?.effect || 'Static';
  const speed = lighting?.speed ?? 5;
  const brightness = (lighting?.brightness ?? 100) / 100;
  const direction = lighting?.direction || 'Right';
  const effectColor = hexToRgb(lighting?.effectColor || '#00e5ff');
  const fallbackColor = lighting?.effectColor || '#00e5ff';
  const zones = Array.isArray(lighting?.zones) && lighting.zones.length > 0
    ? lighting.zones
    : [
        { on: true, color: fallbackColor },
        { on: true, color: fallbackColor },
        { on: true, color: fallbackColor },
        { on: true, color: fallbackColor },
      ];

  const rate = 0.55 + speed * 0.24;
  const t = elapsedSec * rate;
  const dirSign = direction === 'Left' ? -1 : 1;

  if (effect === 'Static') {
    return zones.map(z => (z.on ? scaleRgb(hexToRgb(z.color), brightness) : { r: 10, g: 14, b: 20 }));
  }
  if (effect === 'Breathing') {
    const pulse = 0.06 + 0.94 * (0.5 - 0.5 * Math.cos(t * 2.4));
    return [0, 1, 2, 3].map(() => scaleRgb(effectColor, pulse * brightness));
  }
  if (effect === 'Neon') {
    const hue = (t * 65) % 360;
    const c = hslToRgb(hue, 1, 0.5);
    return [0, 1, 2, 3].map(() => scaleRgb(c, brightness));
  }
  if (effect === 'Wave') {
    return [0, 1, 2, 3].map(i => {
      const hue = ((t * 95) - dirSign * i * 58 + 3600) % 360;
      return scaleRgb(hslToRgb(hue, 1, 0.5), brightness);
    });
  }
  if (effect === 'Shifting') {
    const pos = ((t * 1.4 * dirSign) % 4 + 4) % 4;
    return [0, 1, 2, 3].map(i => {
      const rawDist = Math.abs(i - pos);
      const wrapDist = Math.min(rawDist, 4 - rawDist);
      const intensity = 0.1 + 0.9 * Math.exp(-wrapDist * wrapDist * 1.6);
      return scaleRgb(effectColor, intensity * brightness);
    });
  }
  if (effect === 'Zoom') {
    // True Acer Crate Zoom: expands smoothly from middle zones (1,2) -> all (0,1,2,3) -> middle (1,2) -> dark
    const wave = 0.5 - 0.5 * Math.cos(t * 2.2);
    const innerIntensity = 0.05 + 0.95 * Math.min(1, wave * 1.55);
    const outerIntensity = 0.05 + 0.95 * Math.max(0, (wave - 0.28) / 0.72);
    return [0, 1, 2, 3].map(i => {
      const isInner = i === 1 || i === 2;
      return scaleRgb(effectColor, (isInner ? innerIntensity : outerIntensity) * brightness);
    });
  }
  if (effect === 'Meteor') {
    // Smooth ping-pong meteor bouncing 0 -> 3 -> 0
    const pingPong = 1.5 - 1.5 * Math.cos(t * 1.9);
    const head = dirSign > 0 ? pingPong : 3 - pingPong;
    return [0, 1, 2, 3].map(i => {
      const dist = Math.abs(i - head);
      const intensity = 0.08 + 0.92 * Math.exp(-dist * dist * 1.9);
      return scaleRgb(effectColor, intensity * brightness);
    });
  }
  if (effect === 'Twinkling') {
    return [0, 1, 2, 3].map(i => {
      const phase = t * 3.4 + i * 1.75;
      const sparkle = Math.pow(0.5 + 0.5 * Math.sin(phase), 2.2);
      const intensity = 0.1 + 0.9 * sparkle;
      return scaleRgb(effectColor, intensity * brightness);
    });
  }
  // --- Custom Seamless Software Effects ---
  if (effect === 'Aurora') {
    // Smooth northern lights: drifting cyan -> emerald -> violet waves
    return [0, 1, 2, 3].map(i => {
      const hue = 155 + 55 * Math.sin(t * 0.9 + i * 0.85) + 25 * Math.cos(t * 0.5 - i * 0.6);
      const l = 0.42 + 0.12 * Math.sin(t * 1.4 + i * 1.1);
      return scaleRgb(hslToRgb((hue + 360) % 360, 0.92, l), brightness);
    });
  }
  if (effect === 'DualPulse') {
    // Rhythmic dual-beat pulse blending effectColor with secondary accent
    const beat = Math.pow(0.5 + 0.5 * Math.sin(t * 2.6), 3);
    const harmonic = Math.pow(0.5 + 0.5 * Math.sin(t * 2.6 - 0.9), 2);
    const secondary = { r: 56, g: 189, b: 248 };
    return [0, 1, 2, 3].map(i => {
      const mix = i === 1 || i === 2 ? beat : harmonic;
      const col = blendRgb(secondary, effectColor, mix);
      return scaleRgb(col, (0.25 + 0.75 * Math.max(beat, harmonic)) * brightness);
    });
  }
  if (effect === 'SpectrumFlow') {
    // Ultra-smooth continuous rainbow gradient
    return [0, 1, 2, 3].map(i => {
      const hue = ((t * 48) + i * 32) % 360;
      return scaleRgb(hslToRgb(hue, 0.95, 0.52), brightness);
    });
  }
  if (effect === 'DualComet') {
    // Two symmetrical comets colliding in the center and rebounding to the edges
    const pos = 0.5 - 0.5 * Math.cos(t * 2.1); // 0..1
    const leftHead = pos * 1.5;       // 0 -> 1.5
    const rightHead = 3 - pos * 1.5;  // 3 -> 1.5
    return [0, 1, 2, 3].map(i => {
      const d = Math.min(Math.abs(i - leftHead), Math.abs(i - rightHead));
      const intensity = 0.08 + 0.92 * Math.exp(-d * d * 2.4);
      return scaleRgb(effectColor, intensity * brightness);
    });
  }

  return zones.map(z => (z.on ? scaleRgb(hexToRgb(z.color), brightness) : { r: 10, g: 14, b: 20 }));
}

function keyZoneColor(centerX, zoneColors) {
  const edges = FOUR_ZONE_EDGES;
  let zoneIdx = 0;
  while (zoneIdx < edges.length && centerX >= edges[zoneIdx]) zoneIdx++;
  let c = zoneColors[zoneIdx] || zoneColors[0] || { r: 0, g: 229, b: 255 };
  if (zoneIdx > 0) {
    const dist = centerX - edges[zoneIdx - 1];
    if (dist < BLEND_WIDTH / 2) {
      const t = 0.5 + dist / BLEND_WIDTH;
      c = blendRgb(zoneColors[zoneIdx - 1], c, t);
    }
  }
  if (zoneIdx < edges.length) {
    const dist = edges[zoneIdx] - centerX;
    if (dist < BLEND_WIDTH / 2) {
      const t = 0.5 + dist / BLEND_WIDTH;
      c = blendRgb(zoneColors[zoneIdx + 1], c, t);
    }
  }
  return c;
}

const KeyboardPreview = ({ lighting, onZoneClick, interactive = true }) => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const rafRef = useRef(null);

  const effect = lighting?.effect || 'Static';
  const brightness = (lighting?.brightness ?? 100) / 100;

  useEffect(() => {
    if (effect === 'Static' || brightness <= 0) {
      setElapsedSec(0);
      return undefined;
    }
    const start = performance.now();
    let lastUpdate = 0;
    const loop = (now) => {
      if (!document.hidden && now - lastUpdate >= 33) {
        lastUpdate = now;
        setElapsedSec((now - start) / 1000);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [effect, brightness]);

  const zoneColors = useMemo(
    () => computeEffectZoneColors(lighting, elapsedSec),
    [lighting, elapsedSec]
  );

  const viewW = ansiLayout.width;
  const viewH = ansiLayout.height;

  return (
    <div className="w-full select-none">
      <div className="bg-[#04070d] border border-white/10 rounded-xl p-2.5 shadow-inner">
        <svg viewBox={`-0.3 -0.3 ${viewW + 0.6} ${viewH + 0.6}`} className="w-full h-auto">
          {ansiLayout.keys.map((k) => {
            const first = k.rects[0];
            const cx = first[0] + first[2] / 2;
            let c;
            if (effect === 'Wave' && brightness > 0) {
              const rate = 0.55 + (lighting?.speed ?? 5) * 0.24;
              const dirSign = lighting?.direction === 'Left' ? -1 : 1;
              const u = Math.max(0, Math.min(1, cx / viewW));
              const hue = ((elapsedSec * rate * 95) - dirSign * u * 260 + 3600) % 360;
              c = scaleRgb(hslToRgb(hue, 1, 0.5), brightness);
            } else if (effect === 'SpectrumFlow' && brightness > 0) {
              const rate = 0.55 + (lighting?.speed ?? 5) * 0.24;
              const u = Math.max(0, Math.min(1, cx / viewW));
              const hue = ((elapsedSec * rate * 48) + u * 160) % 360;
              c = scaleRgb(hslToRgb(hue, 0.95, 0.52), brightness);
            } else {
              c = keyZoneColor(cx, zoneColors);
            }
            const isLit = c.r + c.g + c.b > 28;
            const rgbStr = `rgb(${c.r}, ${c.g}, ${c.b})`;
            let zoneIdx = 0;
            while (zoneIdx < FOUR_ZONE_EDGES.length && cx >= FOUR_ZONE_EDGES[zoneIdx]) zoneIdx++;

            return (
              <g
                key={k.code}
                className={interactive ? 'cursor-pointer' : 'cursor-default'}
                onClick={interactive ? () => onZoneClick?.(zoneIdx) : undefined}
              >
                {k.rects.map((r, ri) => (
                  <rect
                    key={ri}
                    x={r[0] + 0.06}
                    y={r[1] + 0.06}
                    width={Math.max(0.2, r[2] - 0.12)}
                    height={Math.max(0.2, r[3] - 0.12)}
                    rx={0.14}
                    ry={0.14}
                    fill={isLit ? `rgba(${c.r}, ${c.g}, ${c.b}, 0.24)` : 'rgba(15, 23, 35, 0.85)'}
                    stroke={isLit ? rgbStr : 'rgba(255, 255, 255, 0.12)'}
                    strokeWidth={isLit ? 0.065 : 0.04}
                  />
                ))}
                {k.legend && (
                  <text
                    x={first[0] + first[2] / 2}
                    y={first[1] + first[3] / 2 + 0.11}
                    textAnchor="middle"
                    fill={isLit ? '#ffffff' : 'rgba(148, 163, 184, 0.55)'}
                    fontSize={k.legend.length > 3 ? 0.23 : 0.3}
                    fontWeight="700"
                    fontFamily="sans-serif"
                  >
                    {k.legend}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex justify-between items-center mt-1.5 px-1 text-[9px] font-bold tracking-widest text-slate-500">
        <span>{interactive ? 'Click any key to toggle/select zone' : '4-Zone Animated Preview'}</span>
        <span>4-Zone EC Layout (ANSI)</span>
      </div>
    </div>
  );
};

export default KeyboardPreview;
