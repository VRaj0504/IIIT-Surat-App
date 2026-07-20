import { initializeAuth } from 'firebase/auth';
// @ts-ignore — getReactNativePersistence exists in the RN build at runtime
// (Metro resolves it) but is missing from the public web type definitions.
// This is a long-standing, known gap in the Firebase JS SDK's TS types.
import { getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseApp } from './config';

export const auth = initializeAuth(firebaseApp, {
  persistence: getReactNativePersistence(AsyncStorage),
});
