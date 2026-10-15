
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function VisitorPassesPage() {
  const router = useRouter();

  const user = useSelector((state) => state.auth.user);
  const authStatus = useSelector((state) => state.auth.authStatus);

  const [visitorName, setVisitorName] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [purpose, setPurpose] = useState("");

  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const [passes, setPasses] = useState([]);
  const [loadingPasses, setLoadingPasses] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [copiedPassId, setCopiedPassId] = useState("");

  // Load only visitor passes belonging to the signed-in resident.
  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !user ||
      user.role !== "resident" ||
      user.active !== true
    ) {
      setLoadingPasses(authStatus === "checking");
      setPasses([]);
      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser || currentUser.uid !== user.uid) {
      setLoadingPasses(false);
      setHistoryError("Your session could not be verified. Please sign in again.");
      return;
    }

    setLoadingPasses(true);
    setHistoryError("");

    const passesQuery = query(
      collection(db, "visitorPasses"),
      where("residentId", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      passesQuery,
      (snapshot) => {
        const residentPasses = snapshot.docs.map((passDoc) => ({
          id: passDoc.id,
          ...passDoc.data(),
        }));

        residentPasses.sort((a, b) => {
          const dateA = a.createdAt?.toMillis?.() ?? 0;
          const dateB = b.createdAt?.toMillis?.() ?? 0;
          return dateB - dateA;
        });

        setPasses(residentPasses);
        setLoadingPasses(false);
        setHistoryError("");
      },
      (err) => {
        console.error("Unable to load visitor passes:", err);
        setHistoryError(
          err.code === "permission-denied"
            ? "You do not have permission to view these visitor passes. Check your Firestore rules."
            : "Unable to load visitor pass history. Please try again."
        );
        setLoadingPasses(false);
      }
    );

    return () => unsubscribe();
  }, [authStatus, user?.uid, user?.role, user?.active]);

    
function generateAccessCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const randomValues = new Uint8Array(8);

  window.crypto.getRandomValues(randomValues);

  const characters = Array.from(randomValues, (value) => {
    let number = value;

    // Avoid modulo bias.
    while (number >= 224) {
      const retry = new Uint8Array(1);
      window.crypto.getRandomValues(retry);
      number = retry[0];
    }

    return alphabet[number % alphabet.length];
  });

  return characters.join("");
}

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");
    setAccessCode("");

    if (
      authStatus !== "authenticated" ||
      !user ||
      user.role !== "resident" ||
      user.active !== true
    ) {
      setError("Only approved residents can create visitor passes.");
      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser || currentUser.uid !== user.uid) {
      setError("Your session has expired. Please sign in again.");
      return;
    }

    const cleanVisitorName = visitorName.trim();
    const cleanPurpose = purpose.trim();

    if (!cleanVisitorName || !cleanPurpose || !visitDate) {
      setError("Please complete all fields.");
      return;
    }

    const selectedDate = new Date(`${visitDate}T00:00:00`);

    if (Number.isNaN(selectedDate.getTime())) {
      setError("Please select a valid visit date.");
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      setError("The visit date cannot be in the past.");
      return;
    }

    setLoading(true);

    try {
      let code = "";
let isUnique = false;

for (let attempt = 0; attempt < 5; attempt++) {
  const candidate = generateAccessCode();

  const existingPasses = await getDocs(
  query(
    collection(db, "visitorPasses"),
    where("residentId", "==", currentUser.uid),
    where("code", "==", candidate),
    limit(1)
  )
); 

  if (existingPasses.empty) {
    code = candidate;
    isUnique = true;
    break;
  }
}

if (!isUnique) {
  throw new Error(
    "Could not generate a unique visitor code. Please try again."
  );
}

const passRef = doc(collection(db, "visitorPasses"));

      await setDoc(passRef, {
        code,
        residentId: currentUser.uid,
        residentName: user.name || "",
        residentEmail: currentUser.email || "",
        visitorName: cleanVisitorName,
        visitDate,
        purpose: cleanPurpose,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      setAccessCode(code);
      setSuccess("Visitor pass created successfully.");

      setVisitorName("");
      setVisitDate("");
      setPurpose("");
    } catch (err) {
      console.error("Visitor pass creation error:", err);

      setError(
        err.code === "permission-denied"
          ? "Permission denied. Check your Firestore rules and resident approval."
          : err.message || "Could not create the visitor pass."
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyCode(code, passId = "new") {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedPassId(passId);
      setSuccess("Access code copied.");
      setError("");
    } catch {
      setError("Copy failed. Please select and copy the code manually.");
    }
  }

  if (authStatus === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-100">
        <p className="text-stone-700">Checking your account...</p>
      </main>
    );
  }

  if (
    authStatus !== "authenticated" ||
    !user ||
    user.role !== "resident" ||
    user.active !== true
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-100 px-6">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-stone-700">
            Please sign in with an approved resident account.
          </p>
          <button
            onClick={() => router.replace("/login")}
            className="mt-4 rounded-lg bg-stone-900 px-5 py-3 font-semibold text-white"
          >
            Go to Login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <button
          onClick={() => router.push("/resident/dashboard")}
          className="mb-6 text-sm font-semibold text-amber-800 hover:underline"
        >
          ← Back to Dashboard
        </button>

        <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
            GateKeeper
          </p>

          <h1 className="mt-3 text-3xl font-bold text-stone-900">
            Create Visitor Pass
          </h1>

          <p className="mt-3 text-stone-600">
            Enter your visitor's details to generate an access code.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="visitorName"
                className="mb-2 block text-sm font-semibold text-stone-800"
              >
                Visitor's full name
              </label>
              <input
                id="visitorName"
                type="text"
                value={visitorName}
                onChange={(event) => setVisitorName(event.target.value)}
                required
                maxLength={100}
                placeholder="Enter visitor's name"
                className="w-full rounded-lg border border-stone-300 px-4 py-3 text-stone-900 outline-none focus:border-amber-700"
              />
            </div>

            <div>
              <label
                htmlFor="visitDate"
                className="mb-2 block text-sm font-semibold text-stone-800"
              >
                Visit date
              </label>
              <input
                id="visitDate"
                type="date"
                value={visitDate}
                onChange={(event) => setVisitDate(event.target.value)}
                min={new Date().toLocaleDateString("en-CA")}
                required
                className="w-full rounded-lg border border-stone-300 px-4 py-3 text-stone-900 outline-none focus:border-amber-700"
              />
            </div>

            <div>
              <label
                htmlFor="purpose"
                className="mb-2 block text-sm font-semibold text-stone-800"
              >
                Purpose of visit
              </label>
              <textarea
                id="purpose"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                required
                maxLength={300}
                rows={3}
                placeholder="Family visit, delivery, maintenance..."
                className="w-full rounded-lg border border-stone-300 px-4 py-3 text-stone-900 outline-none focus:border-amber-700"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            {success && (
              <p
                role="status"
                className="rounded-lg bg-green-50 p-3 text-sm text-green-700"
              >
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-stone-900 px-5 py-3 font-semibold text-white transition hover:bg-stone-700 disabled:opacity-60"
            >
              {loading ? "Creating visitor pass..." : "Generate Visitor Pass"}
            </button>
          </form>

          {accessCode && (
            <div className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-6 text-center">
              <p className="text-sm font-semibold text-amber-900">
                Your visitor access code
              </p>

              <p className="my-4 break-all text-3xl font-bold tracking-[0.2em] text-stone-900">
                {accessCode}
              </p>

              <button
                type="button"
                onClick={() => copyCode(accessCode)}
                className="rounded-lg bg-amber-800 px-5 py-3 font-semibold text-white hover:bg-amber-900"
              >
                {copiedPassId === "new" ? "Copied!" : "Copy Access Code"}
              </button>

              <p className="mt-4 text-sm text-stone-600">
                Share this code with your visitor. Security will verify it at the gate.
              </p>
            </div>
          )}
        </section>

        <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-amber-700">
                Your Records
              </p>
              <h2 className="mt-2 text-2xl font-bold text-stone-900">
                My Visitor Passes
              </h2>
            </div>

            <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-700">
              {passes.length} {passes.length === 1 ? "pass" : "passes"}
            </span>
          </div>

          {historyError && (
            <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {historyError}
            </p>
          )}

          {loadingPasses ? (
            <p className="mt-6 text-stone-600">Loading your visitor passes...</p>
          ) : !historyError && passes.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-stone-300 p-8 text-center">
              <p className="font-semibold text-stone-800">
                No visitor passes yet
              </p>
              <p className="mt-2 text-sm text-stone-600">
                Your created visitor passes will appear here.
              </p>
            </div>
          ) : !historyError ? (
            <div className="mt-6 space-y-4">
              {passes.map((pass) => (
                <article
                  key={pass.id}
                  className="rounded-xl border border-stone-200 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-stone-900">
                        {pass.visitorName}
                      </h3>
                      <p className="mt-1 text-sm text-stone-600">
                        Visit date: {pass.visitDate}
                      </p>
                      <p className="mt-1 text-sm text-stone-600">
                        Purpose: {pass.purpose}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        pass.status === "checked_in"
                          ? "bg-green-100 text-green-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {pass.status === "checked_in"
                        ? "Checked In"
                        : pass.status === "pending"
                        ? "Pending"
                        : pass.status || "Unknown"}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-stone-50 p-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                        Access Code
                      </p>
                      <p className="mt-1 break-all text-xl font-bold tracking-widest text-stone-900">
                        {pass.code}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => copyCode(pass.code, pass.id)}
                      className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-100"
                    >
                      {copiedPassId === pass.id ? "Copied!" : "Copy Code"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
