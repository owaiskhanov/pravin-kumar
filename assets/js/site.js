/* Pravin Kumar & Co — proposal site behaviour
   Splash intro, scroll reset, accessible dropdowns, reveal-on-scroll. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* Keep the browser from restoring a previous scroll position: the landing
     view must always start at the top. */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  function toTop() {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  /* ---------------- Splash intro ---------------- */
  var splash = document.getElementById("splash");
  var skip = document.getElementById("skip-intro");
  var splashTimer = null;
  var splashDone = false;

  function pageRegions() {
    return [
      document.querySelector(".site-header"),
      document.getElementById("main"),
      document.querySelector(".site-footer"),
    ].filter(Boolean);
  }

  function setPageInert(on) {
    pageRegions().forEach(function (el) {
      if (on) {
        el.setAttribute("inert", "");
        el.setAttribute("aria-hidden", "true");
      } else {
        el.removeAttribute("inert");
        el.removeAttribute("aria-hidden");
      }
    });
  }

  function unlockScroll() {
    document.body.classList.remove("is-locked");
    setPageInert(false);
  }

  setPageInert(!!splash);

  function removeSplash() {
    if (splashDone) return;
    splashDone = true;
    if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
    unlockScroll();
    toTop();
    document.dispatchEvent(new CustomEvent("splash:done"));
  }

  function closeSplash() {
    if (!splash || splashDone) return;
    window.clearTimeout(splashTimer);
    toTop();
    splash.classList.add("is-leaving");
    var wait = reduceMotion.matches ? 0 : 760;
    window.setTimeout(function () {
      removeSplash();
      var main = document.getElementById("main");
      if (main) {
        main.setAttribute("tabindex", "-1");
        main.focus({ preventScroll: true });
      }
    }, wait);
  }

  if (splash) {
    // Body starts locked so nothing scrolls behind the splash; unlock if it is
    // removed for any reason without the JS path running.
    splashTimer = window.setTimeout(closeSplash, reduceMotion.matches ? 700 : 2100);
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !splashDone) {
        e.preventDefault();
        closeSplash();
      }
    });
    if (skip) skip.addEventListener("click", closeSplash);
    splash.addEventListener("click", function (e) {
      if (e.target === splash) closeSplash();
    });
  } else {
    unlockScroll();
    toTop();
  }

  /* ---------------- Scroll reset on load ---------------- */
  toTop();
  window.addEventListener("load", toTop, { once: true });
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) toTop();
  });

  /* ---------------- Dropdowns (disclosure pattern) ---------------- */
  function initAccordion(root) {
    var triggers = Array.prototype.slice.call(root.querySelectorAll(".acc__trigger"));

    function setOpen(trigger, open) {
      var item = trigger.closest(".acc__item");
      var panel = document.getElementById(trigger.getAttribute("aria-controls"));
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      item.classList.toggle("is-open", open);
      if (panel) {
        // animate with grid-template-rows; never display:none (keeps it measurable)
        panel.setAttribute("data-open", open ? "true" : "false");
        panel.setAttribute("aria-hidden", open ? "false" : "true");
        if (open) panel.removeAttribute("inert");
        else panel.setAttribute("inert", "");
      }
    }

    triggers.forEach(function (trigger, i) {
      setOpen(trigger, trigger.getAttribute("aria-expanded") === "true");

      trigger.addEventListener("click", function () {
        setOpen(trigger, trigger.getAttribute("aria-expanded") !== "true");
      });

      trigger.addEventListener("keydown", function (e) {
        var k = e.key;
        if (k === "ArrowDown" || k === "ArrowUp" || k === "Home" || k === "End") {
          e.preventDefault();
          var next = i;
          if (k === "ArrowDown") next = (i + 1) % triggers.length;
          if (k === "ArrowUp") next = (i - 1 + triggers.length) % triggers.length;
          if (k === "Home") next = 0;
          if (k === "End") next = triggers.length - 1;
          triggers[next].focus();
        } else if (k === "Escape") {
          if (trigger.getAttribute("aria-expanded") === "true") {
            e.preventDefault();
            setOpen(trigger, false);
          }
        }
      });
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-accordion]"), initAccordion);

  /* ---------------- Reveal on scroll ---------------- */
  var revealables = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    revealables.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ---------------- Print: render every dropdown expanded ---------------- */
  /* The @media print rules expand all panels visually; this mirrors the state
     for assistive tech and for browsers that snapshot the DOM before printing. */
  var printState = null;
  window.addEventListener("beforeprint", function () {
    printState = Array.prototype.map.call(
      document.querySelectorAll(".acc__trigger"),
      function (t) {
        return {
          trigger: t,
          expanded: t.getAttribute("aria-expanded") === "true",
          panel: document.getElementById(t.getAttribute("aria-controls")),
        };
      }
    );
    printState.forEach(function (s) {
      if (s.panel) {
        s.panel.setAttribute("aria-hidden", "false");
        s.panel.removeAttribute("inert");
      }
    });
  });
  window.addEventListener("afterprint", function () {
    (printState || []).forEach(function (s) {
      if (s.panel && !s.expanded) {
        s.panel.setAttribute("aria-hidden", "true");
        s.panel.setAttribute("inert", "");
      }
    });
    printState = null;
  });
})();
