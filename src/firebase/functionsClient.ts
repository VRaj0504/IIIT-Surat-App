import { getFunctions } from 'firebase/functions';
import { firebaseApp } from './config';

export const functions = getFunctions(firebaseApp, 'asia-south1');
