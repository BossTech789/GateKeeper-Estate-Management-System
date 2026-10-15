
"use client";

import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

import {
  setUser,
  setAuthStatus,
  setAuthError,
} from "@/store/features/auth/authSlice";

export function startAuthListener(dispatch) {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      console.log("No Firebase user is signed in.");

      dispatch(setUser(null));
      dispatch(setAuthStatus("unauthenticated"));
      dispatch(setAuthError(null));

      return;
    }

    console.log("Firebase user signed in:", firebaseUser.uid);

    try {
      dispatch(setAuthStatus("checking"));
      dispatch(setAuthError(null));

      const userRef = doc(db, "users", firebaseUser.uid);
      const userSnapshot = await getDoc(userRef);

      if (!userSnapshot.exists()) {
        console.error(
          "No Firestore profile found for UID:",
          firebaseUser.uid
        );

        dispatch(setUser(null));
        dispatch(setAuthError("Your user profile was not found."));
        dispatch(setAuthStatus("unauthenticated"));

        return;
      }

      const profile = userSnapshot.data();

      // Convert Firestore Timestamp values into serializable values.
      const serializableProfile = Object.fromEntries(
        Object.entries(profile).map(([key, value]) => [
          key,
          value?.toDate instanceof Function
            ? value.toDate().toISOString()
            : value,
        ])
      );

      const userData = {
        ...serializableProfile,
        uid: firebaseUser.uid,
        email: firebaseUser.email,
      };

      console.log("Firestore profile loaded:", userData);

      dispatch(setUser(userData));
      dispatch(setAuthStatus("authenticated"));

      console.log("User profile dispatched to Redux.");
    } catch (error) {
      console.error("Auth listener error:", error);

      dispatch(setAuthError(error.message));
      dispatch(setAuthStatus("unauthenticated"));
    }
  });
}
