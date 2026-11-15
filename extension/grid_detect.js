// Step 15: find a grid printed on a map image. Pure function, no browser APIs, so it runs in the
// extension's service worker (and in tests). Input: RGBA pixels. Output: square size, offset (the
// centre of the first grid line, which is where AboveVTT draws its own lines), line colour and width,
// and how sure it is.
//
// Method: for every column (and row) count how often that column is a thin line — darker (or lighter)
// than the pixels a few px either side — along the whole image. A printed grid gives evenly spaced
// columns that are lines nearly all the way down; textures (cobblestones, floor tiles, foliage) give
// short, scattered lines. Then a "comb" test finds the spacing and offset whose columns are most
// line-like compared with the average, and is refined to a fraction of a pixel.
/* exported AVTT_detectGrid */
(function (root) {
  function luminance(rgba, n) {
    const L = new Float32Array(n);
    for (let i = 0, p = 0; p < n; p++, i += 4) L[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    return L;
  }

  /** Per column / row: fraction of the image where it is a thin dark (or light) line. */
  function profiles(L, W, H, T = 4) {
    const cD = new Float64Array(W), cL = new Float64Array(W), rD = new Float64Array(H), rL = new Float64Array(H);
    const cM = new Float64Array(W), rM = new Float64Array(H); // mean brightness, for finding line centres
    for (let y = 4; y < H - 4; y++) {
      const row = y * W;
      for (let x = 4; x < W - 4; x++) {
        const p = row + x, v = L[p];
        cM[x] += v; rM[y] += v;
        // try narrow (±2) and wider (±4) neighbours so 1–6 px lines both count
        let a = L[p - 2], b = L[p + 2], a4 = L[p - 4], b4 = L[p + 4];
        if ((a - v > T && b - v > T) || (a4 - v > T && b4 - v > T)) cD[x]++;
        else if ((v - a > T && v - b > T) || (v - a4 > T && v - b4 > T)) cL[x]++;
        a = L[p - 2 * W]; b = L[p + 2 * W]; a4 = L[p - 4 * W]; b4 = L[p + 4 * W];
        if ((a - v > T && b - v > T) || (a4 - v > T && b4 - v > T)) rD[y]++;
        else if ((v - a > T && v - b > T) || (v - a4 > T && v - b4 > T)) rL[y]++;
      }
    }
    for (let x = 0; x < W; x++) { cD[x] /= H; cL[x] /= H; cM[x] /= H; }
    for (let y = 0; y < H; y++) { rD[y] /= W; rL[y] /= W; rM[y] /= W; }
    return { cD, cL, rD, rL, cM, rM };
  }

  const smooth = (p) => Array.from(p, (v, i) => v + 0.5 * ((p[i - 1] || 0) + (p[i + 1] || 0)));
  const mean = (p) => p.reduce((a, b) => a + b, 0) / p.length;

  /** Median, without sorting the caller's array. */
  function median(arr) {
    const a = Float64Array.from(arr).sort();
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  /**
   * Best offset for one spacing, and how line-like those columns are: the MEDIAN column at
   * that spacing compared with the median column overall. Using the median means a few very
   * strong but unrelated lines (a map frame, a long wall) can't fake a grid; a real grid is
   * line-like at nearly every step.
   */
  function comb(s, n, per, offStep, base) {
    let best = { off: 0, ratio: 0 };
    const vals = [];
    for (let off = 0; off < per; off += offStep) {
      vals.length = 0;
      for (let x = off; x < n - 0.5; x += per) vals.push(s[Math.round(x)]);
      if (vals.length < 6) continue; // need at least 6 lines across the image
      const ratio = median(vals) / base;
      if (ratio > best.ratio) best = { off, ratio };
    }
    return best;
  }

  /** Spacing for one axis and one polarity. */
  function axis(p, n, minSq, maxSq, lum, dark, force) {
    const s = smooth(p);
    const avg = median(s) || mean(s) || 1e-9;
    const hi = Math.min(maxSq, Math.floor(n / 6));
    const scores = [];
    if (force) scores.push({ per: Math.round(force), ...comb(s, n, Math.round(force), 1, avg) });
    else for (let per = minSq; per <= hi; per++) scores.push({ per, ...comb(s, n, per, 1, avg) });
    if (!scores.length) return null;
    const top = scores.reduce((a, b) => (b.ratio > a.ratio ? b : a));
    // Multiples of the true spacing score about as well (they hit a subset of the same lines);
    // take the smallest spacing that scores nearly as well as the best one.
    // Multiples of the true spacing score about as well (they hit a subset of the same lines), so
    // prefer the smallest spacing that scores nearly as well as the best one — but only if both its
    // odd and its even lines are real (otherwise half the true spacing can sneak in).
    const alternating = (c) => {
      const even = [], odd = [];
      let k = 0;
      for (let x = c.off; x < n - 0.5; x += c.per, k++) (k % 2 ? odd : even).push(s[Math.round(x)]);
      if (even.length < 3 || odd.length < 3) return false;
      const e = median(even) / avg, o = median(odd) / avg;
      return Math.min(e, o) >= Math.max(e, o) * 0.65;
    };
    const fundamental = scores.find((c) => {
      if (c.ratio < top.ratio * 0.9) return false;
      const m = top.per / c.per;
      return Math.abs(m - Math.round(m)) < 0.05 && (c.per === top.per || alternating(c));
    }) || top;
    // refine to 0.02 px spacing and 0.25 px offset
    let best = { per: fundamental.per, off: fundamental.off, ratio: fundamental.ratio };
    for (let per = fundamental.per - 1; per <= fundamental.per + 1 + 1e-9; per += 0.02) {
      const c = comb(s, n, per, 0.25, avg);
      if (c.ratio > best.ratio) best = { per, off: c.off, ratio: c.ratio };
    }
    // Line centre and width: fold the average brightness of each column by the spacing; the grid
    // line is the darkest (or lightest) part of the fold. Bins are centred on the comb offset.
    const bins = Math.max(8, Math.round(best.per * 2)); // half-pixel bins
    const fold = new Float64Array(bins), cnt = new Float64Array(bins);
    for (let i = 4; i < n - 4; i++) {
      const rel = ((((i - best.off) % best.per) + best.per * 1.5) % best.per) / best.per; // 0.5 = on the comb line
      const b = Math.min(bins - 1, Math.floor(rel * bins));
      fold[b] += lum[i]; cnt[b]++;
    }
    for (let b = 0; b < bins; b++) fold[b] /= cnt[b] || 1;
    const sign = dark ? -1 : 1;
    const base = median(fold);
    const contrast = Array.from(fold, (v) => Math.max(0, sign * (v - base)));
    // look within ±15% of a square around the comb line for the line itself
    const half = Math.max(8, Math.round(bins * 0.08)); // ±4 px or ±8% of a square
    const lo = Math.max(0, Math.floor(bins / 2) - half), hiB = Math.min(bins - 1, Math.floor(bins / 2) + half);
    let peakB = lo; for (let b = lo; b <= hiB; b++) if (contrast[b] > contrast[peakB]) peakB = b;
    const peakV = contrast[peakB];
    let wsum = 0, wpos = 0, width = 0;
    for (let b = lo; b <= hiB; b++) {
      if (contrast[b] >= peakV * 0.5) { width++; wsum += contrast[b]; wpos += contrast[b] * (b + 0.5); }
    }
    const rel = wsum ? wpos / wsum / bins : 0.5;
    const centre = best.off + (rel - 0.5) * best.per;
    const offset = ((centre % best.per) + best.per) % best.per;
    return { spacing: +best.per.toFixed(2), offset: +offset.toFixed(1), ratio: +best.ratio.toFixed(2), lineWidth: Math.max(1, Math.round(width * best.per / bins)), contrast: +peakV.toFixed(1) };
  }

  function AVTT_detectGrid(img, { minSquare = 20, maxSquare = 400 } = {}) {
    const { width: W, height: H, data } = img;
    const L = luminance(data, W * H);
    const P = profiles(L, W, H);
    const pick = (dark, light, lum) => {
      const d = axis(dark, dark.length, minSquare, maxSquare, lum, true), l = axis(light, light.length, minSquare, maxSquare, lum, false);
      if (!d) return l && { ...l, lines: "light" };
      if (!l) return { ...d, lines: "dark" };
      return d.ratio >= l.ratio ? { ...d, lines: "dark" } : { ...l, lines: "light" };
    };
    let x = pick(P.cD, P.cL, P.cM), y = pick(P.rD, P.rL, P.rM);
    // Grid lines hidden under furniture can make one direction look like 2× the real spacing.
    // If one spacing is a whole multiple of the other, try the smaller one in that direction too.
    if (x && y) {
      const [small, big] = x.spacing <= y.spacing ? ["x", "y"] : ["y", "x"];
      const sm = small === "x" ? x : y, bg = small === "x" ? y : x;
      const k = bg.spacing / sm.spacing;
      if (k > 1.5 && Math.abs(k - Math.round(k)) < 0.05) {
        const dark = bg.lines === "dark";
        const P2 = big === "x" ? [dark ? P.cD : P.cL, P.cM] : [dark ? P.rD : P.rL, P.rM];
        const retry = axis(P2[0], P2[0].length, minSquare, maxSquare, P2[1], dark, sm.spacing);
        if (retry && retry.ratio >= 1.3) {
          const fixed = { ...retry, lines: bg.lines };
          if (big === "x") x = fixed; else y = fixed;
        }
      }
    }
    if (!x || !y) return { width: W, height: H, verdict: "none", reason: "The image is too small to look for a grid." };
    const agree = Math.abs(x.spacing - y.spacing) <= Math.max(1.5, 0.03 * Math.max(x.spacing, y.spacing));
    const strong = Math.min(x.ratio, y.ratio);
    let verdict, confidence;
    if (agree && strong >= 1.45) { verdict = "grid"; confidence = strong >= 1.9 ? "high" : "medium"; }
    else if (agree && strong >= 1.15) { verdict = "pattern"; confidence = "low"; }
    else { verdict = "none"; confidence = "none"; }
    const square = agree ? +(((x.spacing + y.spacing) / 2)).toFixed(2) : undefined;
    return {
      width: W, height: H, verdict, confidence,
      squarePx: square, squaresAcross: square ? +(W / square).toFixed(1) : undefined, squaresDown: square ? +(H / square).toFixed(1) : undefined,
      x, y,
    };
  }

  root.AVTT_detectGrid = AVTT_detectGrid;
})(typeof self !== "undefined" ? self : globalThis);
