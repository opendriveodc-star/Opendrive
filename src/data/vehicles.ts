// src/data/vehicles.ts
// Cấu hình mô hình vận tải + loại xe – chỉnh ở đây khi thêm xe mới

export type TransportModel = 'passenger' | 'freight'

export type VehicleKey = 'motorbike' | 'car4' | 'car7' | 'pickup' | 'truck'

export interface VehicleOption {
  key:      VehicleKey
  icon:     string  // Ionicons glyph name
  labelKey: string  // i18n key cho tên xe
  specKey:  string  // i18n key cho thông số (vd: "register.specCar4")
}

export interface TransportModelConfig {
  key:      TransportModel
  labelKey: string
  icon:     string
  vehicles: VehicleOption[]
}

export const TRANSPORT_MODELS: TransportModelConfig[] = [
  {
    key:      'passenger',
    labelKey: 'register.passenger',
    icon:     'people-outline',
    vehicles: [
      { key: 'motorbike', icon: 'bicycle-outline', labelKey: 'register.motorbike', specKey: 'register.specMotorbikePass' },
      { key: 'car4',      icon: 'car-outline',     labelKey: 'register.car4',      specKey: 'register.specCar4'          },
      { key: 'car7',      icon: 'car-outline',     labelKey: 'register.car7',      specKey: 'register.specCar7'          },
    ],
  },
  {
    key:      'freight',
    labelKey: 'register.freight',
    icon:     'cube-outline',
    vehicles: [
      { key: 'motorbike', icon: 'bicycle-outline',   labelKey: 'register.motorbike', specKey: 'register.specMotorbikeFreight' },
      { key: 'pickup',    icon: 'car-sport-outline', labelKey: 'register.pickup',    specKey: 'register.specPickup'           },
      { key: 'truck',     icon: 'bus-outline',       labelKey: 'register.truck',     specKey: 'register.specTruck'            },
    ],
  },
]
