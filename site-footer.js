/* One footer for every page. Snapshot link is relative to the current folder. */
(function () {
  var path = location.pathname.replace(/\/index\.html$/, "/");
  var nested = /\/(justice|treasury|vote|clock)(\/|$)/.test(path);
  var voteHref = nested && !/\/vote(\/|$)/.test(path) ? "../vote/" : nested ? "./" : "./vote/";
  var html =
    '<footer class="site-footer">' +
      '<div class="container">' +
        '<p>© 2026 Assange DAO</p>' +
        '<div class="site-footer-links">' +
          '<a href="https://x.com/AssangeDAO">X</a>' +
          '<a href="https://discord.com/invite/9h6rsvGWNn">Discord</a>' +
          '<a href="https://t.me/Real_AssangeDAO" target="_blank" rel="noopener">Telegram</a>' +
          '<a href="https://forum.assangedao.org/">Forum</a>' +
          '<a href="https://assangedao.substack.com/">Substack</a>' +
          '<a href="' + voteHref + '">Snapshot</a>' +
        '</div>' +
      '</div>' +
    '</footer>';
  document.querySelectorAll("footer, .footer").forEach(function (el) { el.remove(); });
  document.body.insertAdjacentHTML("beforeend", html);
})();
