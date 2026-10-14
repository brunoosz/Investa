// Aplica o tema salvo antes do primeiro desenho, para a abertura não piscar.
try {
  var t = localStorage.getItem("investa-theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch (e) {}
