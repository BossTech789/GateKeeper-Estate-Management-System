
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function ResidentAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const announcementsQuery = query(
      collection(db, "announcements"),
      where("audience", "in", ["everyone", "residents"])
    );

    const unsubscribe = onSnapshot(
      announcementsQuery,
      (snapshot) => {
        const results = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        results.sort((a, b) => {
          const dateA = a.createdAt?.toMillis?.() || 0;
          const dateB = b.createdAt?.toMillis?.() || 0;
          return dateB - dateA;
        });

        setAnnouncements(results);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Resident announcements error:", err);
        setError(
          "Unable to load announcements. Please check your connection or permissions."
        );
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  function formatDate(timestamp) {
    if (!timestamp?.toDate) return "Recently posted";

    return timestamp.toDate().toLocaleString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-4 py-6 text-[#3e2d22] sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e6d9ca] pb-5">
          <Link
            href="/resident/dashboard"
            className="text-sm font-bold text-[#805637] hover:text-[#3e2d22]"
          >
            ← Resident Dashboard
          </Link>

          <span className="text-right text-xs font-bold tracking-widest text-[#9a775b]">
            GATEKEEPER ESTATE MANAGEMENT
          </span>
        </header>

        <section className="mt-7 rounded-2xl bg-gradient-to-br from-[#4c3425] to-[#79583e] p-7 text-[#fffaf4] sm:mt-9 sm:p-10">
          <span className="text-xs font-bold tracking-[0.2em] text-[#e7c5a2]">
            ESTATE UPDATES
          </span>

          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Announcements
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-7 text-[#f0e5da]">
            Stay informed about estate news, maintenance schedules,
            meetings, and important notices from management.
          </p>
        </section>

        <section className="mt-9">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="text-xs font-bold tracking-widest text-[#9a775b]">
                YOUR NOTICEBOARD
              </span>

              <h2 className="mt-2 text-2xl font-extrabold">
                Latest Updates
              </h2>
            </div>

            {!loading && !error && (
              <span className="rounded-full border border-[#e5d6c6] bg-[#fffdf9] px-3 py-2 text-xs font-semibold text-[#785a41]">
                {announcements.length}{" "}
                {announcements.length === 1
                  ? "announcement"
                  : "announcements"}
              </span>
            )}
          </div>

          {loading ? (
            <div className="rounded-2xl border border-[#e9ded1] bg-[#fffdf9] p-10 text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#eadfd2] border-t-[#805637]" />
              <p className="text-sm text-[#806f61]">
                Loading announcements...
              </p>
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm leading-6 text-red-700"
            >
              {error}
            </div>
          ) : announcements.length === 0 ? (
            <div className="rounded-2xl border border-[#e9ded1] bg-[#fffdf9] px-6 py-12 text-center">
              <span className="text-4xl" aria-hidden="true">
                📢
              </span>

              <h3 className="mt-4 text-lg font-bold">
                No announcements yet
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#806f61]">
                There are no announcements for residents yet. Please
                check back later for estate updates.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {announcements.map((announcement) => (
                <article
                  key={announcement.id}
                  className="rounded-2xl border border-[#e9ded1] bg-[#fffdf9] p-5 shadow-sm transition hover:border-[#cdb49b] sm:p-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f1e7da] text-xl">
                      📢
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-full bg-[#f1e7da] px-3 py-1 text-[10px] font-extrabold tracking-wider text-[#805637]">
                          {announcement.audience === "everyone"
                            ? "ESTATE NOTICE"
                            : "RESIDENT NOTICE"}
                        </span>

                        <time className="text-xs text-[#9a8777]">
                          {formatDate(announcement.createdAt)}
                        </time>
                      </div>

                      <h3 className="mt-4 break-words text-lg font-extrabold">
                        {announcement.title || "Estate Announcement"}
                      </h3>

                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[#78695d]">
                        {announcement.message}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-10 flex flex-wrap justify-between gap-3 border-t border-[#e6d9ca] py-5 text-xs text-[#9a8777]">
          <span>GateKeeper Estate Management</span>

          <Link
            href="/resident/dashboard"
            className="font-bold text-[#805637] hover:text-[#3e2d22]"
          >
            Back to Dashboard ↑
          </Link>
        </footer>
      </div>
    </main>
  );
}
