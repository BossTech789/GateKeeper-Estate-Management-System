
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import Link from "next/link";
import { signOut } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const initialStats = {
  residents: 0,
  pendingApprovals: 0,
  securityStaff: 0,
  visitorPasses: 0,
};

export default function AdminDashboard() {
  const router = useRouter();

  const user = useSelector((state) => state.auth.user);
  const authStatus = useSelector((state) => state.auth.authStatus);

  const [stats, setStats] = useState(initialStats);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");
  const [signOutError, setSignOutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  // Protect the admin dashboard.
  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.replace("/login");
      return;
    }

    if (authStatus !== "authenticated" || !user) return;

    if (user.active !== true) {
      router.replace("/pending-approval");
      return;
    }

    if (user.role !== "admin") {
      if (user.role === "security") {
        router.replace("/security/dashboard");
      } else if (user.role === "resident") {
        router.replace("/resident/dashboard");
      } else {
        router.replace("/login");
      }
    }
  }, [authStatus, user, router]);

  // Load estate statistics.
  const loadStats = useCallback(async () => {
    const currentUser = auth.currentUser;

    if (
      authStatus !== "authenticated" ||
      !user ||
      user.role !== "admin" ||
      user.active !== true ||
      !currentUser ||
      currentUser.uid !== user.uid
    ) {
      setStatsLoading(
        authStatus === "checking" || authStatus === "loading"
      );
      return;
    }

    setStatsLoading(true);
    setStatsError("");

    try {
      const [
        residentsSnapshot,
        pendingSnapshot,
        securitySnapshot,
        visitorPassesSnapshot,
      ] = await Promise.all([
        getDocs(
          query(
            collection(db, "users"),
            where("role", "==", "resident")
          )
        ),

        getDocs(
          query(
            collection(db, "users"),
            where("role", "==", "resident"),
            where("active", "==", false)
          )
        ),

        getDocs(
          query(
            collection(db, "users"),
            where("role", "==", "security"),
            where("active", "==", true)
          )
        ),

        getDocs(collection(db, "visitorPasses")),
      ]);

      setStats({
        residents: residentsSnapshot.size,
        pendingApprovals: pendingSnapshot.size,
        securityStaff: securitySnapshot.size,
        visitorPasses: visitorPassesSnapshot.size,
      });
    } catch (error) {
      console.error("Failed to load dashboard statistics:", error);

      setStatsError(
        error.code === "permission-denied"
          ? "Permission denied. Check that your admin account is active and your Firestore rules allow these reads."
          : "Unable to load statistics. Please try again."
      );
    } finally {
      setStatsLoading(false);
    }
  }, [authStatus, user]);

  useEffect(() => {
    if (authStatus === "authenticated" && user?.role === "admin") {
      loadStats();
    }
  }, [authStatus, user, loadStats]);

  // Sign out safely.
  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError("");

    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Sign-out error:", error);
      setSignOutError("Unable to sign out. Please try again.");
      setSigningOut(false);
    }
  }

  // Authentication loading screen.
  if (
    authStatus === "checking" ||
    authStatus === "loading" ||
    !user
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f3ed] px-4">
        <div className="rounded-2xl border border-[#e9ded1] bg-[#fffdf9] p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-[#eadfd2] border-t-[#805637]" />
          <p className="font-semibold text-[#4b3627]">
            Checking your account...
          </p>
          <p className="mt-2 text-sm text-[#806f61]">
            Please wait while we verify your administrator access.
          </p>
        </div>
      </main>
    );
  }

  // Prevent non-admin users from seeing admin content.
  if (user.role !== "admin" || user.active !== true) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f3ed] px-4">
        <p className="text-[#5d4635]">
          Redirecting to your dashboard...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-7xl">
        {/* Dashboard header */}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-5 border-b border-[#e6d9ca] pb-7">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#805637]">
              GateKeeper
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#3e2d22] sm:text-4xl">
              Admin Dashboard
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#806f61]">
              Manage residents, estate finances, communications, and
              security from one place.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-lg border border-[#d9c7b5] bg-[#fffdf9] px-5 py-3 text-sm font-semibold text-[#563c2b] transition hover:bg-[#563c2b] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signingOut ? "Signing out..." : "Sign Out ↗"}
          </button>
        </header>

        {signOutError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {signOutError}
          </div>
        )}

        {/* Administrator account */}
        <section className="mb-8 rounded-2xl border border-[#e9ded1] bg-[#fffdf9] p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a775b]">
                Administrator account
              </p>

              <h2 className="mt-2 text-xl font-bold text-[#3e2d22]">
                Welcome, {user.name || "Administrator"}
              </h2>

              <p className="mt-2 break-all text-sm text-[#806f61]">
                {user.email || "Administrator account"}
              </p>
            </div>

            <span className="inline-flex items-center gap-2 rounded-full bg-[#e7f2e5] px-4 py-2 text-sm font-semibold text-[#397345]">
              <span aria-hidden="true">●</span>
              Active Administrator
            </span>
          </div>
        </section>

        {/* Estate statistics */}
        <section className="mb-10">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a775b]">
                Estate overview
              </p>

              <h2 className="mt-2 text-2xl font-bold text-[#3e2d22]">
                Estate Statistics
              </h2>

              <p className="mt-2 text-sm text-[#806f61]">
                A summary of your estate management records.
              </p>
            </div>

            <button
              type="button"
              onClick={loadStats}
              disabled={statsLoading}
              className="rounded-lg bg-[#563c2b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#3e2d22] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {statsLoading ? "Loading..." : "↻ Refresh Statistics"}
            </button>
          </div>

          {statsError && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700"
            >
              {statsError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Residents"
              value={stats.residents}
              loading={statsLoading}
              description="Registered resident accounts"
              icon="👥"
            />

            <StatCard
              title="Pending Approvals"
              value={stats.pendingApprovals}
              loading={statsLoading}
              description="Residents awaiting approval"
              icon="⏳"
              iconClass="bg-orange-100"
            />

            <StatCard
              title="Security Staff"
              value={stats.securityStaff}
              loading={statsLoading}
              description="Active security accounts"
              icon="🛡️"
              iconClass="bg-blue-100"
            />

            <StatCard
              title="Visitor Passes"
              value={stats.visitorPasses}
              loading={statsLoading}
              description="Visitor pass records"
              icon="🎫"
              iconClass="bg-green-100"
            />
          </div>
        </section>

        {/* Management navigation */}
        <section>
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a775b]">
              Administration
            </p>

            <h2 className="mt-2 text-2xl font-bold text-[#3e2d22]">
              Management Center
            </h2>

            <p className="mt-2 text-sm text-[#806f61]">
              Choose a section to manage your estate.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <ManagementCard
              category="Resident Management"
              title="Manage Residents"
              description="Review registrations, approve resident accounts, and manage resident records."
              href="/admin/residents"
              buttonText="Manage Residents"
              icon="👥"
            />

            <ManagementCard
              category="Estate Finance"
              title="Levy Management"
              description="Create estate-wide levies or assign charges to individual residents."
              href="/admin/levies"
              buttonText="Manage Levies"
              icon="💰"
            />

            <ManagementCard
              category="Estate Finance"
              title="Levy Payments"
              description="Review resident payments, confirm submissions, and track payment status."
              href="/admin/levies/payments"
              buttonText="Manage Payments"
              icon="💳"
              featured
            />

            <ManagementCard
              category="Estate Services"
              title="Visitor Passes"
              description="Review visitor pass records and manage visitor access information."
              href="/admin/visitor-passes"
              buttonText="Manage Visitor Passes"
              icon="🎫"
            />

            <ManagementCard
              category="Estate Services"
              title="Complaints"
              description="Review resident complaints, follow up on issues, and update resolution statuses."
              href="/admin/complaints"
              buttonText="Manage Complaints"
              icon="🛠️"
            />

            <ManagementCard
              category="Communications"
              title="Announcements"
              description="Publish estate updates, maintenance notices, and important community information."
              href="/admin/announcements"
              buttonText="Manage Announcements"
              icon="📢"
            />

            <ManagementCard
              category="Security & Access"
              title="Gate Logs"
              description="Review visitor check-ins, visitor details, and the security officer who recorded each entry."
              href="/admin/gate-logs"
              buttonText="View Gate Logs"
              icon="🚪"
            />

            <ManagementCard
              category="Security & Access"
              title="Security Staff"
              description="Manage security staff accounts and their access permissions."
              href="/admin/security"
              buttonText="Manage Security"
              icon="🛡️"
            />
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-12 flex flex-wrap justify-between gap-3 border-t border-[#e6d9ca] pt-5 text-xs text-[#9a8777]">
          <span>GateKeeper Estate Management</span>
          <span>Administrator Portal</span>
        </footer>
      </div>
    </main>
  );
}

