import React from 'react'
import { View, StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'

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

export default function MapView({ lat, lng, markers = [] }: MapViewProps) {
  const markersJs = markers.map(m =>
    `L.circleMarker([${m.lat}, ${m.lng}], {
      radius: 10, color: '${m.color}', fillColor: '${m.color}', fillOpacity: 1
    }).addTo(map).bindPopup('${m.label}');`
  ).join('\n')

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
        source={{ html }}
        style={styles.map}
        scrollEnabled={false}
        originWhitelist={['*']}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map:       { flex: 1 },
})
