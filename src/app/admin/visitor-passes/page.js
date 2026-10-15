
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function AdminVisitorPassesPage() {
  const router = useRouter();

  const user = useSelector((state) => state.auth.user);
  const authStatus = useSelector((state) => state.auth.authStatus);

  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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

  const loadPasses = useCallback(async () => {
    if (!isAuthorized) return;

    try {
      setLoading(true);
      setError("");
      setMessage("");

      const passesQuery = query(
        collection(db, "visitorPasses"),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(passesQuery);

      setPasses(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }))
      );
    } catch (err) {
      console.error("Failed to load visitor passes:", err);

      setError(
        err.code === "permission-denied"
          ? "Permission denied. Check that your Firestore rules allow administrators to read visitor passes."
          : "Could not load visitor passes. Check your Firestore connection and rules."
      );
    } finally {
      setLoading(false);
    }
  }, [isAuthorized]);

  useEffect(() => {
    if (isAuthorized) {
      loadPasses();
    }
  }, [isAuthorized, loadPasses]);

  async function handleDelete(pass) {
    if (!isAuthorized) {
      setError("You are not authorized to delete visitor passes.");
      return;
    }

    const confirmed = window.confirm(
      `Delete the visitor pass for ${
        pass.visitorName || pass.visitor || "this visitor"
      }? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeletingId(pass.id);
      setError("");
      setMessage("");

      if (!auth.currentUser) {
        throw new Error("Please sign in again.");
      }

      await deleteDoc(doc(db, "visitorPasses", pass.id));

      setPasses((current) =>
        current.filter((item) => item.id !== pass.id)
      );

      setMessage("Visitor pass deleted successfully.");
    } catch (err) {
      console.error("Failed to delete visitor pass:", err);

      setError(
        err.code === "permission-denied"
          ? "Permission denied. Check your Firestore rules for administrator visitor-pass deletion."
          : err.message || "Could not delete this visitor pass."
      );
    } finally {
      setDeletingId(null);
    }
  }

  const filteredPasses = passes.filter((pass) => {
    const searchText = [
      pass.visitorName,
      pass.visitor,
      pass.visitorEmail,
      pass.visitorPhone,
      pass.unit,
      pass.address,
      pass.code,
      pass.passCode,
      pass.residentName,
      pass.residentEmail,
      pass.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = searchText.includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      String(pass.status || "pending").toLowerCase() ===
        statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  function formatDate(value) {
    if (!value) return "—";

    const date = value?.toDate
      ? value.toDate()
      : new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString();
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
    <main className="min-h-screen bg-stone-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
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
              Visitor Passes
            </h1>

            <p className="mt-2 text-stone-600">
              View, search, and manage visitor access passes across the estate.
            </p>
          </div>

          <button
            onClick={loadPasses}
            disabled={loading || deletingId !== null}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Total Passes</p>
            <p className="mt-2 text-3xl font-bold text-stone-900">
              {passes.length}
            </p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Pending</p>
            <p className="mt-2 text-3xl font-bold text-amber-700">
              {
                passes.filter(
                  (pass) =>
                    String(pass.status || "pending").toLowerCase() ===
                    "pending"
                ).length
              }
            </p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Checked In</p>
            <p className="mt-2 text-3xl font-bold text-green-700">
              {
                passes.filter((pass) =>
                  ["checked-in", "checked_in", "checked in", "used"].includes(
                    String(pass.status || "").toLowerCase()
                  )
                ).length
              }
            </p>
          </div>
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

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search visitor, resident, unit, or pass code..."
            className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-stone-300 bg-white px-4 py-3 text-stone-800 outline-none focus:border-amber-700"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="checked-in">Checked In</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        {loading ? (
          <p className="mt-8 text-stone-600">
            Loading visitor passes...
          </p>
        ) : !error && filteredPasses.length === 0 ? (
          <div className="mt-8 rounded-xl border border-stone-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-stone-900">
              No visitor passes found
            </h2>
            <p className="mt-2 text-stone-600">
              Visitor passes will appear here when available.
            </p>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-stone-200 text-stone-700">
                <tr>
                  <th className="p-4">Visitor</th>
                  <th className="p-4">Resident</th>
                  <th className="p-4">Unit</th>
                  <th className="p-4">Pass Code</th>
                  <th className="p-4">Valid Until</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Created</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredPasses.map((pass) => {
                  const status = String(
                    pass.status || "pending"
                  ).toLowerCase();

                  const statusClass =
                    status === "approved"
                      ? "bg-green-100 text-green-800"
                      : ["checked-in", "checked_in", "checked in", "used"].includes(
                          status
                        )
                      ? "bg-blue-100 text-blue-800"
                      : status === "expired"
                      ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800";

                  return (
                    <tr
                      key={pass.id}
                      className="border-t border-stone-200"
                    >
                      <td className="p-4">
                        <p className="font-semibold text-stone-900">
                          {pass.visitorName || pass.visitor || "Not provided"}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {pass.visitorPhone || pass.visitorEmail || "—"}
                        </p>
                      </td>

                      <td className="p-4 text-stone-700">
                        {pass.residentName ||
                          pass.residentEmail ||
                          pass.residentId ||
                          "—"}
                      </td>

                      <td className="p-4 text-stone-700">
                        {pass.unit || pass.address || "—"}
                      </td>

                      <td className="p-4 font-mono text-stone-800">
                        {pass.code || pass.passCode || "—"}
                      </td>

                      <td className="p-4 text-stone-600">
                        {formatDate(
                          pass.validUntil || pass.expiresAt
                        )}
                      </td>

                      <td className="p-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}
                        >
                          {status.replace(/[-_]/g, " ")}
                        </span>
                      </td>

                      <td className="p-4 text-stone-600">
                        {formatDate(pass.createdAt)}
                      </td>

                      <td className="p-4">
                        <button
                          onClick={() => handleDelete(pass)}
                          disabled={deletingId !== null}
                          className="rounded-lg bg-red-700 px-3 py-2 font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === pass.id
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-sm text-stone-500">
          Showing {filteredPasses.length} of {passes.length} visitor passes.
        </p>
      </div>
    </main>
  );
}
