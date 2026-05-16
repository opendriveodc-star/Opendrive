import React, { useRef, forwardRef, useImperativeHandle } from 'react'
import { View, StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'

export interface MapViewHandle {
  updateDriverMarker: (lat: number, lng: number) => void
}

interface Marker {
  lat:   number
  lng:   number
  color: string
  label: string
}

interface MapViewProps {
  lat:      number
  lng:      number
  markers?: Marker[]
}

const MapView = forwardRef<MapViewHandle, MapViewProps>(({ lat, lng, markers = [] }, ref) => {
  const webViewRef = useRef<WebView>(null)

  useImperativeHandle(ref, () => ({
    updateDriverMarker(newLat: number, newLng: number) {
      webViewRef.current?.injectJavaScript(`
        if (window.driverMarker) {
          window.driverMarker.setLatLng([${newLat}, ${newLng}]);
          map.panTo([${newLat}, ${newLng}]);
        }
        true;
      `)
    },
  }))

  const markersJs = markers.map((m, i) => `
    var marker${i} = L.circleMarker([${m.lat}, ${m.lng}], {
      radius: 10, color: '${m.color}', fillColor: '${m.color}', fillOpacity: 1
    }).addTo(map).bindPopup('${m.label}');
    ${i === 0 ? 'window.driverMarker = marker0;' : ''}
  `).join('\n')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>html,body,#map{margin:0;padding:0;height:100%;width:100%;}</style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map').setView([${lat}, ${lng}], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);
    ${markersJs}
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
      />
    </View>
  )
})

export default MapView

const styles = StyleSheet.create({
  container: { flex: 1 },
  map:       { flex: 1 },
})
