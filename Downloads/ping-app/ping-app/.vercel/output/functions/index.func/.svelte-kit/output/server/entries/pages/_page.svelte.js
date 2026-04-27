import { h as head, e as escape_html, a as attr_class } from "../../chunks/root.js";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/state.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let display = "0";
    let expression = "";
    let operator = null;
    let acFlash = false;
    head("1uha8ag", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Calculator</title>`);
      });
    });
    $$renderer2.push(`<main class="calc-bg svelte-1uha8ag"><div class="calc svelte-1uha8ag"><div class="display svelte-1uha8ag"><span class="expr-line svelte-1uha8ag">${escape_html(expression)}</span> <div class="value-row svelte-1uha8ag"><span${attr_class("value svelte-1uha8ag", void 0, { "shrink": display.length > 9 })}>${escape_html(display)}</span> <button class="back-btn svelte-1uha8ag" aria-label="Backspace"><svg width="22" height="16" viewBox="0 0 22 16" fill="none" class="svelte-1uha8ag"><path d="M8 1L1 8l7 7M1 8h20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="svelte-1uha8ag"></path><path d="M10 4h8a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-8L7 8l3-4z" fill="currentColor" opacity="0.15" class="svelte-1uha8ag"></path></svg></button></div></div> <div class="keypad svelte-1uha8ag"><button${attr_class("key fn secret svelte-1uha8ag", void 0, { "triggered": acFlash })} style="grid-column: span 2">AC</button> <button class="key fn svelte-1uha8ag">%</button> <button${attr_class("key op svelte-1uha8ag", void 0, { "active": operator === "÷" })}>÷</button> <button class="key num svelte-1uha8ag">7</button> <button class="key num svelte-1uha8ag">8</button> <button class="key num svelte-1uha8ag">9</button> <button${attr_class("key op svelte-1uha8ag", void 0, { "active": operator === "×" })}>×</button> <button class="key num svelte-1uha8ag">4</button> <button class="key num svelte-1uha8ag">5</button> <button class="key num svelte-1uha8ag">6</button> <button${attr_class("key op svelte-1uha8ag", void 0, { "active": operator === "−" })}>−</button> <button class="key num svelte-1uha8ag">1</button> <button class="key num svelte-1uha8ag">2</button> <button class="key num svelte-1uha8ag">3</button> <button${attr_class("key op svelte-1uha8ag", void 0, { "active": operator === "+" })}>+</button> <button class="key num zero svelte-1uha8ag">0</button> <button class="key num svelte-1uha8ag">.</button> <button class="key op svelte-1uha8ag">=</button></div></div></main> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
