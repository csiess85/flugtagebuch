/* Nur für Seiten ohne Filterleiste (Impressum). ui.js macht dasselbe und noch
 * viel mehr, greift dort aber auf #q und #cnt zu, die es hier nicht gibt.
 * Beide werden nie gemeinsam geladen. */
(function () {
  var r = document.documentElement, tb = document.getElementById('theme');
  var st = localStorage.getItem('ft-theme');
  if (st) r.setAttribute('data-theme', st);
  if (!tb) return;
  tb.onclick = function () {
    var cur = r.getAttribute('data-theme');
    if (!cur) cur = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
    var nx = cur === 'dark' ? 'light' : 'dark';
    r.setAttribute('data-theme', nx);
    localStorage.setItem('ft-theme', nx);
  };
})();
