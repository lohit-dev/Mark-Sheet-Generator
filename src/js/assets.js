/**
 * assets.js — Artwork registry for CNR Marks Sheet Generator
 *
 * Defines window.ART, mapping every data-art="…" key used in
 * index.html to an object with a resolved `src` string.
 *
 * SVGs are used as the primary format: they scale perfectly for
 * both the live preview and high-resolution PNG / PDF exports.
 *
 * Layout
 * ──────
 * public/assets/svg/
 *   flower-tl.svg        top-left corner cluster
 *   flower-tr.svg        top-right corner cluster
 *   flower-bl.svg        bottom-left corner cluster
 *   flower-br.svg        bottom-right corner cluster
 *   flower-garland.svg   full-width horizontal divider (spare)
 *   ribbon.svg           curved title ribbon
 *   label-pink.svg       small pink scalloped label (average)
 *   label-yellow.svg     small yellow scalloped label (total)
 *   label-pink-large.svg    large variant (future use)
 *   label-yellow-large.svg  large variant (future use)
 */
(function () {
  var base = "assets/svg/";

  function art(file) {
    var el = new Image();
    el.src = base + file;
    return { src: el.src, el: el };
  }

  window.ART = {
    flowerTL:         art("flower-tl.svg"),
    flowerTR:         art("flower-tr.svg"),
    flowerBL:         art("flower-bl.svg"),
    flowerBR:         art("flower-br.svg"),
    flowerGarland:    art("flower-garland.svg"),
    ribbon:           art("ribbon.svg"),
    labelPinkL:       art("label-pink.svg"),
    labelYellowL:     art("label-yellow.svg"),
    labelPinkLarge:   art("label-pink-large.svg"),
    labelYellowLarge: art("label-yellow-large.svg"),
  };
}());
