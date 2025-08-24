/**
 * @jest-environment jsdom
 */

// Minimal DOM fixture for the map + popover
function buildDOM() {
  document.body.innerHTML = `
    <main>
      <section id="dashboard" class="screen"></section>
      <section id="manifesto" class="screen"></section>
      <section id="map" class="screen">
        <div class="map-wrap">
          <img class="map-image" src="assets/map-area.png" alt="" />
          <div class="targets">
            <button class="target" id="t1" style="--x:50%; --y:50%;" aria-label="Sheriff Callahan" data-title="Sheriff Callahan" data-address="325 Colton Rd" data-work="County Sheriff" data-notes="Keeps irregular hours.">
              <span class="dot" aria-hidden="true"></span>
            </button>
            <button class="target" id="t2" style="--x:60%; --y:50%;" aria-label="Mayor O’Connell" data-title="Mayor O’Connell" data-address="3540 Maple Ave" data-work="City Hall" data-notes="Security detail Mon–Fri.">
              <span class="dot" aria-hidden="true"></span>
            </button>
          </div>
          <div class="hud reticle" aria-hidden="true"></div>
          <div id="popover" class="popover" role="dialog" aria-modal="false" aria-hidden="true">
            <div class="popover__arrow" aria-hidden="true"></div>
            <div class="popover__header" id="popover-title"></div>
            <div class="popover__body" id="popover-body"></div>
          </div>
        </div>
      </section>
      <section id="messages" class="screen"></section>
      <nav class="bottom-nav"><a class="navbtn" data-nav="dashboard"></a><a class="navbtn" data-nav="map"></a><a class="navbtn" data-nav="messages"></a></nav>
    </main>
  `;
}

// Stub lucide to avoid errors when icons are created
beforeAll(() => {
  global.window.lucide = { createIcons: () => {} };
});

beforeEach(() => {
  jest.useFakeTimers();
  buildDOM();
  // Load app (IIFE will attach DOMContentLoaded listener); then dispatch it
  jest.isolateModules(() => {
    require('../castle-app/js/app.js');
  });
  document.dispatchEvent(new Event('DOMContentLoaded'));
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

function getEls() {
  return {
    wrap: document.querySelector('.map-wrap'),
    pop: document.getElementById('popover'),
    t1: document.getElementById('t1'),
    t2: document.getElementById('t2'),
    body: document.getElementById('popover-body'),
  };
}

test('hover-open closes when leaving both target and popover (with grace)', () => {
  const { t1, pop } = getEls();

  // Hover open
  t1.dispatchEvent(new Event('mouseenter', { bubbles: true }));
  expect(pop.getAttribute('aria-hidden')).toBe('false');

  // Leave to empty space (not into popover), wait > grace
  t1.dispatchEvent(new Event('mouseleave', { bubbles: true }));
  jest.advanceTimersByTime(160);
  expect(pop.getAttribute('aria-hidden')).toBe('true');
});

test('hover-open persists when moving to popover, then closes after leaving popover', () => {
  const { t1, pop } = getEls();

  // Open by hover
  t1.dispatchEvent(new Event('mouseenter', { bubbles: true }));
  expect(pop.getAttribute('aria-hidden')).toBe('false');

  // Mouse leaves target but immediately moves focus into popover (jsdom-friendly)
  t1.dispatchEvent(new Event('mouseleave', { bubbles: true }));
  pop.dispatchEvent(new Event('focusin', { bubbles: true }));
  jest.advanceTimersByTime(200);
  expect(pop.getAttribute('aria-hidden')).toBe('false');

  // Now leave the popover; after grace, it should close
  pop.dispatchEvent(new Event('mouseleave', { bubbles: true }));
  jest.advanceTimersByTime(160);
  expect(pop.getAttribute('aria-hidden')).toBe('true');
});

test('click-open closes when clicking outside', () => {
  const { t1, pop } = getEls();

  // Click open
  t1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(pop.getAttribute('aria-hidden')).toBe('false');

  // Click outside map-wrap
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(pop.getAttribute('aria-hidden')).toBe('true');
});

test('popover rows render values without labels', () => {
  const { t1, body } = getEls();
  t1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const text = body.textContent;
  expect(text).toContain('325 Colton Rd');
  expect(text).toContain('County Sheriff');
  expect(text).toContain('Keeps irregular hours.');
  expect(text).not.toMatch(/Address:|Work:|Notes:/);
});
