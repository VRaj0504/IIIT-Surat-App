import { Platform } from 'react-native';
import { getAuth, initializeAuth } from 'firebase/auth';
// @ts-ignore — getReactNativePersistence exists in the RN build at runtime
// (Metro resolves it) but is missing from the public web type definitions,
// and resolves to undefined entirely on web — hence the Platform.OS guard
// below, which only ever calls it on native.
import { getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseApp } from './config';

// Firebase's web SDK doesn't have (or need) getReactNativePersistence — it
// manages its own browser-based persistence (IndexedDB) automatically via
// plain getAuth(). Calling the RN-specific function on web throws "is not
// a function" immediately, since it resolves to undefined there — this is
// exactly what broke the web build with a blank page and that error.
export const auth = Platform.OS === 'web'
  ? getAuth(firebaseApp)
  : initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
