"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function AdminComplaintsPage() {
  const router = useRouter();
  const user = useSelector((state) => state.auth.user);
  const authStatus = useSelector((state) => state.auth.authStatus);

  const [complaints, setComplaints] = useState([]);
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (authStatus !== "authenticated") return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (user.role !== "admin" || user.active !== true) {
      router.replace(
        user.active === true ? "/resident/dashboard" : "/pending-approval"
      );
    }
  }, [authStatus, user, router]);

  const loadComplaints = useCallback(async () => {
    if (authStatus !== "authenticated") return;

    if (!user || user.role !== "admin" || user.active !== true) {
      setLoading(false);
      return;
    }

    if (!auth.currentUser || auth.currentUser.uid !== user.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const complaintsQuery = query(
        collection(db, "complaints"),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(complaintsQuery);

      setComplaints(
        snapshot.docs.map((complaintDoc) => ({
          id: complaintDoc.id,
          ...complaintDoc.data(),
        }))
      );
    } catch (err) {
      console.error("Load complaints error:", err);
      setError("Could not load complaints. Check your Firestore rules.");
    } finally {
      setLoading(false);
    }
  }, [authStatus, user]);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  async function updateStatus(complaintId, status) {
    setUpdatingId(complaintId);
    setError("");

    try {
      await updateDoc(doc(db, "complaints", complaintId), {
        status,
        updatedAt: serverTimestamp(),
      });

      setComplaints((current) =>
        current.map((complaint) =>
          complaint.id === complaintId
            ? { ...complaint, status }
            : complaint
        )
      );
    } catch (err) {
      console.error("Update complaint status error:", err);
      setError("Could not update complaint status. Check your Firestore rules.");
    } finally {
      setUpdatingId("");
    }
  }

  const filteredComplaints =
    filter === "All"
      ? complaints
      : complaints.filter((complaint) => complaint.status === filter);

  function formatDate(timestamp) {
    if (!timestamp) return "Date unavailable";

    const date = timestamp.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

    return Number.isNaN(date.getTime())
      ? "Date unavailable"
      : date.toLocaleString();
  }

  return (
    <main className="admin-complaints-page">
      <header className="admin-complaints-header">
        <div>
          <p className="admin-complaints-eyebrow">GATEKEEPER ADMINISTRATION</p>
          <h1>Maintenance Complaints</h1>
          <p>Review and manage maintenance issues reported by residents.</p>
        </div>

        <button
          className="admin-complaints-back"
          onClick={() => router.push("/admin")}
        >
          Back to Dashboard
        </button>
      </header>

      <section className="admin-complaints-panel">
        <div className="admin-complaints-toolbar">
          <div>
            <h2>All Complaints</h2>
            <p>{filteredComplaints.length} complaint(s)</p>
          </div>

          <div className="admin-complaints-filter">
            <label htmlFor="complaint-filter">Filter by status</label>
            <select
              id="complaint-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="All">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="admin-complaints-error">{error}</div>
        )}

        {loading ? (
          <p className="admin-complaints-empty">Loading complaints...</p>
        ) : filteredComplaints.length === 0 ? (
          <p className="admin-complaints-empty">
            No complaints found for this filter.
          </p>
        ) : (
          <div className="admin-complaints-list">
            {filteredComplaints.map((complaint) => (
              <article className="admin-complaint-card" key={complaint.id}>
                <div className="admin-complaint-top">
                  <div>
                    <span className="admin-complaint-category">
                      {complaint.category || "Other"}
                    </span>
                    <h3>{complaint.title || "Untitled complaint"}</h3>
                  </div>

                  <span
                    className={`admin-complaint-status status-${(
                      complaint.status || "Pending"
                    )
                      .toLowerCase()
                      .replace(/\s+/g, "-")}`}
                  >
                    {complaint.status || "Pending"}
                  </span>
                </div>

                <p className="admin-complaint-description">
                  {complaint.description || "No description provided."}
                </p>

                <div className="admin-complaint-details">
                  <p>
                    <strong>Resident:</strong>{" "}
                    {complaint.residentName || complaint.residentEmail || "Resident"}
                  </p>
                  <p>
                    <strong>Location:</strong>{" "}
                    {complaint.location || "Not provided"}
                  </p>
                  <p>
                    <strong>Submitted:</strong>{" "}
                    {formatDate(complaint.createdAt)}
                  </p>
                </div>

                <div className="admin-complaint-actions">
                  <label htmlFor={`status-${complaint.id}`}>
                    Update status
                  </label>
                  <select
                    id={`status-${complaint.id}`}
                    value={complaint.status || "Pending"}
                    disabled={updatingId === complaint.id}
                    onChange={(e) =>
                      updateStatus(complaint.id, e.target.value)
                    }
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                  {updatingId === complaint.id && <span>Saving...</span>}
                </div>
              </article>
            ))}
          </div>
        )}

        <button
          className="admin-complaints-refresh"
          onClick={loadComplaints}
          disabled={loading}
        >
          Refresh Complaints
        </button>
      </section>
    </main>
  );
}