
"use client";

import { useState } from "react";
import Link from "next/link";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    unit: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    let accountCreated = false;

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        form.email.trim(),
        form.password
      );

      accountCreated = true;

      await setDoc(doc(db, "users", credential.user.uid), {
        name: form.name.trim(),
        email: credential.user.email,
        phone: form.phone.trim(),
        unit: form.unit.trim(),
        role: "resident",
        active: false,
        createdAt: serverTimestamp(),
      });

      window.location.href = "/pending-approval";
    } catch (err) {
      if (accountCreated) {
        setError(
          "Your account was created, but your profile could not be saved. Please contact the estate administrator before trying to register again."
        );
      } else if (err.code === "auth/email-already-in-use") {
        setError("This email is already registered. Please sign in instead.");
      } else if (err.code === "auth/weak-password") {
        setError("Please use a stronger password.");
      } else if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        setError(err.message || "Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Join GateKeeper
        </h1>

        <p className="mb-6 text-gray-600">
          Create your resident account. Your access will be enabled after
          administrator approval.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="name"
            placeholder="Full name"
            value={form.name}
            onChange={handleChange}
            autoComplete="name"
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900"
          />

          <input
            name="email"
            type="email"
            placeholder="Email address"
            value={form.email}
            onChange={handleChange}
            autoComplete="email"
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900"
          />

          <input
            name="phone"
            type="tel"
            placeholder="Phone number"
            value={form.phone}
            onChange={handleChange}
            autoComplete="tel"
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900"
          />

          <input
            name="unit"
            placeholder="Estate unit / house number"
            value={form.unit}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900"
          />

          <input
            name="password"
            type="password"
            placeholder="Password (at least 6 characters)"
            value={form.password}
            onChange={handleChange}
            autoComplete="new-password"
            minLength={6}
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
            className="w-full rounded-lg bg-gray-900 px-4 py-3 font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-gray-900 underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
