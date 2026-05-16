import { View, Text, StyleSheet } from 'react-native'

interface Props {
  balance: number
}

export default function ODCBalance({ balance }: Props) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>🪙 {balance.toFixed(2)} ODC</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor:  '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderRadius:      20,
  },
  text: {
    color:      '#92400E',
    fontWeight: '700',
    fontSize:   14,
  },
})
