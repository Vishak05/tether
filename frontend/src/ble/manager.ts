import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager } from 'react-native-ble-plx';

// One BleManager for the whole app — react-native-ble-plx docs recommend a
// single long-lived instance rather than creating one per use.
export const bleManager = new BleManager();

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const apiLevel = parseInt(String(Platform.Version), 10);
  if (apiLevel < 31) {
    // Older Android ties BLE scanning to location permission.
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }

  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  return (
    result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
    result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
  );
}

export interface NearbyDevice {
  id: string;
  name: string;
  rssi: number | null;
}

/**
 * Scans for `durationMs` and returns every distinct device seen, strongest
 * signal first. Used by the Settings picker to let the user choose an anchor.
 */
export function scanForNearbyDevices(durationMs = 4000): Promise<NearbyDevice[]> {
  return new Promise((resolve, reject) => {
    const seen = new Map<string, NearbyDevice>();

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        bleManager.stopDeviceScan();
        reject(error);
        return;
      }
      if (!device) return;
      seen.set(device.id, {
        id: device.id,
        name: device.name || device.localName || device.id,
        rssi: device.rssi,
      });
    });

    setTimeout(() => {
      bleManager.stopDeviceScan();
      resolve(Array.from(seen.values()).sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)));
    }, durationMs);
  });
}

/** Resolves true iff `deviceId` is seen at least once during a `durationMs` scan window. */
export function scanForAnchor(deviceId: string, durationMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let found = false;

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error || found) return;
      if (device?.id === deviceId) {
        found = true;
        bleManager.stopDeviceScan();
        resolve(true);
      }
    });

    setTimeout(() => {
      if (!found) {
        bleManager.stopDeviceScan();
        resolve(false);
      }
    }, durationMs);
  });
}
