"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import Link from "next/link";
import {
  collection,
  getDocs,
  orderBy,
  query,
  limit,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function AdminGateLogsPage() {
  const router = useRouter();

  const user = useSelector((state) => state.auth.user);
  const authStatus = useSelector((state) => state.auth.authStatus);

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 20;

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
        return;
      }

      if (user.active !== true) {
        router.replace("/pending-approval");
      }
    }
  }, [authStatus, user, router]);

  const loadLogs = useCallback(async () => {
    const currentUser = auth.currentUser;

    if (
      authStatus !== "authenticated" ||
      !user ||
      user.role !== "admin" ||
      user.active !== true ||
      !currentUser ||
      currentUser.uid !== user.uid
    ) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const logsQuery = query(
        collection(db, "gateLogs"),
        orderBy("checkedInAt", "desc"),
        limit(100)
      );

      const snapshot = await getDocs(logsQuery);

      setLogs(
        snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }))
      );
    } catch (err) {
      console.error("Failed to load gate logs:", err);

      if (err.code === "permission-denied") {
        setError("Permission denied. Check your Firestore security rules.");
      } else {
        setError("Unable to load gate logs. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [authStatus, user]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
  const search = searchTerm.trim().toLowerCase();

  return logs.filter((log) => {
    const matchesSearch =
      !search ||
      [
        log.visitorName,
        log.residentName,
        log.code,
        log.purpose,
        log.checkedInBy,
        log.status,
      ].some((value) =>
        String(value ?? "").toLowerCase().includes(search)
      );

    const matchesDate =
      !selectedDate ||
      (log.checkedInAt?.toDate &&
        (() => {
          const date = log.checkedInAt.toDate();
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");

          return `${year}-${month}-${day}` === selectedDate;
        })());

    return matchesSearch && matchesDate;
  });
}, [logs, searchTerm, selectedDate]);

const totalPages = Math.max(
  1,
  Math.ceil(filteredLogs.length / recordsPerPage)
);

const paginatedLogs = useMemo(() => {
  const startIndex = (currentPage - 1) * recordsPerPage;

  return filteredLogs.slice(
    startIndex,
    startIndex + recordsPerPage
  );
}, [filteredLogs, currentPage]);

const firstRecord =
  filteredLogs.length === 0
    ? 0
    : (currentPage - 1) * recordsPerPage + 1;

const lastRecord = Math.min(
  currentPage * recordsPerPage,
  filteredLogs.length
);

  function formatDate(timestamp) {
    if (!timestamp?.toDate) {
      return "Time unavailable";
    }

    return timestamp.toDate().toLocaleString();
  }

  
function exportToCSV() {
  if (filteredLogs.length === 0) {
    return;
  }

  const headers = [
    "Visitor Name",
    "Visitor Code",
    "Resident Name",
    "Purpose",
    "Checked In By",
    "Check-in Time",
    "Status",
  ];

  const rows = filteredLogs.map((log) => [
    log.visitorName || "Not provided",
    log.code || "Unavailable",
    log.residentName || "Not provided",
    log.purpose || "Not provided",
    log.checkedInBy || "Unavailable",
    formatDate(log.checkedInAt),
    log.status || "checked_in",
  ]);

  const escapeCSV = (value) => {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  };

  const csvContent = [
    headers.map(escapeCSV).join(","),
    ...rows.map((row) => row.map(escapeCSV).join(",")),
  ].join("\r\n");

  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `gate-logs-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}


  if (
    authStatus !== "authenticated" ||
    !user ||
    user.role !== "admin" ||
    user.active !== true
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-100">
        <p className="text-stone-700">
          Checking administrator account...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-amber-800">
              GateKeeper Estate Management
            </p>

            <h1 className="mt-3 text-3xl font-bold text-stone-900 sm:text-4xl">
              Gate Logs
            </h1>

            <p className="mt-2 text-stone-600">
              Review and search recorded visitor check-ins.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadLogs}
              disabled={loading}
              className="rounded-lg bg-amber-800 px-4 py-3 font-semibold text-white transition hover:bg-amber-900 disabled:opacity-60"
            >
              {loading ? "Refreshing..." : "Refresh Logs"}
            </button>

            
<button
  type="button"
  onClick={exportToCSV}
  disabled={loading || filteredLogs.length === 0}
  className="rounded-lg bg-green-700 px-4 py-3 font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
>
  Export CSV
</button>


            <Link
              href="/admin"
              className="rounded-lg border border-stone-300 bg-white px-4 py-3 font-semibold text-stone-800 transition hover:bg-stone-50"
            >
              Back to Dashboard
            </Link>
          </div>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-stone-500">
              Records loaded
            </p>
            <p className="mt-2 text-3xl font-bold text-stone-900">
              {logs.length}
            </p>
            <p className="mt-1 text-sm text-stone-500">
              Latest 100 check-in records.
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-stone-500">
              Matching records
            </p>
            <p className="mt-2 text-3xl font-bold text-stone-900">
              {filteredLogs.length}
            </p>
            <p className="mt-1 text-sm text-stone-500">
              Records matching your search.
            </p>
          </div>
        </section>

        
<section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
  <div className="grid gap-5 md:grid-cols-2">
    <div>
      <label
        htmlFor="gate-log-search"
        className="mb-2 block text-sm font-semibold text-stone-800"
      >
        Search visitor records
      </label>

      <input
        id="gate-log-search"
        type="search"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder="Visitor, resident, code, or purpose..."
        className="w-full rounded-lg border border-stone-300 px-4 py-3 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
      />
    </div>

    <div>
      <label
        htmlFor="gate-log-date"
        className="mb-2 block text-sm font-semibold text-stone-800"
      >
        Filter by check-in date
      </label>

      <input
        id="gate-log-date"
        type="date"
        value={selectedDate}
        onChange={(event) => setSelectedDate(event.target.value)}
        className="w-full rounded-lg border border-stone-300 px-4 py-3 text-stone-900 outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-100"
      />
    </div>
  </div>

  {(searchTerm || selectedDate) && (
    <button
      type="button"
      onClick={() => {
        setSearchTerm("");
        setSelectedDate("");
      }}
      className="mt-4 rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
    >
      Clear Filters
    </button>
  )}
</section>


        {error && (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-10 text-center text-stone-600">
              Loading gate logs...
            </div>
          ) : error ? (
            <div className="p-10 text-center text-stone-600">
              Please resolve the error above and refresh the logs.
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-lg font-semibold text-stone-900">
                {logs.length === 0
                  ? "No gate logs found"
                  : "No matching records"}
              </p>
              <p className="mt-2 text-sm text-stone-600">
                {logs.length === 0
                  ? "New records will appear here after visitors are checked in."
                  : "Try another visitor name, resident name, code, or purpose."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-stone-50 text-stone-600">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Visitor</th>
                    <th className="px-5 py-4 font-semibold">Visitor Code</th>
                    <th className="px-5 py-4 font-semibold">Resident</th>
                    <th className="px-5 py-4 font-semibold">Purpose</th>
                    <th className="px-5 py-4 font-semibold">Checked In By</th>
                    <th className="px-5 py-4 font-semibold">Check-in Time</th>
                    <th className="px-5 py-4 font-semibold">Status</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-stone-100">
                  {paginatedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-stone-50">
                      <td className="px-5 py-4 font-semibold text-stone-900">
                        {log.visitorName || "Not provided"}
                      </td>

                      <td className="px-5 py-4 font-mono text-xs text-stone-700">
                        {log.code || "Unavailable"}
                      </td>

                      <td className="px-5 py-4 text-stone-700">
                        {log.residentName || "Not provided"}
                      </td>

                      <td className="px-5 py-4 text-stone-700">
                        {log.purpose || "Not provided"}
                      </td>

                      <td className="px-5 py-4 font-mono text-xs text-stone-600">
                        {log.checkedInBy || "Unavailable"}
                      </td>

                      <td className="px-5 py-4 text-stone-700">
                        {formatDate(log.checkedInAt)}
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                          {log.status || "checked_in"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        
{filteredLogs.length > 0 && !loading && !error && (
  <div className="mt-4 flex flex-col items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white p-4 sm:flex-row">
    <p className="text-sm text-stone-600">
      Showing{" "}
      <span className="font-semibold text-stone-900">
        {firstRecord}–{lastRecord}
      </span>{" "}
      of{" "}
      <span className="font-semibold text-stone-900">
        {filteredLogs.length}
      </span>{" "}
      records
    </p>

    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() =>
          setCurrentPage((page) => Math.max(1, page - 1))
        }
        disabled={currentPage === 1}
        className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Previous
      </button>

      <span className="text-sm font-medium text-stone-700">
        Page {currentPage} of {totalPages}
      </span>

      <button
        type="button"
        onClick={() =>
          setCurrentPage((page) =>
            Math.min(totalPages, page + 1)
          )
        }
        disabled={currentPage >= totalPages}
        className="rounded-lg bg-amber-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>
    </div>
  </div>
)}


        <footer className="mt-8 text-center text-sm text-stone-500">
          GateKeeper Administration · Visitor Entry History
        </footer>
      </div>
    </main>
  );
}