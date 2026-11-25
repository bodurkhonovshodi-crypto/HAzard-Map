// ============================================================
//  PAST DISASTERS PAGE
// ============================================================

DATA_READY.then(() => {
  initSites();
  const events = [...EVENTS].sort((a, b) => a.date.localeCompare(b.date));
  const { map } = makeMap("evmap", { wheel: false });
  const pins = new Map();
  const shown = new Set(events.map(e => e.type));

  // ---- map ----
  events.forEach((e, i) => {
    const color = HAZARD_COLORS[e.type] || "#555";
    const group = L.layerGroup();
    if (e.approx) L.circle([e.lat, e.lon], { radius: (e.approxRadius_km || 10) * 1000, color, weight: 1.5, dashArray: "5 5", fillOpacity: 0.06 }).addTo(group);
    L.marker([e.lat, e.lon], { title: e.title,
      icon: L.divIcon({ className: "ev-icon", iconSize: null, html: `<span style="background:${color}">${e.ongoing ? "•" : e.date.slice(2, 4)}</span>` }) })
      .bindTooltip(`${e.dateText}: ${e.title}`, { direction: "top", offset: [0, -14] })
      .on("click", () => focus(e.id))
      .addTo(group);
    group.addTo(map);
    pins.set(e.id, group);
  });
  const b = L.latLngBounds(events.map(e => [e.lat, e.lon]));
  if (b.isValid()) map.fitBounds(b.pad(0.25));

  // ---- filters ----
  const types = [...new Set(events.map(e => e.type))];
  $("filters").innerHTML = types.map(t => `<button type="button" class="preset" aria-pressed="true" data-t="${t}">
    <i class="sw" style="background:${HAZARD_COLORS[t] || "#555"}"></i>${esc(HAZARD_NAMES[t] || t)}</button>`).join("");
  $("filters").addEventListener("click", ev => {
    const btn = ev.target.closest("button"); if (!btn) return;
    const t = btn.dataset.t;
    if (shown.has(t)) shown.delete(t); else shown.add(t);
    btn.setAttribute("aria-pressed", shown.has(t));
    render();
  });

  // ---- cards ----
  function card(e) {
    const color = HAZARD_COLORS[e.type] || "#555";
    const [main, ...more] = e.photos || [];
    return `<article class="event${main ? "" : " no-photo"}" id="ev-${e.id}">
      ${main ? `<figure><img src="${esc(main[0])}" alt="${esc(main[1])}" loading="lazy" data-cap="${esc(main[1])}"><figcaption>${esc(main[1])}</figcaption></figure>` : ""}
      <div class="body">
        <div class="when"><span class="type" style="background:${color}">${esc(HAZARD_NAMES[e.type] || e.type)}</span>${esc(e.dateText)}</div>
        <h2>${esc(e.title)}</h2>
        <p class="hint">${esc(e.place)}${e.approx ? " · position approximate" : ""} · <b>Cause:</b> ${esc(e.trigger)}</p>
        <div class="facts">${(e.facts || []).map(([v, l]) => `<div class="fact"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}</div>
        <p>${esc(e.story)}</p>
        ${more.length ? `<div class="gallery">${more.map(([src, cap]) => `<img src="${esc(src)}" alt="${esc(cap)}" data-cap="${esc(cap)}" loading="lazy">`).join("")}</div>` : ""}
        ${e.note ? `<p class="lostnote">${esc(e.note)}</p>` : ""}
        <div class="row-between">
          <ol class="sources">${(e.sources || []).map(([t, u]) => `<li>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t)}</li>`).join("")}</ol>
          <button type="button" class="small" data-show="${e.id}">Show on map</button>
        </div>
      </div>
    </article>`;
  }

  function render() {
    const list = events.filter(e => shown.has(e.type));
    $("timeline").innerHTML = list.map(card).join("") || '<p class="empty">No disasters of these types.</p>';
    $("evcount").textContent = `${list.length} of ${events.length} shown`;
    for (const e of events) {
      const g = pins.get(e.id);
      if (shown.has(e.type)) g.addTo(map); else map.removeLayer(g);
    }
  }

  function focus(id) {
    const el = $("ev-" + id);
    if (!el) return;
    document.querySelectorAll(".event.focus").forEach(x => x.classList.remove("focus"));
    el.classList.add("focus");
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("timeline").addEventListener("click", ev => {
    const show = ev.target.closest("[data-show]");
    if (show) {
      const e = events.find(x => x.id === show.dataset.show);
      map.setView([e.lat, e.lon], e.approx ? 9 : 11);
      $("evmap").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const img = ev.target.closest("img[data-cap]");
    if (img) {
      $("lbImg").src = img.src; $("lbImg").alt = img.alt; $("lbCap").textContent = img.dataset.cap;
      $("lightbox").hidden = false;
    }
  });
  $("lightbox").addEventListener("click", () => $("lightbox").hidden = true);
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") $("lightbox").hidden = true; });

  render();
});
