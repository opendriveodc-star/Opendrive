// src/components/MapView.tsx
// Wrapper cho MapLibre với OpenFreeMap tiles.
// TODO: cài maplibre-gl-react-native để dùng component này.
// Tạm thời render View placeholder vì cần native build.

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

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

export default function MapView({ lat, lng, markers }: MapViewProps) {
  // TODO: Sau khi cài maplibre-gl-react-native, thay phần này bằng:
  // import MapLibreGL from '@maplibre/maplibre-react-native'
  // <MapLibreGL.MapView style={{ flex: 1 }} styleURL="https://tiles.openfreemap.org/styles/liberty">
  //   <MapLibreGL.Camera centerCoordinate={[lng, lat]} zoomLevel={14} />
  //   {markers?.map((m) => (
  //     <MapLibreGL.MarkerView key={m.label} coordinate={[m.lng, m.lat]}>
  //       <View style={[styles.marker, { backgroundColor: m.color }]}>
  //         <Text style={styles.markerLabel}>{m.label}</Text>
  //       </View>
  //     </MapLibreGL.MarkerView>
  //   ))}
  // </MapLibreGL.MapView>

  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Map Loading...</Text>
      <Text style={styles.coords}>
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </Text>
      {markers && markers.length > 0 && (
        <View style={styles.markerList}>
          {markers.map((m) => (
            <View key={m.label} style={[styles.markerDot, { backgroundColor: m.color }]}>
              <Text style={styles.markerText}>{m.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: '#E5E7EB',
    alignItems:      'center',
    justifyContent:  'center',
  },
  placeholder: {
    fontSize:   18,
    color:      '#6B7280',
    fontWeight: '600',
  },
  coords: {
    fontSize:  12,
    color:     '#9CA3AF',
    marginTop: 4,
  },
  markerList: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    marginTop:     12,
    gap:           8,
  },
  markerDot: {
    paddingHorizontal: 10,
    paddingVertical:    4,
    borderRadius:       12,
  },
  markerText: {
    color:     '#FFFFFF',
    fontSize:  12,
    fontWeight: '600',
  },
  marker: {
    width:        24,
    height:       24,
    borderRadius: 12,
    alignItems:   'center',
    justifyContent: 'center',
  },
  markerLabel: {
    color:    '#FFFFFF',
    fontSize: 10,
  },
})
