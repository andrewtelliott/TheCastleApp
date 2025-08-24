/* The Castle — map.js
   Lazy Google Maps loader + map creation
*/
(function(){
  'use strict';

  let googleReady = false;
  let pending = [];

  /** Load Google Maps JS API once */
  function loadGoogle(apiKey, onReady) {
    if (googleReady || (window.google && window.google.maps)) {
      googleReady = true; onReady(); return;
    }
    pending.push(onReady);
    if (document.getElementById('gmap-loader')) return; // already loading
    const s = document.createElement('script');
    s.id = 'gmap-loader';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    s.async = true; s.defer = true;
    s.onload = () => { googleReady = true; pending.splice(0).forEach(fn => fn()); };
    s.onerror = () => { console.warn('Google Maps failed to load.'); };
    document.head.appendChild(s);
  }

  /**
   * @typedef {Object} MarkerSpec
   * @property {{lat:number,lng:number}} position
   * @property {string} title
   */

  /**
   * Create the Castle map with tactical styling.
   * @param {{ apiKey:string, el:HTMLElement, center:{lat:number,lng:number}, zoom:number, markers: MarkerSpec[] }} opts
   */
  function createCastleMap(opts) {
    if (!opts || !opts.el) return;
    loadGoogle(opts.apiKey, () => {
      const map = new google.maps.Map(opts.el, {
        center: opts.center,
        zoom: opts.zoom || 11,
        disableDefaultUI: true,
        gestureHandling: 'greedy',
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#0a0e13' }] },
          { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#9ea7b3' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0e13' }] },
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'road', stylers: [{ color: '#121921' }] },
          { featureType: 'water', stylers: [{ color: '#0e141b' }] },
        ]
      });

      // Red crosshair center marker (no icon, just a circle)
      new google.maps.Circle({
        map,
        center: opts.center,
        radius: 20,
        strokeColor: '#c23b3b',
        strokeOpacity: 0.6,
        strokeWeight: 1,
        fillColor: '#c23b3b',
        fillOpacity: 0.1
      });

      const infowin = new google.maps.InfoWindow();
      (opts.markers || []).forEach(m => {
        const marker = new google.maps.Marker({
          map,
          position: m.position,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 4,
            fillColor: '#c23b3b', fillOpacity: 1,
            strokeColor: '#9b2a2a', strokeWeight: 1
          }
        });
        marker.addListener('click', () => {
          infowin.setContent(`<div style="font-family:ui-sans-serif,system-ui; color:#e8e6e3;">
            <strong>${m.title}</strong>
          </div>`);
          infowin.open({ map, anchor: marker });
        });
      });

      // Expose for debugging
      window.__castle_map = map;
    });
  }

  window.createCastleMap = createCastleMap;
})();
