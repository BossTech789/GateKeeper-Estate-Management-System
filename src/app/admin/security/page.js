
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function AdminSecurityPage() {
  const router = useRouter();

  const user = useSelector((state) => state.auth.user);
  const authStatus = useSelector((state) => state.auth.authStatus);

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
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

  const loadStaff = useCallback(async () => {
    if (!isAuthorized) return;

    try {
      setLoading(true);
      setError("");
      setMessage("");

      const staffQuery = query(
        collection(db, "users"),
        where("role", "==", "security")
      );

      const snapshot = await getDocs(staffQuery);

      setStaff(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }))
      );
    } catch (err) {
      console.error("Failed to load security staff:", err);

      setError(
        err.code === "permission-denied"
          ? "Permission denied. Check that your Firestore rules allow administrators to list user profiles."
          : "Could not load security staff. Check your Firestore connection and permissions."
      );
    } finally {
      setLoading(false);
    }
  }, [isAuthorized]);

  useEffect(() => {
    if (isAuthorized) {
      loadStaff();
    }
  }, [isAuthorized, loadStaff]);

  async function handleDutyChange(member) {
    if (!isAuthorized) {
      setError("You are not authorized to manage security staff.");
      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser) {
      setError("Please sign in again.");
      return;
    }

    const nextActive = member.dutyStatus !== "on-duty";
    const nextStatus = nextActive ? "on-duty" : "no-duty";

    const confirmed = window.confirm(
      `${nextActive ? "Put" : "Take"} ${
        member.name || member.email || "this staff member"
      } ${nextActive ? "on duty" : "off duty"}?`
    );

    if (!confirmed) return;

    try {
      setUpdatingId(member.id);
      setError("");
      setMessage("");

      await updateDoc(doc(db, "users", member.id), {
        active: member.active === true,
        dutyStatus: nextStatus,
        dutyStatusUpdatedAt: serverTimestamp(),
        dutyStatusUpdatedBy: currentUser.uid,
        ...(nextActive
          ? {
              returnedToDutyAt: serverTimestamp(),
              returnedToDutyBy: currentUser.uid,
            }
          : {
              deactivatedAt: serverTimestamp(),
              deactivatedBy: currentUser.uid,
            }),
      });

      setStaff((current) =>
        current.map((item) =>
          item.id === member.id
            ? { ...item, dutyStatus: nextStatus }
            : item
        )
      );

      setMessage(
        `${member.name || member.email || "Security staff"} is now ${
          nextActive ? "on duty" : "off duty"
        }.`
      );
    } catch (err) {
      console.error("Failed to update duty status:", err);

      setError(
        err.code === "permission-denied"
          ? "Permission denied. Check the users section of your Firestore rules for security duty-status updates."
          : err.message || "Could not update this staff member's duty status."
      );
    } finally {
      setUpdatingId(null);
    }
  }

  const filteredStaff = staff.filter((member) => {
    const searchText = [
      member.name,
      member.email,
      member.phone,
      member.address,
      member.unit,
      member.dutyStatus,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = searchText.includes(search.toLowerCase());

    const dutyStatus =
      member.dutyStatus ||
      (member.active === true ? "on-duty" : "no-duty");

    const matchesStatus =
      statusFilter === "all" || dutyStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

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
              Security Staff
            </h1>

            <p className="mt-2 text-stone-600">
              View staff profiles and manage duty status.
            </p>
          </div>

          <button
            onClick={loadStaff}
            disabled={loading || updatingId !== null}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Total Staff</p>
            <p className="mt-2 text-3xl font-bold text-stone-900">
              {staff.length}
            </p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">On Duty</p>
            <p className="mt-2 text-3xl font-bold text-green-700">
              {
                staff.filter(
                  (member) => member.dutyStatus === "on-duty"
                ).length
              }
            </p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Off Duty</p>
            <p className="mt-2 text-3xl font-bold text-amber-700">
              {
                staff.filter(
                  (member) =>
                    member.dutyStatus !== "on-duty"
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
            placeholder="Search staff by name, email, phone, or unit..."
            className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-stone-300 bg-white px-4 py-3 text-stone-800 outline-none focus:border-amber-700"
          >
            <option value="all">All duty statuses</option>
            <option value="on-duty">On Duty</option>
            <option value="no-duty">Off Duty</option>
          </select>
        </div>

        {loading ? (
          <p className="mt-8 text-stone-600">
            Loading security staff...
          </p>
        ) : !error && filteredStaff.length === 0 ? (
          <div className="mt-8 rounded-xl border border-stone-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-stone-900">
              No security staff found
            </h2>
            <p className="mt-2 text-stone-600">
              Invited security staff profiles will appear here.
            </p>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-stone-200 text-stone-700">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Phone</th>
                  <th className="p-4">Account</th>
                  <th className="p-4">Duty Status</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredStaff.map((member) => {
                  const isOnDuty = member.dutyStatus === "on-duty";

                  return (
                    <tr
                      key={member.id}
                      className="border-t border-stone-200"
                    >
                      <td className="p-4 font-semibold text-stone-900">
                        {member.name || "Not provided"}
                      </td>

                      <td className="p-4 text-stone-600">
                        {member.email || "—"}
                      </td>

                      <td className="p-4 text-stone-600">
                        {member.phone || "—"}
                      </td>

                      <td className="p-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            member.active === true
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {member.active === true
                            ? "Active"
                            : "Inactive"}
                        </span>
                      </td>

                      <td className="p-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            isOnDuty
                              ? "bg-green-100 text-green-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {isOnDuty ? "On Duty" : "Off Duty"}
                        </span>
                      </td>

                      <td className="p-4">
                        <button
                          onClick={() => handleDutyChange(member)}
                          disabled={
                            updatingId !== null ||
                            member.active !== true
                          }
                          className={`rounded-lg px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                            isOnDuty
                              ? "bg-amber-700 hover:bg-amber-800"
                              : "bg-green-700 hover:bg-green-800"
                          }`}
                          title={
                            member.active !== true
                              ? "This account is inactive"
                              : ""
                          }
                        >
                          {updatingId === member.id
                            ? "Updating..."
                            : isOnDuty
                            ? "Set Off Duty"
                            : "Set On Duty"}
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
          Showing {filteredStaff.length} of {staff.length} security staff.
        </p>
      </div>
    </main>
  );
}
