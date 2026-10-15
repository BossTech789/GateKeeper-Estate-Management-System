"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("everyone");
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const announcementsQuery = query(
      collection(db, "announcements"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      announcementsQuery,
      (snapshot) => {
        setAnnouncements(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Announcements loading error:", err);
        setError("Could not load announcements. Check your Firestore rules.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  function resetForm() {
    setTitle("");
    setMessage("");
    setAudience("everyone");
    setEditingId(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!title.trim() || !message.trim()) {
      setError("Please enter both a title and a message.");
      return;
    }

    setSaving(true);

    try {
      const announcementData = {
        title: title.trim(),
        message: message.trim(),
        audience,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, "announcements", editingId), announcementData);
        setSuccess("Announcement updated successfully.");
      } else {
        await addDoc(collection(db, "announcements"), {
          ...announcementData,
          createdAt: serverTimestamp(),
        });
        setSuccess("Announcement published successfully.");
      }

      resetForm();
    } catch (err) {
      console.error("Announcement save error:", err);
      setError("Could not save the announcement. Check your permissions and internet connection.");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(announcement) {
    setTitle(announcement.title || "");
    setMessage(announcement.message || "");
    setAudience(announcement.audience || "everyone");
    setEditingId(announcement.id);
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this announcement?"
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      await deleteDoc(doc(db, "announcements", id));
      if (editingId === id) resetForm();
      setSuccess("Announcement deleted successfully.");
    } catch (err) {
      console.error("Announcement delete error:", err);
      setError("Could not delete the announcement. Check your permissions.");
    }
  }

  return (
    <main className="announcements-page">
      <header className="announcements-header">
        <div>
          <p className="announcements-eyebrow">GATEKEEPER / ADMINISTRATION</p>
          <h1>Announcements</h1>
          <p className="announcements-subtitle">
            Share important estate updates with residents and security staff.
          </p>

          <Link href="/admin" className="levy-back-link">
          ← Admin Dashboard
        </Link>
        </div>

        <span className="announcement-count">
          {announcements.length}{" "}
          {announcements.length === 1 ? "announcement" : "announcements"}
        </span>
      </header>

      {error && <div className="announcement-alert error">{error}</div>}
      {success && <div className="announcement-alert success">{success}</div>}

      <section className="announcement-panel">
        <h2>{editingId ? "Edit announcement" : "Create announcement"}</h2>
        <p className="announcement-help">
          Published announcements are saved to your Firebase database.
        </p>

        <form onSubmit={handleSubmit} className="announcement-form">
          <div className="announcement-field">
            <label htmlFor="announcement-title">Announcement title</label>
            <input
              id="announcement-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Scheduled Water Maintenance"
              maxLength={120}
              required
            />
          </div>

          <div className="announcement-field">
            <label htmlFor="announcement-message">Message</label>
            <textarea
              id="announcement-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Write the announcement details here..."
              rows={5}
              maxLength={5000}
              required
            />
          </div>

          <div className="announcement-field">
            <label htmlFor="announcement-audience">Audience</label>
            <select
              id="announcement-audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
            >
              <option value="everyone">Everyone</option>
              <option value="residents">Residents only</option>
              <option value="security">Security staff only</option>
            </select>
          </div>

          <div className="announcement-actions">
            <button type="submit" disabled={saving}>
              {saving
                ? "Saving..."
                : editingId
                ? "Update announcement"
                : "Publish announcement"}
            </button>

            {editingId && (
              <button
                type="button"
                className="announcement-cancel"
                onClick={resetForm}
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="announcement-list-section">
        <h2>Published announcements</h2>

        {loading ? (
          <p className="announcement-empty">Loading announcements...</p>
        ) : announcements.length === 0 ? (
          <div className="announcement-empty">
            <h3>No announcements yet</h3>
            <p>Create your first announcement using the form above.</p>
          </div>
        ) : (
          <div className="announcement-list">
            {announcements.map((announcement) => (
              <article className="announcement-card" key={announcement.id}>
                <div className="announcement-card-top">
                  <span className="announcement-audience">
                    {announcement.audience || "everyone"}
                  </span>

                  <div className="announcement-card-actions">
                    <button
                      type="button"
                      onClick={() => handleEdit(announcement)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="announcement-delete"
                      onClick={() => handleDelete(announcement.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <h3>{announcement.title}</h3>
                <p className="announcement-message">
                  {announcement.message}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}