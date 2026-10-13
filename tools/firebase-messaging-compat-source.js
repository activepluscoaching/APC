// Built into a classic, same-origin script for firebase-messaging-sw.js.
// Keep the background worker's Firebase app selection identical to the page's.
import firebase from 'firebase/compat/app';
import 'firebase/compat/messaging';
import { firebaseConfig } from '../firebase/firebase-config.js';
self.firebase = firebase;
self.apcMessagingFirebaseConfig = firebaseConfig;
