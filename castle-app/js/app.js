/*
  The Castle — app.js
  Minimal router + effects. No external deps. Designed for on-set reliability.
  JSDoc included to clarify intent and configuration options.
*/
(function() {
  'use strict';

  /**
   * Parse query params once.
   * @type {URLSearchParams}
   */
  const qs = new URLSearchParams(location.search);

  /** @type {string|null} */
  const GMAPS_KEY = qs.get('gmap') || (typeof window.CASTLE_GMAPS_KEY === 'string' ? window.CASTLE_GMAPS_KEY : null);

  /** Default map view if not provided via query params */
  const DEFAULT_CENTER = (() => {
    const raw = qs.get('center');
    if (raw) {
      const [lat, lng] = raw.split(',').map(Number);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
    }
    return { lat: 43.6, lng: -116.2 }; // Boise area as a rugged default
  })();
  const DEFAULT_ZOOM = Number(qs.get('zoom')) || 11;
  /** Optional custom static map background */
  const MAP_IMG = qs.get('mapimg');

  /** Known screens in this SPA */
  const SCREENS = ['dashboard', 'manifesto', 'map', 'map2', 'messages'];

  /** Route to a screen by id. */
  function show(id) {
    SCREENS.forEach(s => {
      const el = document.getElementById(s === 'map' ? 'map' : s);
      if (!el) return;
      el.classList.toggle('active', s === id);
    });
    // sync selected nav button
    document.querySelectorAll('.bottom-nav .navbtn').forEach(a => a.classList.toggle('active', a.dataset.nav === id));

    if (id === 'map') { ensureMap(); applyMapImage(); }
    if (id === 'map2') { ensureMap2(); }
    if (id === 'messages') pulseUrgency();
  }

  /** Basic hash router */
  function route() {
    const h = (location.hash || '#dashboard').replace('#', '');
    show(SCREENS.includes(h) ? h : 'dashboard');
  }

  /** Clock: update every minute */
  function startClock() {
    const clock = document.getElementById('clock');
    if (!clock) return;
    const upd = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      clock.textContent = `${hh}:${mm}`;
    };
    upd();
    setInterval(upd, 15000);
  }

  /** Screenshot mode: hide status/nav */
  function setupShotMode() {
    if (qs.get('shot') === '1') document.body.classList.add('shot');
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 's' && (e.metaKey || e.shiftKey || e.altKey)) {
        document.body.classList.toggle('shot');
      }
    });
  }

  /** Animate urgency on last message */
  function pulseUrgency() {
    const last = document.querySelector('#messages .msg.urgent');
    if (!last) return;
    last.classList.remove('urgent');
    // force reflow
    void last.offsetWidth;
    last.classList.add('urgent');
  }

  /** Static map image mode: no dynamic initialization */
  let mapInitOnce = false;
  function ensureMap() {
    mapInitOnce = true;
  }

  /** Leaflet map for map2 */
  let leafletInitOnce = false;
  function ensureMap2() {
    if (leafletInitOnce) return;
    const container = document.getElementById('leaflet-map');
    if (!container || !window.L) return;
    const imgUrl = 'assets/map-area.png';

    // Load image to determine natural size and set simple CRS bounds
    const img = new Image();
    img.onload = function() {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const bounds = L.latLngBounds([[0, 0], [h, w]]);

      const map = L.map(container, {
        crs: L.CRS.Simple,
        minZoom: -2,
        maxZoom: 2,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        attributionControl: false,
        keyboard: true
      });
      L.imageOverlay(imgUrl, bounds, { interactive: true }).addTo(map);
      // Constrain panning to the image bounds
      map.setMaxBounds(bounds);
      map.options.maxBoundsViscosity = 1.0;
      // Start fitted, then zoom in ~1 level (~150% feel with CRS.Simple defaults)
      map.fitBounds(bounds);
      map.zoomIn(1);

      // Build markers from hidden target buttons within #map2
      // Ring-only target marker for better visibility over imagery
      const dotIcon = L.divIcon({
        className: 'marker-dot',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      const src = document.querySelector('#map2');
      src.querySelectorAll('.target').forEach((btn) => {
        const title = btn.dataset.title || btn.getAttribute('aria-label') || 'Info';
        const address = btn.dataset.address || '';
        const work = btn.dataset.work || '';
        const notes = btn.dataset.notes || '';
        const px = Number(btn.dataset.x); // percent x (0-100)
        const py = Number(btn.dataset.y); // percent y (0-100)
        if (Number.isNaN(px) || Number.isNaN(py)) return;
        const x = (px / 100) * w;
        const y = (py / 100) * h;

        const content = [
          `<div class="popover__header">${title}</div>`,
          `<div class="popover__body">`,
          address ? `<div class=\"popover__row\"><i data-lucide=\"home\" aria-hidden=\"true\"></i><span>${String(address)}</span></div>` : '',
          work ? `<div class=\"popover__row\"><i data-lucide=\"briefcase\" aria-hidden=\"true\"></i><span>${String(work)}</span></div>` : '',
          notes ? `<div class=\"popover__row\"><i data-lucide=\"sticky-note\" aria-hidden=\"true\"></i><span>${String(notes)}</span></div>` : '',
          `</div>`
        ].join('');

        const marker = L.marker([y, x], { keyboard: true, title, icon: dotIcon });
        
        // Store marker data for Floating UI popover
        marker._popoverData = { title, address, work, notes };
        
        // Add click handler for custom popover
        marker.on('click', function(e) {
          showFloatingPopover(this, this._popoverData);
        });
        
        marker.addTo(map);
      });

      // Global popover elements
      const popover = document.getElementById('map-popover');
      const popoverTitle = document.getElementById('map-popover-title');
      const popoverBody = document.getElementById('map-popover-body');
      const popoverArrow = popover.querySelector('.popover__arrow');
      let currentPopoverTarget = null;
      
      // Floating UI popover system
      function showFloatingPopover(marker, data) {
        // Get marker DOM element and map container
        const markerElement = marker._icon;
        const mapContainer = document.getElementById('leaflet-map');
        if (!markerElement || !mapContainer) return;
        
        // Populate popover content
        popoverTitle.textContent = data.title;
        const rows = [];
        if (data.address) rows.push(`<div class="popover__row"><i data-lucide="home" aria-hidden="true"></i><span>${data.address}</span></div>`);
        if (data.work) rows.push(`<div class="popover__row"><i data-lucide="briefcase" aria-hidden="true"></i><span>${data.work}</span></div>`);
        popoverBody.innerHTML = rows.join('');
        
        // Show popover and append to map container for proper positioning context
        popover.setAttribute('aria-hidden', 'false');
        if (popover.parentNode !== mapContainer) {
          mapContainer.appendChild(popover);
        }
        currentPopoverTarget = markerElement;
        
        // Get marker position relative to map container
        const mapRect = mapContainer.getBoundingClientRect();
        const markerRect = markerElement.getBoundingClientRect();
        
        // Calculate marker position within map container
        const markerX = markerRect.left - mapRect.left + (markerRect.width / 2);
        const markerY = markerRect.top - mapRect.top;
        
        // Position popover above marker with 24px gap
        const popoverRect = popover.getBoundingClientRect();
        const popoverX = markerX - (popoverRect.width / 2);
        const popoverY = markerY - popoverRect.height - 24;
        
        // Clamp to map boundaries
        const clampedX = Math.max(16, Math.min(popoverX, mapRect.width - popoverRect.width - 16));
        const clampedY = Math.max(16, Math.min(popoverY, mapRect.height - popoverRect.height - 16));
        
        // Position popover
        Object.assign(popover.style, {
          left: `${clampedX}px`,
          top: `${clampedY}px`
        });
        
        // Position arrow to point at marker center
        const arrowX = markerX - clampedX - 6; // 6px is half arrow width
        Object.assign(popoverArrow.style, {
          left: `${Math.max(6, Math.min(arrowX, popoverRect.width - 18))}px`,
          top: '',
          right: '',
          bottom: '-6px'
        });
        
        popover.dataset.placement = 'top';
        
        // Enhance Lucide icons
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      }
      
      // Hide popover when clicking outside
      document.addEventListener('click', (e) => {
        if (currentPopoverTarget && !popover.contains(e.target) && !currentPopoverTarget.contains(e.target)) {
          popover.setAttribute('aria-hidden', 'true');
          currentPopoverTarget = null;
        }
      });

      leafletInitOnce = true;
    };
    img.src = imgUrl;
  }

  /** Apply custom background image if provided */
  let mapImgApplied = false; // apply on first map show or when param present
  function applyMapImage() {
    if (mapImgApplied) return;
    if (!MAP_IMG) return;
    const img = document.querySelector('.map-image');
    if (!img) return;
    img.src = MAP_IMG;
    mapImgApplied = true;
  }

  /** Target popover logic for static map */
  function setupTargets() {
    const wrap = document.querySelector('.map-wrap');
    const pop = document.getElementById('popover');
    if (!wrap || !pop) return;
    const titleEl = document.getElementById('popover-title');
    const bodyEl = document.getElementById('popover-body');
    let openFor = null;
    let openMode = null; // 'hover' | 'click'
    let hoverOutTimer = null;
    let hoverInside = false; // true when pointer is over current target or popover

    function place(btn) {
      const wrapRect = wrap.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      
      // Make visible to read offsetHeight
      pop.style.visibility = 'hidden';
      pop.style.display = 'block';
      const pw = pop.offsetWidth;
      const ph = pop.offsetHeight;
      const gap = 12;
      const margin = 16; // minimum distance from viewport edges
      
      // Target center relative to wrap
      const targetCenterX = btnRect.left + (btnRect.width / 2) - wrapRect.left;
      const targetCenterY = btnRect.top + (btnRect.height / 2) - wrapRect.top;
      
      // Determine optimal placement based on available space
      const spaceAbove = targetCenterY - margin;
      const spaceBelow = wrapRect.height - targetCenterY - margin;
      const spaceLeft = targetCenterX - margin;
      const spaceRight = wrapRect.width - targetCenterX - margin;
      
      let placement, left, top, arrowLeft, arrowTop;
      
      // Try vertical placements first (top/bottom)
      if (spaceAbove >= ph + gap && spaceAbove >= spaceBelow) {
        // Place above
        placement = 'top';
        top = targetCenterY - ph - gap;
        left = Math.max(margin, Math.min(targetCenterX - pw / 2, wrapRect.width - pw - margin));
        arrowLeft = targetCenterX - left;
      } else if (spaceBelow >= ph + gap) {
        // Place below
        placement = 'bottom';
        top = targetCenterY + gap;
        left = Math.max(margin, Math.min(targetCenterX - pw / 2, wrapRect.width - pw - margin));
        arrowLeft = targetCenterX - left;
      } else if (spaceRight >= pw + gap) {
        // Place to the right
        placement = 'right';
        left = targetCenterX + gap;
        top = Math.max(margin, Math.min(targetCenterY - ph / 2, wrapRect.height - ph - margin));
        arrowTop = targetCenterY - top;
      } else if (spaceLeft >= pw + gap) {
        // Place to the left
        placement = 'left';
        left = targetCenterX - pw - gap;
        top = Math.max(margin, Math.min(targetCenterY - ph / 2, wrapRect.height - ph - margin));
        arrowTop = targetCenterY - top;
      } else {
        // Fallback: place below with best fit
        placement = 'bottom';
        top = Math.min(targetCenterY + gap, wrapRect.height - ph - margin);
        left = Math.max(margin, Math.min(targetCenterX - pw / 2, wrapRect.width - pw - margin));
        arrowLeft = targetCenterX - left;
      }
      
      // Pan viewport if popover would be clipped
      panToKeepInView(left, top, pw, ph, targetCenterX, targetCenterY);
      
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      pop.dataset.placement = placement;
      
      // Position arrow to point at target center
      const arrow = pop.querySelector('.popover__arrow');
      if (arrow) {
        if (placement === 'top' || placement === 'bottom') {
          arrow.style.left = `${Math.max(6, Math.min(arrowLeft - 6, pw - 18))}px`;
          arrow.style.top = '';
        } else {
          arrow.style.top = `${Math.max(6, Math.min(arrowTop - 6, ph - 18))}px`;
          arrow.style.left = '';
        }
      }
      
      pop.style.visibility = '';
    }

    function row(icon, value) {
      if (!value) return '';
      const safe = String(value);
      return `<div class="popover__row"><i data-lucide="${icon}" aria-hidden="true"></i><span>${safe}</span></div>`;
    }

    function open(btn, mode) {
      titleEl.textContent = btn.dataset.title || btn.getAttribute('aria-label') || 'Info';
      const address = btn.dataset.address;
      const work = btn.dataset.work;
      const notes = btn.dataset.notes;
      bodyEl.innerHTML = [
        row('home', address),
        row('briefcase', work),
        row('sticky-note', notes),
      ].join('');
      pop.setAttribute('aria-hidden', 'false');
      openFor = btn;
      openMode = mode || 'click';
      // Refresh Lucide icons inside popover BEFORE measuring, then place using
      // the final rendered size to avoid visual drift in vertical spacing.
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
      place(btn);
    }

    function panToKeepInView(popLeft, popTop, popWidth, popHeight, targetX, targetY) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const wrapRect = wrap.getBoundingClientRect();
      
      // Calculate popover bounds in viewport coordinates
      const popViewportLeft = wrapRect.left + popLeft;
      const popViewportTop = wrapRect.top + popTop;
      const popViewportRight = popViewportLeft + popWidth;
      const popViewportBottom = popViewportTop + popHeight;
      
      // Calculate target position in viewport coordinates
      const targetViewportX = wrapRect.left + targetX;
      const targetViewportY = wrapRect.top + targetY;
      
      let scrollX = 0;
      let scrollY = 0;
      const buffer = 20; // padding from viewport edges
      
      // Check horizontal overflow
      if (popViewportLeft < buffer) {
        scrollX = popViewportLeft - buffer;
      } else if (popViewportRight > viewportWidth - buffer) {
        scrollX = popViewportRight - viewportWidth + buffer;
      }
      
      // Check vertical overflow
      if (popViewportTop < buffer) {
        scrollY = popViewportTop - buffer;
      } else if (popViewportBottom > viewportHeight - buffer) {
        scrollY = popViewportBottom - viewportHeight + buffer;
      }
      
      // Also ensure target remains visible
      if (targetViewportX + scrollX < buffer) {
        scrollX = buffer - targetViewportX;
      } else if (targetViewportX + scrollX > viewportWidth - buffer) {
        scrollX = viewportWidth - buffer - targetViewportX;
      }
      
      if (targetViewportY + scrollY < buffer) {
        scrollY = buffer - targetViewportY;
      } else if (targetViewportY + scrollY > viewportHeight - buffer) {
        scrollY = viewportHeight - buffer - targetViewportY;
      }
      
      // Smooth scroll to keep both popover and target in view
      if (scrollX !== 0 || scrollY !== 0) {
        window.scrollBy({
          left: scrollX,
          top: scrollY,
          behavior: 'smooth'
        });
      }
    }
    
    function close() {
      pop.setAttribute('aria-hidden', 'true');
      openFor = null;
    }

    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.target');
      if (!btn) {
        // Click outside target and popover closes when opened by click
        if (!pop.contains(e.target) && openMode === 'click') close();
        return;
      }
      e.preventDefault();
      if (openFor === btn) close(); else open(btn, 'click');
    });

    // Hover open/close support
    const targets = wrap.querySelectorAll('.target');
    targets.forEach((btn) => {
      btn.addEventListener('mouseenter', () => { hoverInside = true; open(btn, 'hover'); });
      btn.addEventListener('pointerenter', () => { hoverInside = true; open(btn, 'hover'); });
      btn.addEventListener('mouseleave', () => {
        if (openMode !== 'hover' || openFor !== btn) return;
        // Start a short grace timer to allow pointer to reach the popover
        clearTimeout(hoverOutTimer);
        hoverInside = false;
        hoverOutTimer = setTimeout(() => { if (openMode === 'hover' && !hoverInside) close(); }, 140);
      });
      // Keyboard/focus support keeps it open
      btn.addEventListener('focusin', () => { if (openMode === 'hover') { hoverInside = true; clearTimeout(hoverOutTimer); } });
    });

    // Keep hover-open while pointer is over either the trigger or the popover; close otherwise with grace
    wrap.addEventListener('mousemove', (e) => {
      if (!openFor || openMode !== 'hover') return;
      const overTarget = !!e.target.closest('.target');
      const overSameTarget = overTarget && e.target.closest('.target') === openFor;
      const overPop = pop.contains(e.target);
      if (overSameTarget || overPop) {
        clearTimeout(hoverOutTimer);
      }
    });

    // Popover enter/leave for hover mode
    pop.addEventListener('mouseenter', () => { if (openMode === 'hover') { hoverInside = true; clearTimeout(hoverOutTimer); } });
    pop.addEventListener('pointerenter', () => { if (openMode === 'hover') { hoverInside = true; clearTimeout(hoverOutTimer); } });
    // Some environments dispatch mouseover more reliably than mouseenter
    pop.addEventListener('mouseover', () => { if (openMode === 'hover') { hoverInside = true; clearTimeout(hoverOutTimer); } });
    pop.addEventListener('pointerover', () => { if (openMode === 'hover') { hoverInside = true; clearTimeout(hoverOutTimer); } });
    pop.addEventListener('focusin', () => { if (openMode === 'hover') { hoverInside = true; clearTimeout(hoverOutTimer); } });
    pop.addEventListener('mouseleave', () => {
      if (openMode !== 'hover') return;
      clearTimeout(hoverOutTimer);
      hoverInside = false;
      hoverOutTimer = setTimeout(() => { if (openMode === 'hover' && !hoverInside) close(); }, 180);
    });

    // In case pointer leaves the wrap entirely while in hover mode
    wrap.addEventListener('mouseleave', () => { if (openFor && openMode === 'hover') { hoverInside = false; close(); } });

    window.addEventListener('resize', () => { if (openFor) place(openFor); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    // Document-wide outside click close for click/tap mode
    document.addEventListener('click', (e) => {
      if (!openFor || openMode !== 'click') return;
      const inWrap = !!e.target.closest('.map-wrap');
      if (!inWrap) close();
    });

    // Touch outside close as well (mobile)
    document.addEventListener('touchstart', (e) => {
      if (!openFor || openMode !== 'click') return;
      const inWrap = !!e.target.closest('.map-wrap');
      const onTarget = !!e.target.closest('.target');
      if (!inWrap || (!onTarget && !pop.contains(e.target))) close();
    }, { passive: true });
  }

  /** Small helper to offset a lat/lng */
  function offset(center, dLat, dLng) {
    return { lat: center.lat + dLat, lng: center.lng + dLng };
  }

  // Init
  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', () => {
    startClock();
    setupShotMode();
    setupTargets();
    route();
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  });
})();
