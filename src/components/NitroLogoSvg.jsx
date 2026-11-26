import React, { useId } from 'react';

const MODE_PALETTES = {
  Quiet: {
    c0: '#047857',
    c1: '#10b981',
    c2: '#6ee7b7',
    glow: 'rgba(16, 185, 129, 0.78)',
    glowSoft: 'rgba(16, 185, 129, 0.35)',
  },
  Eco: {
    c0: '#15803d',
    c1: '#22c55e',
    c2: '#86efac',
    glow: 'rgba(34, 197, 94, 0.78)',
    glowSoft: 'rgba(34, 197, 94, 0.35)',
  },
  Balanced: {
    c0: '#0369a1',
    c1: '#00e5ff',
    c2: '#a5f3fc',
    glow: 'rgba(0, 229, 255, 0.80)',
    glowSoft: 'rgba(56, 189, 248, 0.38)',
  },
  Performance: {
    c0: '#991b1b',
    c1: '#ff2244',
    c2: '#fda4af',
    glow: 'rgba(255, 34, 68, 0.82)',
    glowSoft: 'rgba(239, 68, 68, 0.38)',
  },
  Turbo: {
    c0: '#881337',
    c1: '#ff0055',
    c2: '#ff8a65',
    glow: 'rgba(255, 0, 85, 0.85)',
    glowSoft: 'rgba(255, 107, 53, 0.42)',
  },
};

const NitroLogoSvg = ({ mode = 'Balanced', brand = 'nitro', height, className = '', style = {}, animated = true }) => {
  const uid = useId().replace(/:/g, '');
  const gradId = `metal-${uid}`;
  const rimId = `rim-${uid}`;
  const palette = MODE_PALETTES[mode] || MODE_PALETTES.Balanced;
  const isPredator = brand === 'predator';

  return (
    <div
      className={`relative inline-flex items-center justify-center ${animated ? 'nitro-logo-breathe' : ''} ${className}`}
      style={{ ...(height ? { height } : {}), ...style }}
    >
      <svg
        viewBox={isPredator ? '0 0 758 991' : '0 0 329 865'}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 h-full w-auto"
        style={{
          filter: `drop-shadow(0 0 10px ${palette.glow}) drop-shadow(0 0 24px ${palette.glowSoft})`,
        }}
      >
        <defs>
          <linearGradient
            id={gradId}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
            gradientUnits="objectBoundingBox"
            spreadMethod="repeat"
          >
            <stop offset="0%" stopColor={palette.c0} />
            <stop offset="22%" stopColor={palette.c1} />
            <stop offset="42%" stopColor={palette.c2} />
            <stop offset="50%" stopColor="#ffffff" />
            <stop offset="58%" stopColor={palette.c2} />
            <stop offset="78%" stopColor={palette.c1} />
            <stop offset="100%" stopColor={palette.c0} />
            {animated && (
              <animateTransform
                attributeName="gradientTransform"
                type="translate"
                from="0 0"
                to="1 1"
                dur="3.4s"
                repeatCount="indefinite"
              />
            )}
          </linearGradient>

          <linearGradient id={rimId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
            <stop offset="50%" stopColor={palette.c2} stopOpacity="0.4" />
            <stop offset="100%" stopColor={palette.c0} stopOpacity="0.8" />
          </linearGradient>
        </defs>
        {isPredator ? (
          <>
            <path
              d="M758 563.945V0L662.271 227.145L498.038 394.121L399.463 117.667V709.027L487.006 796.609L563.696 991V522.824L648.571 388.603V528.343L596.614 580.323V725.403L758 563.945Z"
              fill={`url(#${gradId})`}
              stroke={`url(#${rimId})`}
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <path
              d="M0 563.945V0L96.0844 224.474L260.318 391.451L358.894 117.667V709.027L271.35 796.609L194.304 991V522.824L109.429 391.451V531.013L161.386 580.323V725.403L0 563.945Z"
              fill={`url(#${gradId})`}
              stroke={`url(#${rimId})`}
              strokeWidth="4"
              strokeLinejoin="round"
            />
          </>
        ) : (
          <path
            d="M230 320.5L3 0L0 492.5L106 600.5L111.5 368L171.5 467L175.5 864.5L328.5 616.5L317.5 100L230 320.5Z"
            fill={`url(#${gradId})`}
            stroke={`url(#${rimId})`}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  );
};

export default NitroLogoSvg;
