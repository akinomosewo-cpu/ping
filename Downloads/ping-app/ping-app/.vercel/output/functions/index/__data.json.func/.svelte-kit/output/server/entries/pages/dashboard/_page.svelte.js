import { h as head, e as escape_html, a as attr_class, b as ensure_array_like, c as stringify, d as attr } from "../../../chunks/root.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/state.svelte.js";
import "clsx";
const userAuth = {
  role: "resident"
};
const alertStore = {
  alerts: [],
  unreadCount: 0
};
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let activeTab = "alerts";
    let sosState = "idle";
    let meshStatus = "offline";
    function timeAgo(ts) {
      const diff = Date.now() - ts;
      if (diff < 6e4) return "just now";
      if (diff < 36e5) return `${Math.floor(diff / 6e4)}m ago`;
      return `${Math.floor(diff / 36e5)}h ago`;
    }
    head("x1i5gj", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>P.I.N.G. – Dashboard</title>`);
      });
    });
    $$renderer2.push(`<div class="app svelte-x1i5gj"><header class="topbar svelte-x1i5gj"><div class="topbar-left svelte-x1i5gj"><div class="ping-logo svelte-x1i5gj">P.I.N.G.</div> <div class="village-info svelte-x1i5gj"><span class="village-name svelte-x1i5gj">${escape_html("Unknown")}</span> <span class="user-role svelte-x1i5gj">${escape_html(userAuth.role)}</span></div></div> <div class="topbar-right svelte-x1i5gj"><div${attr_class(`mesh-badge ${stringify(meshStatus)}`, "svelte-x1i5gj")}><span class="mesh-dot svelte-x1i5gj"></span> <span class="svelte-x1i5gj">${escape_html("No Mesh")}</span></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <button class="icon-btn svelte-x1i5gj" title="Logout">⏻</button></div></header> <section class="sos-section svelte-x1i5gj"><div${attr_class(`sos-ring ${stringify(sosState)}`, "svelte-x1i5gj")}>`);
    {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<button class="sos-btn svelte-x1i5gj"><span class="sos-icon svelte-x1i5gj">🚨</span> <span class="sos-label svelte-x1i5gj">HOLD TO SOS</span></button>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<p class="location-tag no-loc svelte-x1i5gj">📍 Location unavailable</p>`);
    }
    $$renderer2.push(`<!--]--></section> <nav class="tabs svelte-x1i5gj"><!--[-->`);
    const each_array = ensure_array_like([
      { id: "alerts", label: "Alerts", icon: "🔔" },
      { id: "mesh", label: "Mesh", icon: "📡" },
      { id: "chat", label: "Chat", icon: "💬" },
      { id: "settings", label: "Settings", icon: "⚙️" }
    ]);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let tab = each_array[$$index];
      $$renderer2.push(`<button${attr_class(`tab-btn ${stringify(activeTab === tab.id ? "active" : "")}`, "svelte-x1i5gj")}><span class="svelte-x1i5gj">${escape_html(tab.icon)}</span> <span class="svelte-x1i5gj">${escape_html(tab.label)}</span> `);
      if (tab.id === "alerts" && alertStore.unreadCount > 0) ;
      else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></button>`);
    }
    $$renderer2.push(`<!--]--></nav> <main class="tab-content svelte-x1i5gj">`);
    {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="alerts-panel svelte-x1i5gj"><div class="panel-header svelte-x1i5gj"><h2 class="svelte-x1i5gj">Community Alerts</h2> `);
      if (alertStore.alerts.length > 0) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<button class="small-btn svelte-x1i5gj">Clear All</button>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div> `);
      if (alertStore.alerts.length === 0) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="empty-state svelte-x1i5gj"><span class="svelte-x1i5gj">🟢</span> <p class="svelte-x1i5gj">All clear. No active alerts.</p></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="alert-list svelte-x1i5gj"><!--[-->`);
        const each_array_1 = ensure_array_like(alertStore.alerts);
        for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
          let alert = each_array_1[$$index_1];
          $$renderer2.push(`<div${attr_class(`alert-item ${stringify(alert.type)} ${stringify(alert.read ? "read" : "unread")}`, "svelte-x1i5gj")}><div class="alert-header svelte-x1i5gj"><span${attr_class(`alert-type-badge ${stringify(alert.type)}`, "svelte-x1i5gj")}>${escape_html(alert.type)}</span> <span class="alert-from svelte-x1i5gj">${escape_html(alert.from)}</span> <span class="alert-time svelte-x1i5gj">${escape_html(timeAgo(alert.ts))}</span></div> <p class="alert-msg svelte-x1i5gj">${escape_html(alert.msg)}</p> `);
          if (alert.lat && alert.lng) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<a class="alert-coords svelte-x1i5gj"${attr("href", `https://maps.google.com/?q=${stringify(alert.lat)},${stringify(alert.lng)}`)} target="_blank" rel="noopener">📍 ${escape_html(alert.lat.toFixed(4))}, ${escape_html(alert.lng.toFixed(4))} →</a>`);
          } else {
            $$renderer2.push("<!--[-1-->");
          }
          $$renderer2.push(`<!--]--></div>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></main></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
