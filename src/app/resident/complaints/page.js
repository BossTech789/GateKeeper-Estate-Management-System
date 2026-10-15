"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function ResidentComplaintsPage() {
  const router = useRouter();
  const user = useSelector((state) => state.auth.user);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Plumbing");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!user?.uid) {
      setError("Please log in before submitting a complaint.");
      return;
    }

    if (!title.trim() || !location.trim() || !description.trim()) {
      setError("Please complete all required fields.");
      return;
    }

    setLoading(true);

    try {
      await addDoc(collection(db, "complaints"), {
        residentId: user.uid,
        residentName: user.displayName || user.name || user.email || "Resident",
        residentEmail: user.email || "",
        title: title.trim(),
        category,
        location: location.trim(),
        description: description.trim(),
        status: "Pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setTitle("");
      setCategory("Plumbing");
      setLocation("");
      setDescription("");
      setSuccess("Your maintenance complaint has been submitted successfully.");
    } catch (err) {
      console.error("Complaint submission error:", err);
      setError("Could not submit your complaint. Check your connection and Firestore permissions, then try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="complaints-page">
      <div className="complaints-header">
        <div>
          <p className="complaints-eyebrow">GATEKEEPER ESTATE MANAGEMENT</p>
          <h1>Maintenance Complaints</h1>
          <p>Report a maintenance issue in your estate.</p>
        </div>

        <button
          type="button"
          className="complaints-back"
          onClick={() => router.push("/resident/dashboard")}
        >
          Back to Dashboard
        </button>
      </div>

      <section className="complaints-card">
        <h2>Submit a Complaint</h2>
        <p className="complaints-description">
          Provide accurate details so the estate management team can address
          the issue.
        </p>

        {error && <div className="complaints-message complaints-error">{error}</div>}
        {success && <div className="complaints-message complaints-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="complaints-field">
            <label htmlFor="complaint-title">Complaint Title *</label>
            <input
              id="complaint-title"
              type="text"
              placeholder="e.g. Broken water pipe"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
            />
          </div>

          <div className="complaints-field">
            <label htmlFor="complaint-category">Category *</label>
            <select
              id="complaint-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="Plumbing">Plumbing</option>
              <option value="Electrical">Electrical</option>
              <option value="Security">Security</option>
              <option value="Roads and Drainage">Roads and Drainage</option>
              <option value="Waste Management">Waste Management</option>
              <option value="Common Areas">Common Areas</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="complaints-field">
            <label htmlFor="complaint-location">Location or Unit *</label>
            <input
              id="complaint-location"
              type="text"
              placeholder="e.g. Block A, Flat 3"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={150}
              required
            />
          </div>

          <div className="complaints-field">
            <label htmlFor="complaint-description">Description *</label>
            <textarea
              id="complaint-description"
              placeholder="Describe the problem and any relevant details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              maxLength={3000}
              required
            />
          </div>

          <button
            type="submit"
            className="complaints-submit"
            disabled={loading}
          >
            {loading ? "Submitting..." : "Submit Complaint"}
          </button>
        </form>
      </section>
    </main>
  );
}