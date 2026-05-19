import React, { useRef, forwardRef, useImperativeHandle } from 'react'
import { View, StyleSheet } from 'react-native'
import { WebView, WebViewMessageEvent } from 'react-native-webview'

export interface MapViewHandle {
  updateDriverMarker: (lat: number, lng: number) => void
  panTo: (lat: number, lng: number) => void
}

interface MapViewProps {
  lat:              number
  lng:              number
  mode?:            'tracking' | 'picker'
  crosshairTopPct?: number   // pin tip Y as % of container height (default 50)
  onCenterChange?:  (lat: number, lng: number) => void
  onMapReady?:      () => void
}

const MapView = forwardRef<MapViewHandle, MapViewProps>(
  ({ lat, lng, mode = 'tracking', crosshairTopPct = 50, onCenterChange, onMapReady }, ref) => {
    const webViewRef = useRef<WebView>(null)

    useImperativeHandle(ref, () => ({
      updateDriverMarker(newLat, newLng) {
        webViewRef.current?.injectJavaScript(`
          if (window.updateMarkerPosition) window.updateMarkerPosition(${newLat}, ${newLng});
          true;
        `)
      },
      panTo(newLat, newLng) {
        webViewRef.current?.injectJavaScript(`
          if (window.panTo) window.panTo(${newLat}, ${newLng});
          true;
        `)
      },
    }))

    function handleMessage(event: WebViewMessageEvent) {
      try {
        const data = JSON.parse(event.nativeEvent.data)
        if (data.type === 'mapReady' && onMapReady) { onMapReady(); return }
        if (data.type === 'center' && onCenterChange) onCenterChange(data.lat, data.lng)
      } catch {}
    }

    const isPicker   = mode === 'picker'
    const pinTopPct  = crosshairTopPct
    const pinTopFrac = (pinTopPct / 100).toFixed(4)

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet">
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <style>
    html,body,#map { margin:0; padding:0; height:100%; width:100%; }
    ${isPicker ? `
    #picker-pin {
      position: fixed; top: ${pinTopPct}%; left: 50%;
      transform: translate(-50%, -100%);
      z-index: 100; pointer-events: none;
      filter: drop-shadow(0 3px 6px rgba(0,0,0,0.28));
      transition: transform 0.15s ease;
    }
    #picker-pin.moving { transform: translate(-50%, calc(-100% - 10px)); }
    #pin-shadow {
      position: fixed; top: ${pinTopPct}%; left: 50%;
      transform: translate(-50%, 2px);
      width: 12px; height: 5px;
      background: rgba(0,0,0,0.18);
      border-radius: 50%; z-index: 99; pointer-events: none;
      transition: all 0.15s ease;
    }
    #pin-shadow.moving { width: 7px; height: 3px; opacity: 0.4; }
    ` : `
    .driver-dot {
      width: 15px; height: 15px; background: #1A2E5E;
      border: 2px solid #fff; border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3); position: relative;
    }
    .driver-dot::after {
      content: ''; position: absolute; top: 50%; left: 50%;
      transform: translate(-50%,-50%) scale(1);
      width: 15px; height: 15px; background: rgba(26,46,94,0.4);
      border-radius: 50%; animation: ripple 1.8s ease-out infinite;
    }
    @keyframes ripple {
      0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.8; }
      100% { transform: translate(-50%,-50%) scale(3.5); opacity: 0; }
    }
    `}
  </style>
</head>
<body>
  <div id="map"></div>
  ${isPicker ? `
  <div id="picker-pin">
    <svg width="30" height="38" viewBox="0 0 30 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.716 0 0 6.716 0 15c0 9.375 13.5 22.313 14.1 22.875a1.25 1.25 0 001.8 0C16.5 37.313 30 24.375 30 15 30 6.716 23.284 0 15 0z" fill="#1A2E5E"/>
      <circle cx="15" cy="15" r="6.5" fill="white"/>
      <circle cx="15" cy="15" r="3.5" fill="#1A2E5E"/>
    </svg>
  </div>
  <div id="pin-shadow"></div>
  ` : ''}
  <script>
    var map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [${lng}, ${lat}],
      zoom: 17,
      attributionControl: false
    });

    ${isPicker ? `
    var pinEl    = document.getElementById('picker-pin');
    var shadowEl = document.getElementById('pin-shadow');
    var PIN_TOP_FRAC = ${pinTopFrac};

    map.on('movestart', function() {
      pinEl.classList.add('moving');
      shadowEl.classList.add('moving');
    });
    map.on('moveend', function() {
      pinEl.classList.remove('moving');
      shadowEl.classList.remove('moving');
      var cont = map.getContainer();
      var cx   = cont.clientWidth / 2;
      var cy   = cont.clientHeight * PIN_TOP_FRAC;
      var c    = map.unproject([cx, cy]);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'center', lat: c.lat, lng: c.lng }));
      }
    });
    window.panTo = function(lat, lng) {
      var cont    = map.getContainer();
      var offsetY = cont.clientHeight * (PIN_TOP_FRAC - 0.5);
      map.flyTo({ center: [lng, lat], zoom: 17, duration: 500, offset: [0, offsetY] });
    };
    ` : `
    var el = document.createElement('div');
    el.className = 'driver-dot';
    var marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([${lng}, ${lat}])
      .addTo(map);
    window.updateMarkerPosition = function(lat, lng) {
      marker.setLngLat([lng, lat]);
      map.panTo([lng, lat]);
    };
    window.panTo = function(lat, lng) {
      map.flyTo({ center: [lng, lat], zoom: 17, duration: 500 });
    };
    `}

    map.on('load', function() {
      map.resize();
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
      }
    });
  </script>
</body>
</html>`

    return (
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{ html }}
          style={styles.map}
          scrollEnabled={false}
          originWhitelist={['*']}
          javaScriptEnabled
          onMessage={handleMessage}
        />
      </View>
    )
  }
)

export default MapView

const styles = StyleSheet.create({
  container: { flex: 1 },
  map:       { flex: 1 },
})
