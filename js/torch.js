/* ============================================================
   torch.js — the hooded figure in the bottom-left corner
   A flat silhouette carrying a torch whose two flames wind
   around one another as a simplified double helix. The strands
   are generated here (a pair of sine waves half a wavelength
   out of phase) so the helix can scroll upward by exactly one
   wavelength and loop seamlessly; the flame outline clips them
   into a taper and the CSS handles the motion.
   ============================================================ */

(() => {
  "use strict";

  if (document.querySelector(".torch")) return;

  const SVG = "http://www.w3.org/2000/svg";

  /* helix geometry, in viewBox units */
  const CX = 92;        // axis the two strands wind around
  const AMP = 7.5;      // how far each strand swings off the axis
  const WAVE = 19;      // one full turn
  /* The strands must overhang the flame clip (which ends at y = 72) by at
     least one whole wavelength at the trailing end, or the base empties out
     before the loop restarts and the flame visibly snaps. */
  const TOP = -28;
  const BOT = 96;       // 72 + WAVE, plus margin

  function strand(phase) {
    let d = "";
    for (let y = BOT; y >= TOP; y -= 1.5) {
      const x = CX + AMP * Math.sin(((y / WAVE) * Math.PI * 2) + phase);
      d += (d ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2) + " ";
    }
    return d.trim();
  }

  const wrap = document.createElementNS(SVG, "svg");
  wrap.setAttribute("class", "torch");
  wrap.setAttribute("viewBox", "0 0 130 172");
  wrap.setAttribute("aria-hidden", "true");
  wrap.setAttribute("focusable", "false");

  wrap.innerHTML =
    '<defs>' +
      // the flame narrows to a point: the strands scroll through this
      '<clipPath id="tq-flame">' +
        '<path d="M92 4 C100 22, 106 38, 105 52 C104 64, 98 72, 92 72 ' +
                 'C86 72, 80 64, 79 52 C78 38, 84 22, 92 4 Z"/>' +
      '</clipPath>' +
      // ...and thins out as it climbs
      '<linearGradient id="tq-fade" x1="0" y1="1" x2="0" y2="0">' +
        '<stop offset="0" stop-color="#fff" stop-opacity="1"/>' +
        '<stop offset="0.55" stop-color="#fff" stop-opacity="0.85"/>' +
        '<stop offset="1" stop-color="#fff" stop-opacity="0.1"/>' +
      '</linearGradient>' +
      '<mask id="tq-mask">' +
        '<rect x="70" y="0" width="44" height="76" fill="url(#tq-fade)"/>' +
      '</mask>' +
      '<radialGradient id="tq-glow">' +
        '<stop offset="0" stop-color="var(--flame-glow)" stop-opacity="0.5"/>' +
        '<stop offset="1" stop-color="var(--flame-glow)" stop-opacity="0"/>' +
      '</radialGradient>' +
    '</defs>' +

    '<ellipse class="torch-glow" cx="92" cy="46" rx="34" ry="42" fill="url(#tq-glow)"/>' +

    // Cloak and cowl in one silhouette. The second subpath is the shadow
    // inside the hood — evenodd punches it out, which is what makes the
    // figure read as hooded rather than as a post.
    '<path class="torch-body" fill-rule="evenodd" d="' +
      'M57 36 C43 37, 34 49, 35 64 ' +          // crown down the front of the hood
      'C35 71, 32 76, 30 83 ' +                 // shoulder
      'C24 99, 19 130, 16 170 ' +               // cloak falls to the ground
      'L80 170 ' +
      'C78 140, 75 111, 71 92 ' +               // back of the cloak
      'C68 82, 67 74, 67 65 ' +
      'C69 47, 70 36, 57 36 Z ' +
      'M56 51 C48 52, 44 59, 45 68 ' +          // the face, in shadow
      'C46 75, 51 78, 57 76 ' +
      'C53 69, 53 58, 56 51 Z"/>' +
    // the arm, reaching out to hold the shaft
    '<path class="torch-arm" d="M55 86 L77 95"/>' +
    '<circle class="torch-body" cx="79" cy="95" r="4.6"/>' +
    // the shaft, running through the hand up to the flame
    '<path class="torch-staff" d="M72 104 L93 72"/>' +

    '<g mask="url(#tq-mask)">' +
      '<g clip-path="url(#tq-flame)">' +
        '<g class="torch-helix">' +
          '<path class="torch-strand torch-strand--a" d="' + strand(0) + '"/>' +
          '<path class="torch-strand torch-strand--b" d="' + strand(Math.PI) + '"/>' +
        '</g>' +
      '</g>' +
    '</g>';

  document.body.appendChild(wrap);
})();
