
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { signOut } from "firebase/auth";

import {
  collection,
  getDocs,
  limit,
  query,
  where,
  doc,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

export default function SecurityDashboard() {
  const router = useRouter();

  const user = useSelector((state) => state.auth.user);
  const authStatus = useSelector(
    (state) => state.auth.authStatus
  );

  const [code, setCode] = useState("");
  const [visitor, setVisitor] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const isAuthorized =
    ["security", "admin"].includes(user?.role) &&
    user?.active === true;

  // Redirect unauthenticated users.
  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.replace("/login");
    }
  }, [authStatus, router]);

  // Sign out.
  async function handleSignOut() {
    setError("");

    try {
      await signOut(auth);
      router.replace("/login");
    } catch (err) {
      console.error("Sign-out error:", err);
      setError("Unable to sign out. Please try again.");
    }
  }

  // Verify visitor code.
  async function handleVerify(event) {
    event.preventDefault();

    if (loading) return;

    setError("");
    setMessage("");
    setVisitor(null);

    const enteredCode = code.trim().toUpperCase();

    if (enteredCode.length !== 8) {
      setError("Enter the complete 8-character visitor code.");
      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser || currentUser.uid !== user?.uid) {
      setError("Your session has expired. Please sign in again.");
      return;
    }

    if (!isAuthorized) {
      setError("You are not authorized to verify visitor codes.");
      return;
    }

    setLoading(true);

    try {
      const passesQuery = query(
        collection(db, "visitorPasses"),
        where("code", "==", enteredCode),
        limit(2)
      );

      const result = await getDocs(passesQuery);

      if (result.empty) {
        setError("Visitor code not found. Please check the code.");
        return;
      }

      if (result.size > 1) {
        setError(
          "Duplicate visitor codes found. Contact the estate administrator."
        );
        return;
      }

      const passDocument = result.docs[0];

      const pass = {
        id: passDocument.id,
        ...passDocument.data(),
      };

      setVisitor(pass);

      if (pass.status === "checked_in") {
        setError("This visitor has already been checked in.");
      } else if (pass.status !== "pending") {
        setError("This visitor pass is not available for check-in.");
      } else {
        setMessage(
          "Code verified. Check the visitor's details before checking them in."
        );
      }
    } catch (err) {
      console.error("Visitor verification failed:", err);

      if (err.code === "permission-denied") {
        setError(
          "Permission denied. Check your Firestore security rules."
        );
      } else {
        setError(
          `Unable to verify visitor code: ${
            err.message || "Please try again."
          }`
        );
      }
    } finally {
      setLoading(false);
    }
  }

  // Validate a YYYY-MM-DD visit date against the local calendar date.
  function isVisitDateValid(visitDateString) {
    if (
      typeof visitDateString !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(visitDateString)
    ) {
      return false;
    }

    const visitDate = new Date(
      `${visitDateString}T00:00:00`
    );

    if (
      Number.isNaN(visitDate.getTime()) ||
      visitDate.getFullYear() !==
        Number(visitDateString.slice(0, 4)) ||
      visitDate.getMonth() + 1 !==
        Number(visitDateString.slice(5, 7)) ||
      visitDate.getDate() !==
        Number(visitDateString.slice(8, 10))
    ) {
      return false;
    }

    const now = new Date();
    const todayString = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");

    return visitDateString <= todayString;
  }

  // Check in the visitor and create a gate log atomically.
  async function handleCheckIn() {
    if (loading) return;

    setError("");
    setMessage("");

    if (!visitor?.id || visitor.status !== "pending") {
      setError("Verify a valid pending visitor pass first.");
      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser || currentUser.uid !== user?.uid) {
      setError("Your session has expired. Please sign in again.");
      return;
    }

    if (!isAuthorized) {
      setError("You are not authorized to check in visitors.");
      return;
    }

    if (!isVisitDateValid(visitor.visitDate)) {
      setError(
        "The visit date is invalid or is in the future. Check the visitor pass."
      );
      return;
    }

    setLoading(true);

    try {
      const passRef = doc(db, "visitorPasses", visitor.id);

      // Generate the log document reference before the transaction.
      const gateLogRef = doc(collection(db, "gateLogs"));

      await runTransaction(db, async (transaction) => {
        const passSnapshot = await transaction.get(passRef);

        if (!passSnapshot.exists()) {
          throw new Error("PASS_NOT_FOUND");
        }

        const latestPass = passSnapshot.data();

        if (latestPass.status !== "pending") {
          throw new Error("PASS_ALREADY_USED");
        }

        if (!isVisitDateValid(latestPass.visitDate)) {
          throw new Error("INVALID_VISIT_DATE");
        }

        // Update the visitor pass.
        transaction.update(passRef, {
          status: "checked_in",
          checkedInBy: currentUser.uid,
          checkedInAt: serverTimestamp(),
        });

        // Create the matching gate log in the same transaction.
        transaction.set(gateLogRef, {
          visitorPassId: visitor.id,
          visitorName: latestPass.visitorName || "Not provided",
          residentName: latestPass.residentName || "Not provided",
          purpose: latestPass.purpose || "Not provided",
          code: latestPass.code || visitor.code || "",
          checkedInBy: currentUser.uid,
          checkedInAt: serverTimestamp(),
          status: "checked_in",
        });
      });

      setVisitor((previous) => ({
        ...previous,
        status: "checked_in",
      }));

      setMessage("Visitor checked in successfully. Gate log recorded.");
      setCode("");
    } catch (err) {
      console.error("Check-in failed:", err);

      if (err.message === "PASS_NOT_FOUND") {
        setError("This visitor pass no longer exists.");
      } else if (err.message === "PASS_ALREADY_USED") {
        setVisitor((previous) =>
          previous ? { ...previous, status: "checked_in" } : previous
        );

        setError(
          "This visitor pass has already been used or is no longer pending."
        );
      } else if (err.message === "INVALID_VISIT_DATE") {
        setError("The visitor date is invalid or is in the future.");
      } else if (err.code === "permission-denied") {
        setError(
          "Firebase denied check-in or gate logging. Check your Firestore security rules."
        );
      } else if (err.code === "unavailable") {
        setError("Firebase is temporarily unavailable. Please try again.");
      } else {
        setError(
          `Check-in failed: ${err.message || "Unknown error"}`
        );
      }
    } finally {
      setLoading(false);
    }
  }

  // Authentication loading screen.
  if (authStatus === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-100">
        <p className="text-stone-700">Checking your account...</p>
      </main>
    );
  }

  if (authStatus !== "authenticated" || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-100">
        <p className="text-stone-700">Redirecting to login...</p>
      </main>
    );
  }

  if (user.active !== true) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-stone-900">
            Account Inactive
          </h1>

          <p className="mt-3 text-stone-600">
            Your account is not active. Please contact the estate administrator.
          </p>

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-6 rounded-lg bg-stone-900 px-5 py-3 font-semibold text-white hover:bg-stone-700"
          >
            Sign Out
          </button>
        </div>
      </main>
    );
  }

  if (!["security", "admin"].includes(user.role)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-stone-900">
            Access Denied
          </h1>

          <p className="mt-3 text-stone-600">
            This dashboard is only for authorized security staff and administrators.
          </p>

          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="mt-6 rounded-lg bg-stone-900 px-5 py-3 font-semibold text-white hover:bg-stone-700"
          >
            Return to Login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-amber-800">
              GateKeeper Estate Management
            </p>

            <h1 className="mt-3 text-3xl font-bold text-stone-900 sm:text-4xl">
              Security Gate
            </h1>

            <p className="mt-2 text-stone-600">
              Welcome, {user.name || "Security Officer"}.
            </p>

            <p className="mt-1 text-sm capitalize text-stone-500">
              Role: {user.role}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-lg bg-stone-900 px-5 py-3 font-semibold text-white transition hover:bg-stone-700"
          >
            Sign Out
          </button>
        </header>

        {/* Visitor code form */}
        <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-2xl">
              🔐
            </div>

            <div>
              <h2 className="text-xl font-bold text-stone-900">
                Verify Visitor Code
              </h2>

              <p className="mt-1 text-sm text-stone-600">
                Enter the visitor's eight-character access code.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleVerify}
            className="mt-6 flex flex-col gap-3 sm:flex-row"
          >
            <input
              type="text"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.toUpperCase().slice(0, 8))
              }
              placeholder="AB12CD34"
              maxLength={8}
              minLength={8}
              required
              autoComplete="off"
              spellCheck={false}
              aria-label="Visitor access code"
              className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-4 py-3 font-mono text-lg tracking-widest text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
            />

            <button
              type="submit"
              disabled={loading || code.trim().length !== 8}
              className="rounded-lg bg-amber-800 px-6 py-3 font-semibold text-white transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Please wait..." : "Verify Code"}
            </button>
          </form>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {message && (
            <div
              role="status"
              className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
            >
              {message}
            </div>
          )}
        </section>

        {/* Visitor details */}
        {visitor && (
          <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-amber-800">
                  Gate Verification
                </p>

                <h2 className="mt-1 text-xl font-bold text-stone-900">
                  Visitor Details
                </h2>
              </div>

              <span
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  visitor.status === "checked_in"
                    ? "bg-green-100 text-green-800"
                    : visitor.status === "pending"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-stone-100 text-stone-700"
                }`}
              >
                {visitor.status === "checked_in"
                  ? "Checked In"
                  : visitor.status === "pending"
                    ? "Pending"
                    : visitor.status}
              </span>
            </div>

            <div className="mt-6 grid gap-5 border-t border-stone-100 pt-6 sm:grid-cols-2">
              <Detail label="Visitor Name" value={visitor.visitorName} />
              <Detail label="Resident Name" value={visitor.residentName} />
              <Detail label="Visit Date" value={visitor.visitDate} />
              <Detail label="Purpose of Visit" value={visitor.purpose} />

              <div className="sm:col-span-2">
                <p className="text-sm text-stone-500">Access Code</p>
                <p className="mt-1 break-all font-mono text-xl font-bold tracking-widest text-stone-900">
                  {visitor.code || "Not provided"}
                </p>
              </div>
            </div>

            {visitor.status === "pending" && (
              <div className="mt-6 border-t border-stone-100 pt-6">
                <div className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
                  Confirm the visitor's identity and scheduled visit date before admitting them.
                </div>

                <button
                  type="button"
                  onClick={handleCheckIn}
                  disabled={loading}
                  className="w-full rounded-lg bg-green-700 px-5 py-3 font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Processing..." : "Confirm Visitor Check-In"}
                </button>
              </div>
            )}

            {visitor.status === "checked_in" && (
              <div className="mt-6 rounded-lg bg-green-50 p-4 text-sm font-medium text-green-800">
                This visitor has already been checked in.
              </div>
            )}

            {visitor.status !== "pending" &&
              visitor.status !== "checked_in" && (
                <div className="mt-6 rounded-lg bg-stone-100 p-4 text-sm text-stone-700">
                  This pass cannot be used for check-in.
                </div>
              )}
          </section>
        )}

        <footer className="mt-10 text-center text-sm text-stone-500">
          GateKeeper Estate Management
          <span className="mx-2">•</span>
          Security Portal
        </footer>
      </div>
    </main>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-1 font-semibold text-stone-900">
        {value || "Not provided"}
      </p>
    </div>
  );
}
