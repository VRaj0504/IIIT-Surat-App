import { Platform } from 'react-native';
import { getAuth, initializeAuth } from 'firebase/auth';
// @ts-ignore — getReactNativePersistence exists in the RN build at runtime

import { getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseApp } from './config';

export const auth = Platform.OS === 'web'
  ? getAuth(firebaseApp)
  : initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
