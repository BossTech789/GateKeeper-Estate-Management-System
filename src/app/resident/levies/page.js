
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

function formatAmount(value) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function getPaymentBalance(payment) {
  if (typeof payment.balance === "number") {
    return Math.max(0, payment.balance);
  }

  const amountDue = Number(payment.amountDue) || 0;
  const amountPaid = Number(payment.amountPaid) || 0;

  return Math.max(0, amountDue - amountPaid);
}

function getDateValue(value) {
  if (!value) return "";

  if (typeof value === "string") {
    return value;
  }

  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleDateString();
  }

  return "";
}

export default function ResidentLeviesPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState(null);
  const [residentProfile, setResidentProfile] = useState(null);

  const [levies, setLevies] = useState([]);
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [paymentSubmissions, setPaymentSubmissions] = useState([]);
  const [bankDetails, setBankDetails] = useState(null);

  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [transferReference, setTransferReference] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");

  const payablePayments = useMemo(() => {
    return paymentRecords.filter((payment) => {
      return (
        getPaymentBalance(payment) > 0 &&
        payment.status !== "Paid"
      );
    });
  }, [paymentRecords]);

  const selectedPayment = payablePayments.find(
    (payment) => payment.id === selectedPaymentId
  );

  const outstandingAmount = useMemo(() => {
    return paymentRecords.reduce(
      (total, payment) => total + getPaymentBalance(payment),
      0
    );
  }, [paymentRecords]);

  const totalAmount = useMemo(() => {
    return paymentRecords.reduce(
      (total, payment) => total + (Number(payment.amountDue) || 0),
      0
    );
  }, [paymentRecords]);

  const paidAmount = useMemo(() => {
    return paymentRecords.reduce(
      (total, payment) => total + (Number(payment.amountPaid) || 0),
      0
    );
  }, [paymentRecords]);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (cancelled) return;

      setCurrentUser(firebaseUser);

      if (!firebaseUser) {
        router.replace("/login");
        return;
      }

      setLoading(true);
      setPageError("");

      try {
        // 1. Load the resident's profile.
        const profileSnapshot = await getDoc(
          doc(db, "users", firebaseUser.uid)
        );

        if (!profileSnapshot.exists()) {
          throw new Error("Your resident profile could not be found.");
        }

        const profile = {
          id: profileSnapshot.id,
          ...profileSnapshot.data(),
        };

        if (cancelled) return;

        setResidentProfile(profile);

        if (
          profile.role !== "resident" ||
          profile.active !== true
        ) {
          throw new Error(
            "Your account must be approved as an active resident to access levies."
          );
        }

        // 2. Load payment records belonging to this resident.
        // IMPORTANT: The residentId must match the Firebase Auth UID.
        const paymentsQuery = query(
          collection(db, "levyPayments"),
          where("residentId", "==", firebaseUser.uid)
        );

        const paymentsSnapshot = await getDocs(paymentsQuery);

        const loadedPayments = paymentsSnapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        if (cancelled) return;

        setPaymentRecords(loadedPayments);

        // 3. Load levies visible to this resident.
        // These queries match the existing Firestore rules.
        const levyQueries = [
          query(
            collection(db, "levies"),
            where("scope", "==", "estate")
          ),
          query(
            collection(db, "levies"),
            where("residentId", "==", firebaseUser.uid)
          ),
          query(
            collection(db, "levies"),
            where("residentIds", "array-contains", firebaseUser.uid)
          ),
        ];

        const levyResults = await Promise.all(
          levyQueries.map((levyQuery) => getDocs(levyQuery))
        );

        const levyMap = new Map();

        levyResults.forEach((snapshot) => {
          snapshot.docs.forEach((item) => {
            levyMap.set(item.id, {
              id: item.id,
              ...item.data(),
            });
          });
        });

        if (cancelled) return;

        setLevies(Array.from(levyMap.values()));

        // 4. Load bank transfer instructions.
        const bankSnapshot = await getDoc(
          doc(db, "estateSettings", "bankTransfer")
        );

        if (cancelled) return;

        setBankDetails(
          bankSnapshot.exists() ? bankSnapshot.data() : null
        );

        // 5. Load only this resident's payment submissions.
        const submissionsQuery = query(
          collection(db, "paymentSubmissions"),
          where("residentId", "==", firebaseUser.uid)
        );

        const submissionsSnapshot = await getDocs(submissionsQuery);

        if (cancelled) return;

        const loadedSubmissions = submissionsSnapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        loadedSubmissions.sort((a, b) => {
          const dateA = a.createdAt?.toMillis?.() || 0;
          const dateB = b.createdAt?.toMillis?.() || 0;
          return dateB - dateA;
        });

        setPaymentSubmissions(loadedSubmissions);

        // Keep a valid selection if the selected levy still has a balance.
        setSelectedPaymentId((previousId) => {
          if (loadedPayments.some(
            (payment) =>
              payment.id === previousId &&
              getPaymentBalance(payment) > 0 &&
              payment.status !== "Paid"
          )) {
            return previousId;
          }

          const firstPayable = loadedPayments.find(
            (payment) =>
              getPaymentBalance(payment) > 0 &&
              payment.status !== "Paid"
          );

          return firstPayable?.id || "";
        });
      } catch (error) {
        console.error("Resident levies loading error:", error);

        if (!cancelled) {
          setPageError(
            error.code === "permission-denied"
              ? "Permission denied while loading your levies. Check your Firestore security rules and resident approval."
              : error.message || "Could not load your levies."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  async function handleSubmit(event) {
    event.preventDefault();

    setFormError("");
    setFormMessage("");

    if (!currentUser) {
      setFormError("Please sign in again.");
      return;
    }

    if (!bankDetails) {
      setFormError(
        "Bank transfer details are unavailable. Contact the estate administrator."
      );
      return;
    }

    if (!selectedPayment) {
      setFormError("Please select a levy with an outstanding balance.");
      return;
    }

    const amountNumber = Number(amount);
    const balance = getPaymentBalance(selectedPayment);

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setFormError("Enter a valid payment amount greater than zero.");
      return;
    }

    if (amountNumber > balance) {
      setFormError(
        `The amount cannot exceed the outstanding balance of ${formatAmount(balance)}.`
      );
      return;
    }

    if (!paymentDate) {
      setFormError("Please select the transfer date.");
      return;
    }

    if (paymentDate > new Date().toISOString().slice(0, 10)) {
      setFormError("The transfer date cannot be in the future.");
      return;
    }

    if (!transferReference.trim()) {
      setFormError("Enter the bank transfer reference.");
      return;
    }

    setSubmitting(true);

    try {
      // Recheck the payment record before creating the submission.
      const paymentSnapshot = await getDoc(
        doc(db, "levyPayments", selectedPayment.id)
      );

      if (!paymentSnapshot.exists()) {
        throw new Error(
          "This levy payment record no longer exists. Refresh the page."
        );
      }

      const latestPayment = {
        id: paymentSnapshot.id,
        ...paymentSnapshot.data(),
      };

      if (latestPayment.residentId !== currentUser.uid) {
        throw new Error("You cannot submit payment for another resident.");
      }

      const latestBalance = getPaymentBalance(latestPayment);

      if (
        latestBalance <= 0 ||
        latestPayment.status === "Paid"
      ) {
        throw new Error(
          "This levy has already been paid. Refresh the page."
        );
      }

      if (amountNumber > latestBalance) {
        throw new Error(
          `The outstanding balance has changed. The maximum amount is ${formatAmount(latestBalance)}.`
        );
      }

      const submission = {
        residentId: currentUser.uid,
        residentName:
          residentProfile?.fullName ||
          residentProfile?.name ||
          currentUser.displayName ||
          currentUser.email ||
          "Resident",
        levyPaymentId: latestPayment.id,
        levyId: latestPayment.levyId || "",
        amount: amountNumber,
        transferReference: transferReference.trim(),
        paymentDate,
        status: "Pending",
        createdAt: serverTimestamp(),
      };

      const submissionRef = await addDoc(
        collection(db, "paymentSubmissions"),
        submission
      );

      setPaymentSubmissions((previous) => [
        {
          id: submissionRef.id,
          ...submission,
          createdAt: null,
        },
        ...previous,
      ]);

      setFormMessage(
        "Your transfer has been submitted successfully. The estate administrator must verify it before your levy balance is updated."
      );

      setTransferReference("");
      setPaymentDate("");
      setAmount(String(latestBalance));

    } catch (error) {
      console.error("Payment submission error:", error);

      setFormError(
        error.code === "permission-denied"
          ? "Firebase denied this submission. Check the paymentSubmissions security rules."
          : error.message || "Could not submit your transfer."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="levies-page">
        <div className="loading-card">
          <div className="loader" />
          <p>Loading your estate levies...</p>
        </div>

        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="levies-page">
      <div className="levies-container">
        <header className="page-header">
          <div>
            <Link href="/resident/dashboard" className="back-link">
              ← Back to Dashboard
            </Link>

            <p className="eyebrow">RESIDENT PORTAL</p>
            <h1>Estate Levies</h1>
            <p className="page-description">
              View your levy balances and submit bank transfers for
              administrator verification.
            </p>
          </div>
        </header>

        {pageError && (
          <div className="alert alert-error">
            {pageError}
          </div>
        )}

        <section className="summary-grid">
          <article className="summary-card">
            <span>Total Amount Due</span>
            <h2>{formatAmount(totalAmount)}</h2>
          </article>

          <article className="summary-card">
            <span>Amount Recorded as Paid</span>
            <h2>{formatAmount(paidAmount)}</h2>
          </article>

          <article className="summary-card summary-highlight">
            <span>Outstanding Balance</span>
            <h2>{formatAmount(outstandingAmount)}</h2>
          </article>
        </section>

        <section className="content-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR ACCOUNT</p>
              <h2>Levy Payment Records</h2>
            </div>

            <span className="count-badge">
              {paymentRecords.length} record(s)
            </span>
          </div>

          {paymentRecords.length === 0 ? (
            <div className="empty-state">
              <h3>No levy payment records found</h3>
              <p>
                Your account has no records in the levyPayments collection.
                Contact the estate administrator to confirm that levies have
                been assigned to your resident account.
              </p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Levy</th>
                    <th>Amount Due</th>
                    <th>Amount Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {paymentRecords.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <strong>
                          {payment.levyTitle || "Estate levy"}
                        </strong>
                      </td>

                      <td>{formatAmount(payment.amountDue)}</td>
                      <td>{formatAmount(payment.amountPaid)}</td>
                      <td>
                        <strong>
                          {formatAmount(getPaymentBalance(payment))}
                        </strong>
                      </td>

                      <td>
                        <span
                          className={`status-badge ${
                            payment.status === "Paid"
                              ? "status-paid"
                              : "status-unpaid"
                          }`}
                        >
                          {payment.status || "Unpaid"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="payment-layout">
          <div className="content-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">BANK TRANSFER</p>
                <h2>Submit a Payment</h2>
              </div>
            </div>

            {bankDetails ? (
              <div className="bank-details">
                <p className="bank-label">TRANSFER TO THIS ACCOUNT</p>

                <div className="bank-row">
                  <span>Bank</span>
                  <strong>{bankDetails.bankName || "Not provided"}</strong>
                </div>

                <div className="bank-row">
                  <span>Account Name</span>
                  <strong>{bankDetails.accountName || "Not provided"}</strong>
                </div>

                <div className="bank-row">
                  <span>Account Number</span>
                  <strong className="account-number">
                    {bankDetails.accountNumber || "Not provided"}
                  </strong>
                </div>

                {bankDetails.instructions && (
                  <p className="bank-instructions">
                    {bankDetails.instructions}
                  </p>
                )}
              </div>
            ) : (
              <div className="alert alert-warning">
                Bank transfer details have not been configured. Please
                contact the estate administrator.
              </div>
            )}

            <form className="payment-form" onSubmit={handleSubmit}>
              <label>
                Levy to pay

                <select
                  value={selectedPaymentId}
                  onChange={(event) => {
                    const nextId = event.target.value;

                    setSelectedPaymentId(nextId);
                    setFormError("");
                    setFormMessage("");

                    const nextPayment = payablePayments.find(
                      (item) => item.id === nextId
                    );

                    setAmount(
                      nextPayment
                        ? String(getPaymentBalance(nextPayment))
                        : ""
                    );
                  }}
                  required
                >
                  <option value="">Select an outstanding levy</option>

                  {payablePayments.map((payment) => (
                    <option key={payment.id} value={payment.id}>
                      {payment.levyTitle || "Estate levy"} — Balance:{" "}
                      {formatAmount(getPaymentBalance(payment))}
                    </option>
                  ))}
                </select>
              </label>

              {selectedPayment && (
                <p className="balance-hint">
                  Outstanding balance:{" "}
                  <strong>
                    {formatAmount(getPaymentBalance(selectedPayment))}
                  </strong>
                </p>
              )}

              {payablePayments.length === 0 && (
                <p className="proof-note">
                  No outstanding levy payment records were loaded for your
                  account. If you expect to see a levy, contact the estate
                  administrator.
                </p>
              )}

              <div className="form-grid">
                <label>
                  Amount transferred (₦)

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={
                      selectedPayment
                        ? getPaymentBalance(selectedPayment)
                        : undefined
                    }
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="Enter amount"
                    required
                  />
                </label>

                <label>
                  Transfer date

                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(event) => setPaymentDate(event.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </label>
              </div>

              <label>
                Bank transfer reference

                <input
                  type="text"
                  value={transferReference}
                  onChange={(event) =>
                    setTransferReference(event.target.value)
                  }
                  maxLength={120}
                  placeholder="Enter the reference from your bank receipt"
                  required
                />
              </label>

              <p className="proof-note">
                Keep your bank receipt. The administrator will verify the
                reference against the estate bank statement. This form does
                not upload a receipt.
              </p>

              {formError && (
                <p className="alert alert-error">{formError}</p>
              )}

              {formMessage && (
                <p className="alert alert-success">{formMessage}</p>
              )}

              <button
                className="submit-payment"
                type="submit"
                disabled={submitting}
              >
                {submitting
                  ? "Submitting..."
                  : "Submit Transfer for Review"}
              </button>
            </form>
          </div>

          <aside className="content-card history-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">TRACK YOUR TRANSFERS</p>
                <h2>Submission History</h2>
              </div>
            </div>

            {paymentSubmissions.length === 0 ? (
              <div className="empty-state">
                <h3>No submissions yet</h3>
                <p>
                  Your submitted bank transfers will appear here.
                </p>
              </div>
            ) : (
              <div className="submission-list">
                {paymentSubmissions.map((submission) => (
                  <article
                    className="submission-item"
                    key={submission.id}
                  >
                    <div className="submission-top">
                      <strong>
                        {formatAmount(submission.amount)}
                      </strong>

                      <span
                        className={`status-badge ${
                          submission.status === "Approved"
                            ? "status-paid"
                            : submission.status === "Rejected"
                              ? "status-rejected"
                              : "status-pending"
                        }`}
                      >
                        {submission.status || "Pending"}
                      </span>
                    </div>

                    <p>
                      Reference:{" "}
                      {submission.transferReference || "Not provided"}
                    </p>

                    <p>
                      Transfer date:{" "}
                      {getDateValue(submission.paymentDate) || "Not provided"}
                    </p>

                    <p className="submission-id">
                      Submission ID: {submission.id}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </aside>
        </section>

        <section className="content-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">LEVY INFORMATION</p>
              <h2>Available Estate Levies</h2>
            </div>

            <span className="count-badge">
              {levies.length} levy/levies
            </span>
          </div>

          {levies.length === 0 ? (
            <p className="muted-text">
              No estate levies are currently available for your account.
            </p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Due Date</th>
                  </tr>
                </thead>

                <tbody>
                  {levies.map((levy) => (
                    <tr key={levy.id}>
                      <td>
                        <strong>{levy.title || "Estate levy"}</strong>
                      </td>
                      <td>{levy.description || "—"}</td>
                      <td>{formatAmount(levy.amount)}</td>
                      <td>{levy.dueDate || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .levies-page {
    min-height: 100vh;
    padding: 36px 20px 60px;
    background: #f7f3ed;
    color: #35271e;
  }

  .levies-container {
    max-width: 1200px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    margin-bottom: 30px;
  }

  .back-link {
    display: inline-block;
    margin-bottom: 20px;
    color: #78543c;
    text-decoration: none;
    font-size: 14px;
    font-weight: 600;
  }

  .back-link:hover {
    color: #4c3324;
  }

  .eyebrow {
    margin: 0 0 8px;
    color: #967354;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1.8px;
  }

  h1 {
    margin: 0;
    font-size: clamp(30px, 4vw, 42px);
    letter-spacing: -1.2px;
    color: #35271e;
  }

  .page-description {
    max-width: 650px;
    margin: 12px 0 0;
    color: #796c60;
    line-height: 1.7;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
    margin-bottom: 24px;
  }

  .summary-card {
    padding: 24px;
    background: #fff;
    border: 1px solid #e8ded1;
    border-radius: 16px;
    box-shadow: 0 5px 20px rgba(65, 43, 27, 0.035);
  }

  .summary-card span {
    color: #827366;
    font-size: 13px;
    font-weight: 600;
  }

  .summary-card h2 {
    margin: 13px 0 0;
    font-size: clamp(20px, 3vw, 28px);
    overflow-wrap: anywhere;
  }

  .summary-highlight {
    background: #563c2b;
    color: #fff8f0;
    border-color: #563c2b;
  }

  .summary-highlight span {
    color: #e1cbb4;
  }

  .content-card {
    min-width: 0;
    padding: 26px;
    margin-bottom: 24px;
    background: #fff;
    border: 1px solid #e8ded1;
    border-radius: 16px;
    box-shadow: 0 5px 20px rgba(65, 43, 27, 0.035);
  }

  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    margin-bottom: 22px;
  }

  .section-heading h2 {
    margin: 0;
    font-size: 21px;
    color: #3d2c20;
  }

  .count-badge {
    flex-shrink: 0;
    padding: 7px 11px;
    background: #f3e9dd;
    color: #745139;
    border-radius: 30px;
    font-size: 12px;
    font-weight: 700;
  }

  .table-wrapper {
    width: 100%;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }

  th {
    padding: 14px 12px;
    background: #f8f3ed;
    color: #806b58;
    font-size: 11px;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    white-space: nowrap;
  }

  td {
    padding: 16px 12px;
    border-bottom: 1px solid #eee6dd;
    color: #655447;
    font-size: 13px;
    line-height: 1.6;
  }

  td strong {
    color: #3e2d21;
  }

  tbody tr:last-child td {
    border-bottom: none;
  }

  .status-badge {
    display: inline-block;
    padding: 6px 10px;
    border-radius: 30px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  .status-paid {
    background: #e1f2e6;
    color: #27633a;
  }

  .status-unpaid {
    background: #f8e9d8;
    color: #8a5424;
  }

  .status-pending {
    background: #f5edcf;
    color: #79601a;
  }

  .status-rejected {
    background: #f8dfdc;
    color: #963c33;
  }

  .payment-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
    align-items: start;
    gap: 24px;
  }

  .payment-layout > .content-card {
    margin-bottom: 24px;
  }

  .bank-details {
    padding: 20px;
    margin-bottom: 25px;
    background: #f8f3ed;
    border: 1px solid #e8d7c5;
    border-radius: 12px;
  }

  .bank-label {
    margin: 0 0 16px;
    color: #967354;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1.2px;
  }

  .bank-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 15px;
    padding: 12px 0;
    border-bottom: 1px solid #e8ded1;
    font-size: 13px;
  }

  .bank-row:last-of-type {
    border-bottom: none;
  }

  .bank-row span {
    color: #837264;
  }

  .bank-row strong {
    max-width: 65%;
    color: #3e2d21;
    text-align: right;
    overflow-wrap: anywhere;
  }

  .account-number {
    font-size: 16px;
    letter-spacing: 0.5px;
  }

  .bank-instructions {
    margin: 15px 0 0;
    padding-top: 14px;
    border-top: 1px solid #e8ded1;
    color: #776657;
    font-size: 13px;
    line-height: 1.7;
    white-space: pre-wrap;
  }

  .payment-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .payment-form label {
    display: flex;
    flex-direction: column;
    gap: 9px;
    color: #4b392b;
    font-size: 13px;
    font-weight: 700;
  }

  .payment-form input,
  .payment-form select {
    width: 100%;
    min-width: 0;
    min-height: 48px;
    padding: 12px 13px;
    border: 1px solid #ddcfc0;
    border-radius: 9px;
    background: #fff;
    color: #3e2d21;
    font: inherit;
    font-weight: 400;
    outline: none;
  }

  .payment-form input:focus,
  .payment-form select:focus {
    border-color: #936b49;
    box-shadow: 0 0 0 3px rgba(147, 107, 73, 0.12);
  }

  .payment-form input::placeholder {
    color: #a89a8c;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .balance-hint {
    margin: -8px 0 0;
    padding: 12px 14px;
    background: #f3e9dd;
    border-radius: 8px;
    color: #76543a;
    font-size: 13px;
  }

  .proof-note {
    margin: 0;
    color: #86776a;
    font-size: 12px;
    line-height: 1.7;
  }

  .submit-payment {
    width: 100%;
    min-height: 49px;
    padding: 13px 18px;
    border: none;
    border-radius: 9px;
    background: #563c2b;
    color: #fff8f0;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.2s ease, transform 0.2s ease;
  }

  .submit-payment:hover:not(:disabled) {
    background: #704d35;
    transform: translateY(-1px);
  }

  .submit-payment:disabled {
    background: #b8a99a;
    cursor: not-allowed;
    opacity: 0.8;
  }

  .alert {
    padding: 13px 15px;
    border-radius: 9px;
    font-size: 13px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .alert-error {
    background: #f9e6e2;
    color: #963c33;
    border: 1px solid #f0c9c3;
  }

  .alert-success {
    background: #e4f2e7;
    color: #27633a;
    border: 1px solid #c8e4cf;
  }

  .alert-warning {
    background: #f8efd9;
    color: #78591b;
    border: 1px solid #ead9ac;
  }

  .empty-state {
    padding: 25px 18px;
    background: #faf7f3;
    border: 1px dashed #dfd0c0;
    border-radius: 10px;
    text-align: center;
  }

  .empty-state h3 {
    margin: 0 0 9px;
    color: #4b392b;
    font-size: 16px;
  }

  .empty-state p,
  .muted-text {
    margin: 0;
    color: #847568;
    font-size: 13px;
    line-height: 1.7;
  }

  .submission-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .submission-item {
    padding: 16px;
    background: #faf7f3;
    border: 1px solid #eee3d7;
    border-radius: 10px;
  }

  .submission-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 12px;
  }

  .submission-top strong {
    color: #3e2d21;
    font-size: 17px;
  }

  .submission-item p {
    margin: 7px 0 0;
    color: #776657;
    font-size: 12px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .submission-id {
    color: #a09284 !important;
    font-size: 10px !important;
  }

  .loading-card {
    max-width: 420px;
    margin: 100px auto;
    padding: 35px;
    background: #fff;
    border: 1px solid #e8ded1;
    border-radius: 16px;
    text-align: center;
    color: #796c60;
  }

  .loader {
    width: 32px;
    height: 32px;
    margin: 0 auto 15px;
    border: 3px solid #e8ded1;
    border-top-color: #78543c;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 850px) {
    .payment-layout {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 650px) {
    .levies-page {
      padding: 24px 12px 40px;
    }

    .summary-grid {
      grid-template-columns: 1fr;
      gap: 12px;
    }

    .summary-card {
      padding: 20px;
    }

    .content-card {
      padding: 18px 14px;
    }

    .section-heading {
      align-items: flex-start;
    }

    .section-heading h2 {
      font-size: 18px;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .bank-row {
      flex-direction: column;
      gap: 5px;
    }

    .bank-row strong {
      max-width: 100%;
      text-align: left;
    }
  }
`;
