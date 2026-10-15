
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function AdminInvitesPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [invites, setInvites] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [copiedInvite, setCopiedInvite] = useState("");
  const [updatingStaff, setUpdatingStaff] = useState("");

  useEffect(() => {
    let unsubscribeInvites;
    let unsubscribeStaff;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);

      unsubscribeInvites?.();
      unsubscribeStaff?.();

      if (!user) {
        setInvites([]);
        setStaff([]);
        setLoading(false);
        setError("Please sign in with your estate admin account.");
        return;
      }

      setLoading(true);
      setError("");

      unsubscribeInvites = onSnapshot(
        collection(db, "invites"),
        (snapshot) => {
          const invitationList = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));

          invitationList.sort((a, b) => {
            const aTime = a.invitedAt?.toMillis?.() || 0;
            const bTime = b.invitedAt?.toMillis?.() || 0;
            return bTime - aTime;
          });

          setInvites(invitationList);
          setLoading(false);
        },
        (err) => {
          console.error("Invitations listener:", err);
          setError(
            "Could not load invitations. Check your admin permissions."
          );
          setLoading(false);
        }
      );

      const staffQuery = query(
        collection(db, "users"),
        where("role", "==", "security")
      );

      unsubscribeStaff = onSnapshot(
        staffQuery,
        (snapshot) => {
          const staffList = snapshot.docs.map((item) => ({
            uid: item.id,
            ...item.data(),
          }));

          staffList.sort((a, b) =>
            (a.name || "").localeCompare(b.name || "")
          );

          setStaff(staffList);
        },
        (err) => {
          console.error("Security staff listener:", err);
          setError(
            "Could not load security staff. Check your admin permissions."
          );
        }
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeInvites?.();
      unsubscribeStaff?.();
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    setMessage("");
    setError("");

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || !cleanEmail) {
      setError("Enter the staff member's name and email address.");
      return;
    }

    if (!currentUser) {
      setError("Please sign in before creating an invitation.");
      return;
    }

    setCreating(true);

    try {
      const token = await currentUser.getIdToken();

      // Existing invitation API is retained.
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || result.message || "Could not create invitation."
        );
      }

      setName("");
      setEmail("");
      setCopiedInvite(result.inviteId || "");
      setMessage(
        `Invitation created. Code: ${result.inviteId}. Copy this code and share it with the invited staff member.`
      );
    } catch (err) {
      console.error("Create invitation:", err);
      setError(err.message || "Could not create invitation.");
    } finally {
      setCreating(false);
    }
  }

  async function copyInvite(inviteId) {
    try {
      await navigator.clipboard.writeText(inviteId);
      setCopiedInvite(inviteId);
      setMessage("Invitation code copied.");
      setError("");
    } catch (err) {
      console.error("Copy invitation:", err);
      setError(`Copy failed. Please copy this code manually: ${inviteId}`);
    }
  }

  async function handleDeleteInvite(invite) {
    const confirmed = window.confirm(
      `Delete the invitation for ${invite.email}?`
    );

    if (!confirmed) return;

    setMessage("");
    setError("");

    try {
      await deleteDoc(doc(db, "invites", invite.id));
      setMessage("Invitation deleted successfully.");
    } catch (err) {
      console.error("Delete invitation:", err);
      setError("Could not delete this invitation. Check admin permissions.");
    }
  }

  // Duty status is updated directly in Firestore.
  async function handleToggleDuty(member) {
    const currentlyActive = member.active !== false;
    const nextActive = !currentlyActive;

    const action = nextActive ? "return to duty" : "remove from duty";
    const displayName = member.name || member.email || "this staff member";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${displayName}?`
    );

    if (!confirmed) return;

    setUpdatingStaff(member.uid);
    setMessage("");
    setError("");

    try {
      if (!currentUser) {
        throw new Error("Please sign in again.");
      }

      // Recheck the signed-in user's Firestore role before changing staff.
      const adminSnapshot = await import("firebase/firestore").then(
        ({ getDoc }) => getDoc(doc(db, "users", currentUser.uid))
      );

      const adminData = adminSnapshot.data();

      if (
        !adminSnapshot.exists() ||
        adminData?.role !== "admin" ||
        adminData?.active !== true
      ) {
        throw new Error("Only an active estate administrator can manage staff.");
      }

      // Ensure this document is still a security staff account.
      const staffRef = doc(db, "users", member.uid);
      const staffSnapshot = await import("firebase/firestore").then(
        ({ getDoc }) => getDoc(staffRef)
      );

      if (
        !staffSnapshot.exists() ||
        staffSnapshot.data()?.role !== "security"
      ) {
        throw new Error("Security staff account not found.");
      }

      await updateDoc(staffRef, {
        active: nextActive,
        dutyStatus: nextActive ? "on-duty" : "no-duty",
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

      setMessage(
        `${displayName} has been ${
          nextActive ? "returned to duty" : "removed from duty"
        }.`
      );
    } catch (err) {
      console.error("Update security duty:", err);
      setError(
        err.code === "permission-denied"
          ? "Permission denied. Check your Firestore security rules for admin staff updates."
          : err.message || "Could not update duty status."
      );
    } finally {
      setUpdatingStaff("");
    }
  }

  function getInviteStatus(invite) {
    if (invite.status === "used" || invite.used === true) return "Used";
    if (invite.status === "registering") return "Registering";

    if (invite.status === "pending" || !invite.status) {
      const expiresAt = invite.expiresAt?.toDate?.();

      if (expiresAt && expiresAt.getTime() < Date.now()) {
        return "Expired";
      }

      return "Pending";
    }

    return invite.status;
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] px-4 py-10 text-[#3e2d22] sm:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-[#786657]">
            Loading security management...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-4 py-8 text-[#3e2d22] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col justify-between gap-4 border-b border-[#dfd2c3] pb-6 sm:flex-row sm:items-center">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-[#98775c]">
              GateKeeper Estate Management
            </p>
            <h1 className="text-3xl font-bold sm:text-4xl">
              Security Management
            </h1>
            <p className="mt-2 text-sm text-[#786657]">
              Invite security personnel and manage their duty status.
            </p>
          </div>

          <a
            href="/admin"
            className="inline-flex w-fit items-center rounded-xl border border-[#d8c6b4] bg-white px-4 py-3 text-sm font-semibold transition hover:bg-[#eee3d7]"
          >
            Back to Dashboard
          </a>
        </header>

        {message && (
          <div
            role="status"
            className="mb-5 rounded-xl border border-[#b9cbb5] bg-[#edf4e9] px-4 py-3 text-sm text-[#315b35]"
          >
            {message}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-[#e4bdb5] bg-[#fff0ed] px-4 py-3 text-sm text-[#963c2e]"
          >
            {error}
          </div>
        )}

        <section className="mb-8 rounded-2xl border border-[#e3d6c8] bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6">
            <h2 className="text-xl font-bold">Invite Security Staff</h2>
            <p className="mt-1 text-sm text-[#786657]">
              Create a one-time invitation code that expires after 24 hours.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="staffName"
                className="mb-2 block text-sm font-semibold"
              >
                Full name
              </label>
              <input
                id="staffName"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter staff member's name"
                required
                className="w-full rounded-xl border border-[#ddcdbc] bg-[#fdfbf8] px-4 py-3 outline-none transition placeholder:text-[#a8998b] focus:border-[#8b6245] focus:ring-2 focus:ring-[#8b6245]/15"
              />
            </div>

            <div>
              <label
                htmlFor="staffEmail"
                className="mb-2 block text-sm font-semibold"
              >
                Email address
              </label>
              <input
                id="staffEmail"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="security@example.com"
                required
                className="w-full rounded-xl border border-[#ddcdbc] bg-[#fdfbf8] px-4 py-3 outline-none transition placeholder:text-[#a8998b] focus:border-[#8b6245] focus:ring-2 focus:ring-[#8b6245]/15"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-[#67452f] px-6 py-3 font-semibold text-white transition hover:bg-[#503522] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Creating invitation..." : "Create Invitation"}
              </button>
            </div>
          </form>
        </section>

        <section className="mb-8 rounded-2xl border border-[#e3d6c8] bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold">Security Invitations</h2>
              <p className="mt-1 text-sm text-[#786657]">
                Copy the invitation code and share it with the invited person.
              </p>
            </div>
            <span className="w-fit rounded-full bg-[#f0e6da] px-3 py-1 text-xs font-bold text-[#67452f]">
              {invites.length} total
            </span>
          </div>

          {invites.length === 0 ? (
            <p className="rounded-xl bg-[#faf6f1] px-4 py-6 text-sm text-[#786657]">
              No invitations created yet.
            </p>
          ) : (
            <div className="space-y-4">
              {invites.map((invite) => {
                const status = getInviteStatus(invite);

                return (
                  <div
                    key={invite.id}
                    className="rounded-xl border border-[#e6dbcf] bg-[#fdfbf8] p-4 sm:p-5"
                  >
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div className="min-w-0">
                        <h3 className="break-words font-bold">
                          {invite.name || "Invited staff member"}
                        </h3>
                        <p className="mt-1 break-all text-sm text-[#786657]">
                          {invite.email}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[#eee3d7] px-3 py-1 text-xs font-semibold text-[#67452f]">
                            Security
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              status === "Used"
                                ? "bg-[#e1eee0] text-[#315b35]"
                                : status === "Expired"
                                  ? "bg-[#fbe6df] text-[#963c2e]"
                                  : "bg-[#f4ecd8] text-[#846323]"
                            }`}
                          >
                            {status}
                          </span>
                        </div>

                        <p className="mt-3 break-all text-xs text-[#786657]">
                          Invitation code:{" "}
                          <span className="font-mono font-semibold">
                            {invite.id}
                          </span>
                        </p>

                        {invite.expiresAt?.toDate && (
                          <p className="mt-1 text-xs text-[#786657]">
                            Expires:{" "}
                            {invite.expiresAt.toDate().toLocaleString()}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {status === "Pending" && (
                          <button
                            type="button"
                            onClick={() => copyInvite(invite.id)}
                            className="rounded-lg bg-[#67452f] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#503522]"
                          >
                            {copiedInvite === invite.id
                              ? "Copy Again"
                              : "Copy Code"}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteInvite(invite)}
                          className="rounded-lg border border-[#e1bcb3] px-3 py-2 text-sm font-semibold text-[#963c2e] transition hover:bg-[#fff0ed]"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[#e3d6c8] bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold">Registered Security Staff</h2>
              <p className="mt-1 text-sm text-[#786657]">
                Manage who is on duty. Staff records are kept when duty status changes.
              </p>
            </div>
            <span className="w-fit rounded-full bg-[#f0e6da] px-3 py-1 text-xs font-bold text-[#67452f]">
              {staff.length} staff
            </span>
          </div>

          {staff.length === 0 ? (
            <p className="rounded-xl bg-[#faf6f1] px-4 py-6 text-sm text-[#786657]">
              No registered security staff found.
            </p>
          ) : (
            <div className="space-y-4">
              {staff.map((member) => {
                const active = member.active !== false;
                const busy = updatingStaff === member.uid;

                return (
                  <div
                    key={member.uid}
                    className="flex flex-col justify-between gap-4 rounded-xl border border-[#e6dbcf] bg-[#fdfbf8] p-4 sm:flex-row sm:items-center sm:p-5"
                  >
                    <div className="min-w-0">
                      <h3 className="break-words font-bold">
                        {member.name || "Security staff member"}
                      </h3>
                      <p className="mt-1 break-all text-sm text-[#786657]">
                        {member.email}
                      </p>
                      <span
                        className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          active
                            ? "bg-[#e1eee0] text-[#315b35]"
                            : "bg-[#f4e4df] text-[#963c2e]"
                        }`}
                      >
                        {active ? "On Duty" : "No Duty"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleDuty(member)}
                      disabled={busy}
                      className={`rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        active
                          ? "border border-[#e1bcb3] text-[#963c2e] hover:bg-[#fff0ed]"
                          : "bg-[#67452f] text-white hover:bg-[#503522]"
                      }`}
                    >
                      {busy
                        ? "Updating..."
                        : active
                          ? "Remove from Duty"
                          : "Return to Duty"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