function StatCard({
  title,
  value,
  loading,
  description,
  icon,
  iconClass = "bg-[#f1e7da]",
}) {
  return (
    <div className="rounded-2xl border border-[#e9ded1] bg-[#fffdf9] p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#806f61]">
          {title}
        </p>

        <span
          className={`grid h-11 w-11 place-items-center rounded-xl ${iconClass}`}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>

      <p className="mt-5 text-3xl font-extrabold text-[#3e2d22]">
        {loading ? "..." : value.toLocaleString()}
      </p>

      <p className="mt-2 text-xs leading-5 text-[#8b7969]">
        {description}
      </p>

      {title === "Pending Approvals" && (
        <Link
          href="/admin/residents"
          className="mt-4 inline-block text-sm font-bold text-[#805637] hover:text-[#3e2d22]"
        >
          Review residents →
        </Link>
      )}
    </div>
  );
}

function ManagementCard({
  category,
  title,
  description,
  href,
  buttonText,
  icon,
  featured = false,
}) {
  return (
    <article
      className={`flex flex-col rounded-2xl border p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md ${
        featured
          ? "border-[#b99a7b] bg-[#f0e4d6]"
          : "border-[#e9ded1] bg-[#fffdf9]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#805637]">
          {category}
        </p>

        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f1e7da] text-xl"
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>

      <h3 className="mt-4 text-xl font-bold text-[#3e2d22]">
        {title}
      </h3>

      <p className="mt-3 flex-1 text-sm leading-6 text-[#806f61]">
        {description}
      </p>

      <Link
        href={href}
        className={`mt-6 inline-flex items-center justify-center self-start rounded-lg px-4 py-3 text-sm font-bold transition ${
          featured
            ? "bg-[#563c2b] text-white hover:bg-[#3e2d22]"
            : "bg-[#eee4d9] text-[#563c2b] hover:bg-[#e2d2c0]"
        }`}
      >
        {buttonText} →
      </Link>
    </article>
  );
}
