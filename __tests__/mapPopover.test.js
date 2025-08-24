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
  // mouseleave does not bubble in the browser; keep bubbles: false so wrap's
  // 'mouseleave' handler doesn't fire and close immediately
  t1.dispatchEvent(new Event('mouseleave', { bubbles: false }));
  jest.advanceTimersByTime(180);
  expect(pop.getAttribute('aria-hidden')).toBe('true');
});

test('hover-open persists when moving to popover, then closes after leaving popover', () => {
  const { t1, pop } = getEls();

  // Open by hover
  t1.dispatchEvent(new Event('mouseenter', { bubbles: true }));
  expect(pop.getAttribute('aria-hidden')).toBe('false');

  // Mouse leaves target but immediately moves focus into popover (jsdom-friendly)
  t1.dispatchEvent(new Event('mouseleave', { bubbles: false }));
  // Immediately after leaving target, it should still be open (grace timer not elapsed)
  expect(pop.getAttribute('aria-hidden')).toBe('false');
  // Advance less than grace to ensure it hasn't closed yet
  jest.advanceTimersByTime(100);
  expect(pop.getAttribute('aria-hidden')).toBe('false');
  // Simulate pointer moving into the popover to clear the grace timer reliably
  pop.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  pop.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  pop.dispatchEvent(new Event('focusin', { bubbles: true }));
  // Advance beyond grace; should remain open because timer was cleared on enter
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

test('popover positions near its target (centered with correct vertical gap)', () => {
  const { wrap, t1, pop } = getEls();

  // Mock geometry so placement math in app.js has deterministic values
  const wrapRect = { left: 100, top: 100, width: 400, height: 300, right: 500, bottom: 400 };
  const t1Rect = { left: 300, top: 260, width: 20, height: 20, right: 320, bottom: 280 };

  wrap.getBoundingClientRect = () => wrapRect;
  t1.getBoundingClientRect = () => t1Rect;

  // Mock popover size used by placement to compute offsets
  Object.defineProperty(pop, 'offsetWidth', { configurable: true, value: 200 });
  Object.defineProperty(pop, 'offsetHeight', { configurable: true, value: 100 });

  // Open by click to trigger placement
  t1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(pop.getAttribute('aria-hidden')).toBe('false');

  const left = parseFloat(pop.style.left || 'NaN');
  const top = parseFloat(pop.style.top || 'NaN');
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  const gap = 12; // from app.js

  // Horizontal centering tolerance (allow a few px rounding)
  const targetCenterX = t1Rect.left + (t1Rect.width / 2) - wrapRect.left;
  const popCenterX = left + (pw / 2);
  expect(Math.abs(popCenterX - targetCenterX)).toBeLessThanOrEqual(4);

  // Vertical spacing depends on placement top/bottom.
  // Visually, the arrow protrudes 6px from the box toward the target, so
  // the perceived gap is (gap - 6). Allow a tolerance for rounding.
  const placement = pop.dataset.placement;
  if (placement === 'top') {
    const popBottom = top + ph;
    const targetTopRel = t1Rect.top - wrapRect.top;
    const visualGap = targetTopRel - popBottom - 6; // subtract arrow overlap
    expect(visualGap).toBeGreaterThanOrEqual(2);
    expect(visualGap).toBeLessThanOrEqual(14);
  } else if (placement === 'bottom') {
    const targetBottomRel = t1Rect.bottom - wrapRect.top;
    const visualGap = top - targetBottomRel - 6; // subtract arrow overlap
    expect(visualGap).toBeGreaterThanOrEqual(2);
    expect(visualGap).toBeLessThanOrEqual(14);
  } else {
    throw new Error('popover did not set placement');
  }
});
