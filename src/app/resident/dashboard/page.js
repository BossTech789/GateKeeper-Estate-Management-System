"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

const dashboardItems = [
  {
    title: "Visitor Passes",
    description: "Generate and manage visitor access codes for your unit.",
    href: "/resident/visitor-passes",
    icon: "🎟️",
    action: "Manage Visitor Passes",
  },
  {
    title: "Submit a Complaint",
    description: "Report maintenance problems and other estate issues.",
    href: "/resident/complaints",
    icon: "🛠️",
    action: "Report an Issue",
  },
  {
    title: "My Complaints",
    description: "Track your submitted complaints and check their status.",
    href: "/resident/complaints/history",
    icon: "📋",
    action: "View Complaint History",
  },
  {
    title: "Levies",
    description: "View estate levy information and payment details.",
    href: "/resident/levies",
    icon: "💳",
    action: "View Levies",
  },
  {
    title: "Announcements",
    description: "Read important news and updates from estate management.",
    href: "/resident/announcements",
    icon: "📢",
    action: "Read Announcements",
  },
];

export default function ResidentDashboard() {
  const router = useRouter();

  const user = useSelector((state) => state.auth.user);
  const authStatus = useSelector((state) => state.auth.authStatus);
  const authError = useSelector((state) => state.auth.authError);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.replace("/login");
      return;
    }

    if (authStatus === "authenticated" && user) {
      if (user.role === "admin") {
        router.replace("/admin");
      } else if (user.role === "security") {
        router.replace("/security/dashboard");
      } else if (user.role !== "resident") {
        router.replace("/login");
      } else if (user.active !== true) {
        router.replace("/pending-approval");
      }
    }
  }, [authStatus, user, router]);

  async function handleSignOut() {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Sign-out error:", error);
    }
  }

  if (authStatus === "checking") {
    return (
      <main className="resident-loading">
        <div className="resident-loading-card">
          <div className="resident-spinner" />
          <p className="resident-loading-title">Checking your account...</p>
          <p className="resident-muted">
            Please wait while we load your profile.
          </p>
          {authError && <p className="resident-error">{authError}</p>}
        </div>

        <style jsx>{`
          .resident-loading {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            background: #f7f2eb;
            color: #3e2d22;
          }
          .resident-loading-card {
            width: 100%;
            max-width: 420px;
            padding: 36px;
            text-align: center;
            background: #fffdf9;
            border: 1px solid #e9ded1;
            border-radius: 20px;
            box-shadow: 0 12px 35px #4a30200d;
          }
          .resident-spinner {
            width: 36px;
            height: 36px;
            margin: 0 auto 20px;
            border: 3px solid #eadfd2;
            border-top-color: #805637;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          .resident-loading-title {
            font-size: 18px;
            font-weight: 700;
          }
          .resident-muted {
            margin-top: 8px;
            color: #806f61;
            font-size: 14px;
          }
          .resident-error {
            margin-top: 16px;
            color: #b42318;
          }
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="resident-error-page">
        <div className="resident-error-card">
          <h1>Unable to load your account</h1>
          <p>{authError}</p>
          <button onClick={handleSignOut}>Sign Out</button>
        </div>

        <style jsx>{`
          .resident-error-page {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            background: #f7f2eb;
          }
          .resident-error-card {
            max-width: 440px;
            padding: 36px;
            border: 1px solid #e9ded1;
            border-radius: 18px;
            background: #fffdf9;
            text-align: center;
          }
          h1 {
            font-size: 24px;
            font-weight: 800;
            color: #3e2d22;
          }
          p {
            margin-top: 12px;
            color: #806f61;
          }
          button {
            margin-top: 24px;
            padding: 12px 22px;
            border: 0;
            border-radius: 9px;
            background: #493326;
            color: white;
            font-weight: 700;
            cursor: pointer;
          }
        `}</style>
      </main>
    );
  }

  if (
    authStatus !== "authenticated" ||
    !user ||
    user.role !== "resident" ||
    user.active !== true
  ) {
    return (
      <main className="resident-loading">
        <p>Redirecting...</p>
        <style jsx>{`
          .resident-loading {
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f7f2eb;
            color: #5d4635;
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="resident-dashboard">
      <div className="resident-container">
        <header className="resident-header">
          <Link href="/resident/dashboard" className="resident-brand">
            <span className="resident-brand-icon">G</span>
            <span>
              <strong>GateKeeper</strong>
              <small>ESTATE MANAGEMENT</small>
            </span>
          </Link>

          <button
            onClick={handleSignOut}
            className="resident-signout"
          >
            Sign Out <span aria-hidden="true">↗</span>
          </button>
        </header>

        <section className="resident-welcome">
          <div className="resident-welcome-content">
            <span className="resident-eyebrow">
              YOUR RESIDENTIAL PORTAL
            </span>

            <h1>
              Welcome back,
              <br />
              <span>{user.name || "Resident"}.</span>
            </h1>

            <p>
              Manage your visitors, report estate issues, and stay
              connected with your estate community.
            </p>
          </div>

          <div className="resident-account-badge">
            <span className="resident-account-icon">✓</span>
            <span>
              <strong>Resident Account</strong>
              <small>Approved and active</small>
            </span>
          </div>
        </section>

        <section className="resident-account">
          <div>
            <span className="resident-section-label">ACCOUNT DETAILS</span>
            <h2>Your Account</h2>
          </div>

          <div className="resident-account-details">
            <div className="resident-detail">
              <span>Full Name</span>
              <strong>{user.name || "Resident"}</strong>
            </div>

            <div className="resident-detail">
              <span>Email Address</span>
              <strong>{user.email || "Not available"}</strong>
            </div>

            <div className="resident-detail">
              <span>Account Status</span>
              <strong className="resident-approved">● Approved</strong>
            </div>
          </div>
        </section>

        <section className="resident-services">
          <div className="resident-services-heading">
            <div>
              <span className="resident-section-label">QUICK ACCESS</span>
              <h2>Resident Services</h2>
            </div>
            <p>Everything you need to manage your estate life.</p>
          </div>

          <div className="resident-services-grid">
            {dashboardItems.map((item, index) => (
              <Link
                key={item.title}
                href={item.href}
                className="resident-service-card"
                style={{ "--card-index": index }}
              >
                <div className="resident-service-top">
                  <span className="resident-service-icon">
                    {item.icon}
                  </span>
                  <span className="resident-service-arrow">↗</span>
                </div>

                <h3>{item.title}</h3>
                <p>{item.description}</p>

                <span className="resident-service-action">
                  {item.action} <span aria-hidden="true">→</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <footer className="resident-footer">
          <span>GateKeeper Estate Management</span>
          <span>Resident Portal</span>
        </footer>
      </div>

      <style jsx>{`
        .resident-dashboard {
          min-height: 100vh;
          padding: 0 24px;
          background: #f7f3ed;
          color: #3e2d22;
        }

        .resident-container {
          max-width: 1180px;
          margin: 0 auto;
        }

        .resident-header {
          min-height: 90px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #e6d9ca;
        }

        .resident-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #3e2d22;
          text-decoration: none;
        }

        .resident-brand-icon {
          display: grid;
          width: 44px;
          height: 44px;
          place-items: center;
          border-radius: 13px;
          background: #563c2b;
          color: #fffaf4;
          font-size: 23px;
          font-weight: 800;
        }

        .resident-brand strong,
        .resident-brand small {
          display: block;
        }

        .resident-brand strong {
          font-size: 19px;
          letter-spacing: -0.5px;
        }

        .resident-brand small {
          margin-top: 3px;
          color: #927760;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1.6px;
        }

        .resident-signout {
          padding: 11px 17px;
          border: 1px solid #d9c7b5;
          border-radius: 9px;
          background: #fffdf9;
          color: #563c2b;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
        }

        .resident-signout:hover {
          background: #563c2b;
          color: white;
        }

        .resident-signout span {
          margin-left: 6px;
        }

        .resident-welcome {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 30px;
          margin-top: 35px;
          padding: 48px;
          overflow: hidden;
          border-radius: 24px;
          background: linear-gradient(125deg, #4c3425, #79583e);
          color: #fffaf4;
        }

        .resident-welcome::after {
          position: absolute;
          right: -70px;
          bottom: -160px;
          width: 360px;
          height: 360px;
          border: 1px solid #ffffff20;
          border-radius: 50%;
          box-shadow: 0 0 0 35px #ffffff08, 0 0 0 75px #ffffff06;
          content: "";
          pointer-events: none;
        }

        .resident-welcome-content {
          position: relative;
          z-index: 1;
          max-width: 620px;
        }

        .resident-eyebrow,
        .resident-section-label {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 2px;
        }

        .resident-eyebrow {
          color: #e7c5a2;
        }

        .resident-welcome h1 {
          margin-top: 17px;
          font-size: clamp(32px, 5vw, 49px);
          font-weight: 800;
          line-height: 1.13;
          letter-spacing: -1.5px;
        }

        .resident-welcome h1 span {
          color: #e7c5a2;
        }

        .resident-welcome-content > p {
          max-width: 500px;
          margin-top: 18px;
          color: #f0e5da;
          font-size: 14px;
          line-height: 1.9;
        }

        .resident-account-badge {
          position: relative;
          z-index: 1;
          display: flex;
          flex-shrink: 0;
          align-items: center;
          gap: 12px;
          padding: 15px 18px;
          border: 1px solid #ffffff25;
          border-radius: 14px;
          background: #ffffff0d;
        }

        .resident-account-icon {
          display: grid;
          width: 34px;
          height: 34px;
          place-items: center;
          border-radius: 50%;
          background: #d6ead2;
          color: #315e35;
          font-weight: 900;
        }

        .resident-account-badge strong,
        .resident-account-badge small {
          display: block;
        }

        .resident-account-badge strong {
          font-size: 12px;
        }

        .resident-account-badge small {
          margin-top: 5px;
          color: #e4d5c7;
          font-size: 11px;
        }

        .resident-account {
          margin-top: 30px;
          padding: 27px 30px;
          border: 1px solid #e9ded1;
          border-radius: 18px;
          background: #fffdf9;
        }

        .resident-section-label {
          color: #9a775b;
        }

        .resident-account h2,
        .resident-services-heading h2 {
          margin-top: 8px;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.5px;
        }

        .resident-account-details {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 22px;
          margin-top: 23px;
        }

        .resident-detail {
          min-width: 0;
        }

        .resident-detail > span,
        .resident-detail > strong {
          display: block;
          overflow-wrap: anywhere;
        }

        .resident-detail > span {
          margin-bottom: 8px;
          color: #8b7969;
          font-size: 12px;
        }

        .resident-detail > strong {
          color: #4b3627;
          font-size: 13px;
        }

        .resident-detail .resident-approved {
          color: #397345;
        }

        .resident-services {
          margin-top: 45px;
        }

        .resident-services-heading {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 22px;
        }

        .resident-services-heading > p {
          color: #8b7969;
          font-size: 12px;
        }

        .resident-services-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .resident-service-card {
          display: flex;
          min-height: 235px;
          flex-direction: column;
          align-items: flex-start;
          padding: 24px;
          border: 1px solid #e9ded1;
          border-radius: 17px;
          background: #fffdf9;
          color: #3e2d22;
          text-decoration: none;
          animation: card-enter 0.45s ease both;
          animation-delay: calc(var(--card-index) * 70ms);
          transition:
            transform 0.2s ease,
            border-color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .resident-service-card:hover {
          transform: translateY(-4px);
          border-color: #cdb49b;
          box-shadow: 0 12px 28px #4a30200d;
        }

        .resident-service-top {
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: space-between;
        }

        .resident-service-icon {
          display: grid;
          width: 48px;
          height: 48px;
          place-items: center;
          border-radius: 14px;
          background: #f1e7da;
          font-size: 23px;
        }

        .resident-service-arrow {
          color: #a58a72;
          font-size: 19px;
          transition: transform 0.2s;
        }

        .resident-service-card:hover .resident-service-arrow {
          transform: translate(3px, -3px);
        }

        .resident-service-card h3 {
          margin-top: 22px;
          font-size: 17px;
          font-weight: 800;
        }

        .resident-service-card > p {
          margin-top: 8px;
          color: #827164;
          font-size: 12px;
          line-height: 1.8;
        }

        .resident-service-action {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-top: auto;
          padding-top: 18px;
          color: #805637;
          font-size: 12px;
          font-weight: 800;
        }

        .resident-footer {
          display: flex;
          justify-content: space-between;
          gap: 15px;
          margin-top: 45px;
          padding: 22px 0;
          border-top: 1px solid #e6d9ca;
          color: #9a8777;
          font-size: 11px;
        }

        @keyframes card-enter {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 850px) {
          .resident-welcome {
            align-items: flex-start;
            flex-direction: column;
            padding: 34px;
          }

          .resident-account-details {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .resident-services-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 560px) {
          .resident-dashboard {
            padding: 0 14px;
          }

          .resident-header {
            min-height: 78px;
          }

          .resident-brand-icon {
            width: 39px;
            height: 39px;
          }

          .resident-brand strong {
            font-size: 16px;
          }

          .resident-signout {
            padding: 10px 12px;
          }

          .resident-welcome {
            margin-top: 22px;
            padding: 28px 22px;
            border-radius: 18px;
          }

          .resident-welcome h1 {
            font-size: 34px;
          }

          .resident-account {
            padding: 23px 20px;
          }

          .resident-account-details {
            grid-template-columns: 1fr;
            gap: 18px;
          }

          .resident-services {
            margin-top: 35px;
          }

          .resident-services-heading {
            align-items: flex-start;
            flex-direction: column;
            gap: 8px;
          }

          .resident-services-grid {
            grid-template-columns: 1fr;
            gap: 13px;
          }

          .resident-service-card {
            min-height: 210px;
          }

          .resident-footer {
            flex-direction: column;
            gap: 8px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .resident-service-card {
            animation: none;
            transition: none;
          }
        }
      `}</style>
    </main>
  );
}