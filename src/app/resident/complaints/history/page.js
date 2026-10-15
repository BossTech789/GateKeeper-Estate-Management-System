"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function ComplaintHistoryPage() {
  const router = useRouter();

  const user = useSelector((state) => state.auth.user);
  const authStatus = useSelector((state) => state.auth.authStatus);

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setAuthReady(true);

      if (!firebaseUser) {
        router.replace("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!authReady || authStatus === "checking" || authStatus === "loading") {
      return;
    }

    if (!user?.uid) {
      // Firebase may still have a user even if Redux has not caught up.
      if (auth.currentUser?.uid) return;

      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchComplaints() {
      try {
        setLoading(true);
        setError("");

        const complaintsQuery = query(
          collection(db, "complaints"),
          where("residentId", "==", user.uid),
          orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(complaintsQuery);

        if (cancelled) return;

        setComplaints(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      } catch (err) {
        console.error("Error loading complaint history:", err);

        if (!cancelled) {
          setError(
            "Could not load your complaints. Please refresh and try again."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchComplaints();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, authStatus, authReady]);

  useEffect(() => {
    if (
      authReady &&
      auth.currentUser &&
      !user?.uid &&
      authStatus !== "checking" &&
      authStatus !== "loading"
    ) {
      // Give the Redux listener a moment to synchronize before redirecting.
      const timer = setTimeout(() => {
        if (!user?.uid && !auth.currentUser) {
          router.replace("/login");
        }
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [authReady, user?.uid, authStatus, router]);

  function formatDate(timestamp) {
    if (!timestamp?.toDate) return "Date unavailable";

    return timestamp.toDate().toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function getStatusClass(status) {
    switch (status) {
      case "Resolved":
        return "resolved";
      case "In Progress":
        return "in-progress";
      default:
        return "pending";
    }
  }

  if (!authReady || authStatus === "checking" || authStatus === "loading" || loading) {
    return (
      <main className="complaint-history-page">
        <p className="complaint-history-message">
          Loading your complaint history...
        </p>
      </main>
    );
  }

  if (!auth.currentUser) {
    return null;
  }

  return (
    <main className="complaint-history-page">
      <div className="complaint-history-container">
        <Link
          href="/resident/dashboard"
          className="complaint-history-back"
        >
          ← Back to Dashboard
        </Link>

        <header className="complaint-history-header">
          <p className="complaint-history-eyebrow">
            MAINTENANCE AND SUPPORT
          </p>

          <h1>My Complaints</h1>

          <p>
            Track the maintenance complaints you have submitted
            and check their latest status.
          </p>

          <Link
            href="/resident/complaints"
            className="complaint-history-new-button"
          >
            + Submit a Complaint
          </Link>
        </header>

        {error && (
          <div className="complaint-history-error">
            {error}
            <button
              type="button"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        )}

        {!error && complaints.length === 0 && (
          <section className="complaint-history-empty">
            <h2>No complaints yet</h2>
            <p>
              You have not submitted any maintenance complaints.
            </p>
            <Link href="/resident/complaints">
              Submit your first complaint
            </Link>
          </section>
        )}

        {!error && complaints.length > 0 && (
          <>
            <div className="complaint-history-summary">
              <span>
                {complaints.length}{" "}
                {complaints.length === 1 ? "complaint" : "complaints"}
              </span>
            </div>

            <div className="complaint-history-list">
              {complaints.map((complaint) => (
                <article
                  className="complaint-history-card"
                  key={complaint.id}
                >
                  <div className="complaint-history-card-top">
                    <span className="complaint-history-category">
                      {complaint.category || "General"}
                    </span>

                    <span
                      className={`complaint-history-status ${getStatusClass(
                        complaint.status
                      )}`}
                    >
                      {complaint.status || "Pending"}
                    </span>
                  </div>

                  <h2>{complaint.title}</h2>

                  <p className="complaint-history-description">
                    {complaint.description}
                  </p>

                  {complaint.location && (
                    <p className="complaint-history-detail">
                      <strong>Location:</strong> {complaint.location}
                    </p>
                  )}

                  <p className="complaint-history-date">
                    Submitted: {formatDate(complaint.createdAt)}
                  </p>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}