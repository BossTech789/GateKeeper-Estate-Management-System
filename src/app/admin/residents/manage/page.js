
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import Link from "next/link";

export default function ManageResidentsPage() {
  const router = useRouter();

  const user = useSelector((state) => state.auth.user);
  const authStatus = useSelector((state) => state.auth.authStatus);

  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isAuthorized =
    authStatus === "authenticated" &&
    user?.role === "admin" &&
    user?.active === true;

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

      const residentsQuery = query(
        collection(db, "users"),
        where("role", "==", "resident"),
        where("active", "==", true)
      );

      const snapshot = await getDocs(residentsQuery);

      setResidents(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }))
      );
    } catch (err) {
      console.error("Failed to load approved residents:", err);

      setError(
        "Could not load residents. Check your Firestore rules and administrator permissions."
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

  async function handleDisapprove(resident) {
    if (!isAuthorized) {
      setError("You are not authorized to manage residents.");
      return;
    }

    const residentName =
      resident.name || resident.email || "this resident";

    const confirmed = window.confirm(
      `Disapprove ${residentName}?\n\n` +
        "They will be removed from the approved residents list. " +
        "Their profile and historical estate records will be retained. " +
        "This does not delete or disable their Firebase Authentication account."
    );

    if (!confirmed) return;

    try {
      setProcessingId(resident.id);
      setError("");
      setMessage("");

      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error("Please sign in again.");
      }

      await currentUser.getIdToken(true);

      await updateDoc(doc(db, "users", resident.id), {
        active: false,
        departureStatus: "disapproved",
        disapprovedAt: serverTimestamp(),
        disapprovedBy: currentUser.uid,
      });

      setResidents((current) =>
        current.filter((item) => item.id !== resident.id)
      );

      setMessage(
        `${residentName} has been disapproved and removed from the approved residents list.`
      );
    } catch (err) {
      console.error("Resident disapproval failed:", err);

      setError(
        err.code === "permission-denied"
          ? "Permission denied. Your Firestore rules currently may allow admins to change only the active field. We need to update that permission safely."
          : err.message || "Could not disapprove this resident."
      );
    } finally {
      setProcessingId(null);
    }
  }

  if (
    authStatus === "checking" ||
    authStatus === "loading" ||
    !isAuthorized
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-100 px-6">
        <p className="text-stone-700">
          Checking administrator access...
        </p>
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

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-amber-700">
              GateKeeper Administration
            </p>

            <h1 className="mt-2 text-3xl font-bold text-stone-900">
              Manage Residents
            </h1>

            <p className="mt-2 text-stone-600">
              View approved residents and disapprove accounts when residents
              leave the estate.
            </p>
          </div>

          <button
            onClick={loadResidents}
            disabled={loading || processingId !== null}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Disapproving a resident marks their profile inactive and removes
          them from this list. It does not delete their profile, historical
          records, or Firebase Authentication account.
        </div>

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
          <p className="mt-8 text-stone-600">
            Loading approved residents...
          </p>
        )}

        {!loading && !error && residents.length === 0 && (
          <div className="mt-8 rounded-xl bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-stone-900">
              No approved residents
            </h2>

            <p className="mt-2 text-stone-600">
              Approved residents will appear here.
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
                  <th className="p-4">Unit</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>

              <tbody>
                {residents.map((resident) => (
                  <tr
                    key={resident.id}
                    className="border-t border-stone-200"
                  >
                    <td className="p-4 font-medium text-stone-900">
                      {resident.name || "Not provided"}
                    </td>

                    <td className="p-4 text-stone-600">
                      {resident.email || "Not provided"}
                    </td>

                    <td className="p-4 text-stone-600">
                      {resident.unit || resident.address || "Not provided"}
                    </td>

                    <td className="p-4">
                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                        Approved
                      </span>
                    </td>

                    <td className="p-4">
                      <button
                        onClick={() => handleDisapprove(resident)}
                        disabled={processingId !== null}
                        className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {processingId === resident.id
                          ? "Processing..."
                          : "Disapprove"}
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
