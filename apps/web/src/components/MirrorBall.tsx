export const MirrorBall = () => {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 100 100"
      style={{ filter: "drop-shadow(0 2px 6px rgba(0,123,255,0.4))" }}
    >
      <defs>
        <radialGradient id="ballGrad" cx="35%" cy="35%" r="60%">
          <stop offset="0%" style={{ stopColor: "#ffffff", stopOpacity: 1 }} />
          <stop offset="40%" style={{ stopColor: "#007bff", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "#002a5a", stopOpacity: 1 }} />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="45" fill="url(#ballGrad)" stroke="#333" strokeWidth="2" />

      {/* Radial Mirror Tile Grid - Vertical Ellipses */}
      <ellipse
        cx="50"
        cy="50"
        rx="15"
        ry="45"
        fill="none"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1"
      />
      <ellipse
        cx="50"
        cy="50"
        rx="30"
        ry="45"
        fill="none"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="1"
      />
      <line x1="50" y1="5" x2="50" y2="95" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />

      {/* Radial Mirror Tile Grid - Horizontal Ellipses */}
      <ellipse
        cx="50"
        cy="50"
        rx="45"
        ry="15"
        fill="none"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1"
      />
      <ellipse
        cx="50"
        cy="50"
        rx="45"
        ry="30"
        fill="none"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="1"
      />
      <line x1="5" y1="50" x2="95" y2="50" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />

      {/* Bigger, More Sparkles */}
      <g>
        <path d="M25 15 L25 35 M15 25 L35 25" stroke="white" strokeWidth="3" strokeLinecap="round">
          <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 25 25"
            to="90 25 25"
            dur="2s"
            repeatCount="indefinite"
          />
        </path>
      </g>
      <g>
        <path
          d="M75 65 L75 85 M65 75 L85 75"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <animate
            attributeName="opacity"
            values="0;1;0"
            dur="1.5s"
            begin="0.7s"
            repeatCount="indefinite"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 75 75"
            to="-45 75 75"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </path>
      </g>
      <circle cx="80" cy="25" r="4" fill="white">
        <animate
          attributeName="opacity"
          values="0;1;0"
          dur="2.5s"
          begin="0.3s"
          repeatCount="indefinite"
        />
        <animate attributeName="r" values="2;5;2" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="40" cy="40" r="3" fill="white">
        <animate
          attributeName="opacity"
          values="0;0.8;0"
          dur="3s"
          begin="1s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
};
