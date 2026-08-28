/**
 * RIMJOBS VISUAL ANALYTICS
 * Renders SVG charts and visual data representations.
 */

const Charts = {
  /**
   * Renders a simple SVG Radar (Spider) chart for colony-wide skill levels.
   */
  renderColonyRadar(pawns, size = 400, radarCtxMap) {
    // Guard inputs so the SVG can never contain NaN coordinates.
    size = (Number.isFinite(Number(size)) && Number(size) > 0) ? Number(size) : 400;
    const list = Array.isArray(pawns) ? pawns : [];
    const center = size / 2;
    const radius = size * 0.385; // scales with size
    const categories = SKILLS;
    const angleStep = (Math.PI * 2) / categories.length;

    // Calculate colony averages
    const canonicalUnknownCounts = [];
    const averages = categories.map(s => {
      let canonicalUnknown = 0;
      const total = list.reduce((sum, p) => {
        const pawnCtx = radarCtxMap && radarCtxMap.get(p.id);
        const projection = pawnCtx && App._c5SkillProjection
          ? App._c5SkillProjection(pawnCtx, s.id) : null;
        if (projection && projection.level != null) return sum + projection.level;
        canonicalUnknown++;
        return sum + App.effectiveSkill(p, s.id);
      }, 0);
      canonicalUnknownCounts.push(canonicalUnknown);
      const v = (total / (list.length || 1)) / 20; // 0.0 to 1.0
      return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    });

    const labelSize = Math.max(12, Math.round(size * 0.042));
    const pad = Math.round(size * 0.10);             // breathing room for outer labels
    const dotR = Math.max(2.2, size * 0.012);

    // Data polygon points
    let points = "";
    averages.forEach((val, i) => {
      const x = center + Math.sin(i * angleStep) * radius * val;
      const y = center - Math.cos(i * angleStep) * radius * val;
      points += `${x},${y} `;
    });

    // Concentric grid rings (subtle, brighter at the outer edge)
    let bgHtml = "";
    [0.25, 0.5, 0.75, 1.0].forEach((r, ri) => {
      let rPoints = "";
      categories.forEach((_, i) => {
        const x = center + Math.sin(i * angleStep) * radius * r;
        const y = center - Math.cos(i * angleStep) * radius * r;
        rPoints += `${x},${y} `;
      });
      const outer = ri === 3;
      bgHtml += `<polygon points="${rPoints}" fill="none" stroke="var(--border-${outer ? 'bright' : 'med'})" stroke-width="${outer ? 1.4 : 1}" stroke-opacity="${outer ? 0.8 : 0.4}" />`;
    });

    // Per-axis interactive groups: spoke + vertex dot + 2-line label, each hoverable
    // (highlights the axis and shows the colony average via a native tooltip). The
    // big transparent hit-circle sits over the label so hovering is forgiving.
    const dotStroke = Math.max(1, size * 0.004);
    const hitR = size * 0.06;
    const axes = categories.map((s, i) => {
      const sin = Math.sin(i * angleStep), cos = Math.cos(i * angleStep);
      const ex = center + sin * radius, ey = center - cos * radius;            // spoke end
      const dx = center + sin * radius * averages[i], dy = center - cos * radius * averages[i]; // dot
      const lx = center + sin * (radius + size * 0.085), ly = center - cos * (radius + size * 0.085); // label
      const shown = (averages[i] * 20).toFixed(1);
      const notice = canonicalUnknownCounts[i]
        ? ` · Canonical C5 skill evidence incomplete for ${canonicalUnknownCounts[i]} pawn${canonicalUnknownCounts[i] === 1 ? '' : 's'}; legacy-compatible values shown.`
        : '';
      return `<g class="radar-axis" title="${s.name}: ${shown} / 20 colony average${notice}">
          <!-- title attribute (not an SVG <title> child) so it uses the app-wide styled tooltip -->
          <line class="radar-spoke" x1="${center}" y1="${center}" x2="${ex}" y2="${ey}" stroke="var(--border)" stroke-opacity="0.55" />
          <circle class="radar-dot" cx="${dx}" cy="${dy}" r="${dotR}" fill="var(--accent)" stroke="var(--surface)" stroke-width="${dotStroke}" />
          <text class="radar-label" x="${lx}" y="${ly}" text-anchor="middle" font-family="Arial, sans-serif">
            <tspan class="radar-lab-name" x="${lx}" fill="var(--text3)" font-size="${labelSize}" font-weight="700">${s.short}</tspan>
            <tspan class="radar-lab-val" x="${lx}" dy="${Math.round(labelSize * 1.05)}" fill="var(--accent)" font-size="${Math.round(labelSize * 0.9)}" font-weight="800">${shown}</tspan>
          </text>
          <circle class="radar-hit" cx="${lx}" cy="${ly - labelSize * 0.3}" r="${hitR}" fill="transparent" />
        </g>`;
    }).join('');

    // Padded viewBox + overflow:visible so the two-line labels never clip.
    const vb = `${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`;
    const dotHover = Math.max(dotR * 1.9, size * 0.022);
    return `
      <svg viewBox="${vb}" style="display:block; margin:0 auto; width:100%; height:auto; min-width:170px; max-width:${Math.max(size, 200)}px; overflow:visible">
        <style>
          .radar-axis { cursor: pointer; }
          .radar-dot { transition: r .12s ease, fill .12s ease, stroke .12s ease; }
          .radar-spoke { transition: stroke .12s ease, stroke-opacity .12s ease, stroke-width .12s ease; }
          .radar-lab-name, .radar-lab-val { transition: fill .12s ease; }
          .radar-axis:hover .radar-dot { r: ${dotHover}px; fill: #fff; stroke: var(--accent); }
          .radar-axis:hover .radar-spoke { stroke: var(--accent); stroke-opacity: 1; stroke-width: ${Math.max(1.5, size * 0.006)}; }
          .radar-axis:hover .radar-lab-name { fill: var(--accent); }
          .radar-axis:hover .radar-lab-val { fill: var(--text); }
        </style>
        <defs>
          <radialGradient id="radarBg" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.10" />
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="radarFill" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.50" />
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.14" />
          </radialGradient>
          <filter id="radarGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="${Math.max(1, size * 0.012)}" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx="${center}" cy="${center}" r="${radius}" fill="url(#radarBg)" />
        ${bgHtml}
        <polygon points="${points}" fill="url(#radarFill)" stroke="var(--accent)" stroke-width="${Math.max(2, size * 0.007)}" stroke-linejoin="round" filter="url(#radarGlow)" pointer-events="none" />
        ${axes}
      </svg>
    `;
  }
};

