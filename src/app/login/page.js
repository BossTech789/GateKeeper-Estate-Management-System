"use client";

import { useState } from "react";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useDispatch } from "react-redux";
import { auth, db } from "@/lib/firebase";
import { setAuthError } from "@/store/features/auth/authSlice";

export default function LoginPage() {
  const dispatch = useDispatch();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    dispatch(setAuthError(null));
    setLoading(true);

    try {
      // Step 1: Sign in with Firebase Authentication.
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const firebaseUser = userCredential.user;

      // Step 2: Load this user's Firestore profile.
      const userRef = doc(db, "users", firebaseUser.uid);
      const userSnapshot = await getDoc(userRef);

      if (!userSnapshot.exists()) {
        setError(
          "Your account profile was not found. Please contact the estate administrator."
        );
        await auth.signOut();
        return;
      }

      const profile = userSnapshot.data();

      // Step 3: Check approval status and role.
      if (profile.active !== true) {
        window.location.replace("/pending-approval");
        return;
      }

      if (profile.role === "admin") {
        window.location.replace("/admin");
      } else if (profile.role === "resident") {
        window.location.replace("/resident/dashboard");
      } else if (profile.role === "security") {
        window.location.replace("/security/dashboard");
      } else {
        setError(
          "Your account role is not recognized. Please contact the estate administrator."
        );
        await auth.signOut();
      }
    } catch (err) {
      console.error("Login error:", err);

      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password"
      ) {
        setError("Incorrect email or password.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many attempts. Please wait and try again.");
      } else if (err.code === "permission-denied") {
        setError(
          "Unable to read your account profile. Please check your Firestore rules."
        );
      } else {
        setError(err.message || "Unable to sign in.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Welcome Back
        </h1>

        <p className="mb-6 text-gray-600">
          Sign in to your GateKeeper account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900"
          />

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gray-900 px-4 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          New resident?{" "}
          <Link
            href="/register"
            className="font-semibold text-gray-900 underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}