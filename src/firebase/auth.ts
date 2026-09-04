import { Platform } from 'react-native';
import { getAuth, initializeAuth } from 'firebase/auth';
// @ts-ignore — getReactNativePersistence exists in the RN build at runtime
// (Metro resolves it) but is missing from the public web type definitions,
// and resolves to undefined entirely on web — hence the Platform.OS guard
// below, which only ever calls it on native.
import { getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseApp } from './config';


export const auth = Platform.OS === 'web'
  ? getAuth(firebaseApp)
  : initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
