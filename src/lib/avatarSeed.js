function hashSeed(seed) {
  let hash = 0;
  for (const char of String(seed || 'dink-card')) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function getSeededAvatarDataUrl(seed) {
  const hash = hashSeed(seed);
  const hueA = hash % 360;
  const hueB = (hueA + 48) % 360;
  const hueC = (hueA + 120) % 360;
  const dotX = 28 + (hash % 44);
  const dotY = 26 + ((hash >> 3) % 36);
  const ring = 16 + ((hash >> 5) % 10);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none">
      <defs>
        <linearGradient id="bg" x1="6" y1="8" x2="88" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="hsl(${hueA} 82% 58%)"/>
          <stop offset="1" stop-color="hsl(${hueB} 78% 42%)"/>
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="28" fill="url(#bg)"/>
      <circle cx="70" cy="24" r="${ring}" fill="hsla(${hueC} 95% 88% / 0.22)"/>
      <circle cx="${dotX}" cy="${dotY}" r="11" fill="hsla(0 0% 100% / 0.14)"/>
      <path d="M24 76c5-14 18-22 32-22s27 8 32 22" fill="hsla(0 0% 100% / 0.2)"/>
      <circle cx="48" cy="39" r="15" fill="hsla(0 0% 100% / 0.88)"/>
      <path d="M28 76c4-10 12-15 20-15s16 5 20 15" fill="hsla(0 0% 100% / 0.88)"/>
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
