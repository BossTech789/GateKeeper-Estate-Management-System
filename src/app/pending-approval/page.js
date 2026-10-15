
"use client";

import Link from "next/link";
import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useSelector } from "react-redux";

export default function PendingApprovalPage() {
  const user = useSelector((state) => state.auth.user);
  const authStatus = useSelector((state) => state.auth.authStatus);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  async function handleSignOut() {
    try {
      setSigningOut(true);
      setSignOutError("");

      await signOut(auth);
      window.location.href = "/login";
    } catch (error) {
      console.error("Sign-out error:", error);
      setSignOutError("Unable to sign out. Please try again.");
      setSigningOut(false);
    }
  }

  if (authStatus === "checking" || authStatus === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
        <p className="text-gray-700">Loading your account...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">
          ⏳
        </div>

        <h1 className="mb-3 text-3xl font-bold text-gray-900">
          Approval Pending
        </h1>

        <p className="mb-6 leading-7 text-gray-600">
          Your GateKeeper account has been created. An estate administrator
          must approve your account before you can access resident services.
        </p>

        {user && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left">
            <h2 className="mb-3 font-semibold text-gray-900">
              Your Account
            </h2>

            <div className="space-y-2 text-sm text-gray-700">
              <p>
                <span className="font-medium">Name:</span>{" "}
                {user.name || "Not provided"}
              </p>

              <p className="break-all">
                <span className="font-medium">Email:</span>{" "}
                {user.email || "Not available"}
              </p>

              <p>
                <span className="font-medium">Role:</span>{" "}
                {user.role || "Resident"}
              </p>

              <p>
                <span className="font-medium">Account status:</span>{" "}
                {user.active === true
                  ? "Active"
                  : user.active === false
                    ? "Inactive"
                    : "Pending verification"}
              </p>
            </div>
          </div>
        )}

        <div className="mb-6 rounded-lg bg-amber-50 p-4 text-left">
          <h2 className="font-semibold text-gray-800">
            What happens next?
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-600">
            The administrator will review your registration and activate
            your account. Once approved, you can sign in to access visitor
            passes, complaints, levies, and estate announcements.
          </p>
        </div>

        {signOutError && (
          <p className="mb-4 text-sm text-red-600" role="alert">
            {signOutError}
          </p>
        )}

        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full rounded-lg bg-gray-900 px-4 py-3 font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {signingOut ? "Signing out..." : "Sign Out"}
        </button>

        <p className="mt-4 text-sm text-gray-600">
          Already approved?{" "}
          <Link
            href="/login"
            className="font-semibold text-gray-900 underline"
          >
            Sign in again
          </Link>
        </p>
      </div>
    </main>
  );
}
