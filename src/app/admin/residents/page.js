"use client";

import { useEffect, useState, useCallback } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import Link from "next/link";

export default function AdminResidentsPage() {
  const router = useRouter();

  const user = useSelector((state) => state.auth.user);
  const authStatus = useSelector((state) => state.auth.authStatus);

  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isAuthorized =
    authStatus === "authenticated" &&
    user?.role === "admin" &&
    user?.active === true;

  // Redirect users who are not authorized for admin pages.
  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.replace("/login");
      return;
    }

    if (authStatus === "authenticated" && user) {
      if (user.role !== "admin") {
        router.replace(
          user.active === true
            ? "/resident/dashboard"
            : "/pending-approval"
        );
      } else if (user.active !== true) {
        router.replace("/pending-approval");
      }
    }
  }, [authStatus, user, router]);

  const loadResidents = useCallback(async () => {
    if (!isAuthorized) return;

    try {
      setLoading(true);
      setError("");
      setMessage("");

      const residentsQuery = query(
        collection(db, "users"),
        where("active", "==", false),
        where("role", "==", "resident")
      );

      const snapshot = await getDocs(residentsQuery);

      setResidents(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }))
      );
    } catch (err) {
      console.error("Failed to load residents:", err);
      setError(
        "Could not load residents. Check your Firestore security rules and administrator permissions."
      );
    } finally {
      setLoading(false);
    }
  }, [isAuthorized]);

  useEffect(() => {
    if (isAuthorized) {
      loadResidents();
    }
  }, [isAuthorized, loadResidents]);

  async function handleApprove(resident) {
    if (!isAuthorized) {
      setError("You are not authorized to approve residents.");
      return;
    }

    const confirmed = window.confirm(
      `Approve ${resident.name || resident.email || "this resident"}?`
    );

    if (!confirmed) return;

    try {
      setApprovingId(resident.id);
      setError("");
      setMessage("");

      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error("Please sign in again.");
      }

      // Refresh the signed-in user's Firebase ID token.
      await currentUser.getIdToken(true);

      await updateDoc(doc(db, "users", resident.id), {
        active: true,
      });

      setResidents((current) =>
        current.filter((item) => item.id !== resident.id)
      );

      setMessage(
        `${resident.name || resident.email || "Resident"} has been approved.`
      );
    } catch (err) {
      console.error("Resident approval failed:", err);

      setError(
        err.code === "permission-denied"
          ? "Permission denied. Verify that your Firestore rules allow an active admin to approve residents."
          : err.message || "Could not approve this resident."
      );
    } finally {
      setApprovingId(null);
    }
  }

  // Wait until Firebase authentication and the Firestore profile are checked.
  if (
    authStatus === "checking" ||
    authStatus === "loading" ||
    !isAuthorized
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-100 px-6">
        <p className="text-stone-700">Checking administrator access...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin"
          className="text-sm font-semibold text-amber-800 hover:underline"
        >
          ← Back to Dashboard
        </Link>

        ```jsx
<div className="mt-6 flex flex-wrap items-center justify-between gap-4">
  <div>
    <p className="text-sm font-semibold uppercase tracking-widest text-amber-700">
      GateKeeper Administration
    </p>

    <h1 className="mt-2 text-3xl font-bold text-stone-900">
      Pending Residents
    </h1>

    <p className="mt-2 text-stone-600">
      Review registrations and approve resident accounts.
    </p>
  </div>

  <div className="flex flex-wrap gap-3">
    <Link
      href="/admin/residents/manage"
      className="rounded-lg bg-amber-800 px-4 py-2 font-semibold text-white hover:bg-amber-900"
    >
      Manage Residents
    </Link>

    <button
      onClick={loadResidents}
      disabled={loading || approvingId !== null}
      className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
    >
      {loading ? "Refreshing..." : "Refresh"}
    </button>
  </div>
</div>
```

        {message && (
          <p
            role="status"
            className="mt-6 rounded-lg bg-green-50 p-4 text-green-800"
          >
            {message}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-lg bg-red-50 p-4 text-red-700"
          >
            {error}
          </p>
        )}

        {loading && (
          <p className="mt-8 text-stone-600">Loading residents...</p>
        )}

        {!loading && !error && residents.length === 0 && (
          <div className="mt-8 rounded-xl bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-stone-900">
              No pending residents
            </h2>

            <p className="mt-2 text-stone-600">
              Residents awaiting approval will appear here.
            </p>
          </div>
        )}

        {!loading && residents.length > 0 && (
          <div className="mt-8 overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-200 text-stone-700">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>

              <tbody>
                {residents.map((resident) => (
                  <tr key={resident.id} className="border-t border-stone-200">
                    <td className="p-4 font-medium text-stone-900">
                      {resident.name || "Not provided"}
                    </td>

                    <td className="p-4 text-stone-600">
                      {resident.email || "Not provided"}
                    </td>

                    <td className="p-4">
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                        Pending
                      </span>
                    </td>

                    <td className="p-4">
                      <button
                        onClick={() => handleApprove(resident)}
                        disabled={approvingId !== null}
                        className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {approvingId === resident.id
                          ? "Approving..."
                          : "Approve"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}